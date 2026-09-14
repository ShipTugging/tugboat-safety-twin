"""Validate/encode a local recording; all timestamps come from its simulation grid."""
import csv
import hashlib
import json
import math
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image


SENSOR_FIELDS = ('timestamp_ms', 'ax_mps2', 'ay_mps2', 'az_mps2',
                 'gx_rad_s', 'gy_rad_s', 'gz_rad_s', 'roll_deg', 'pitch_deg', 'yaw_deg')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_jsonl(path):
    rows = []
    for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        try:
            row = json.loads(line)
            require(isinstance(row, dict), 'expected object')
            rows.append(row)
        except ValueError as exc:
            raise ValueError(f'{path}: line {number}: {exc}') from exc
    return rows


def validate_recording(directory, *, allow_captured=False):
    root = Path(directory)
    session = json.loads((root / 'session.json').read_text(encoding='utf-8'))
    allowed = ('captured', 'complete') if allow_captured else ('complete',)
    require(session.get('status') in allowed, f"Incomplete recording: status={session.get('status')}")
    for key, value in {'simulation_hz': 600, 'camera_fps': 24, 'imu_hz': 100,
                       'width': 1280, 'height': 720, 'timestamp_origin_ms': 0}.items():
        require(session.get(key) == value, f'Unexpected {key}: {session.get(key)}')
    duration = session['duration_ms']
    require(isinstance(duration, int) and 1000 <= duration <= 20000 and duration % 1000 == 0,
            'Invalid duration_ms')
    camera_count, imu_count = duration // 1000 * 24, duration // 10
    require(session['expected_camera_frames'] == camera_count, 'Manifest camera count mismatch')
    require(session['expected_imu_samples'] == imu_count, 'Manifest IMU count mismatch')
    rows = read_jsonl(root / 'camera_frames.jsonl')
    require(len(rows) == camera_count, f'Missing/extra frames: expected {camera_count}, got {len(rows)}')
    require(len({r['frame_index'] for r in rows}) == camera_count, 'Duplicate frame index')
    paths = set()
    for index, row in enumerate(rows):
        expected = f'frames/frame_{index:06}.jpg'
        require(row['frame_index'] == index, f'Frame ordering mismatch at {index}')
        require(row['image_path'] == expected, f'Frame path mismatch at {index}')
        require(row['simulation_tick'] == index * 25, f'Frame tick mismatch at {index}')
        timestamp = row['timestamp_ms']
        require(math.isfinite(timestamp) and abs(timestamp - index / 24 * 1000) < 1e-8,
                f'Camera timestamp grid mismatch at {index}')
        require(0 <= timestamp < duration, f'Frame timestamp outside interval at {index}')
        for key in ('session_id', 'sequence_id'):
            require(row[key] == session[key], f'Frame {key} mismatch at {index}')
        paths.add(expected)
        require(hashlib.sha256((root / expected).read_bytes()).hexdigest() == row['rgb_sha256'],
                f'RGB checksum mismatch: {expected}')
        with Image.open(root / expected) as image:
            require(image.size == (1280, 720) and image.mode == 'RGB' and image.format == 'JPEG',
                    f'Invalid RGB format: {expected}')
            image.load()
    actual = {f'frames/{p.name}' for p in (root / 'frames').iterdir()}
    require(actual == paths, f'Unexpected/missing frame files: {sorted(actual ^ paths)}')

    parsed = []
    for name in ('imu_raw.csv', 'imu_normalized.csv'):
        with (root / name).open(newline='', encoding='utf-8') as handle:
            reader = csv.DictReader(handle)
            fields = reader.fieldnames or []
            require(len(fields) == len(set(fields)), f'{name}: duplicate columns')
            require(set((*SENSOR_FIELDS, 'sequence_id')) <= set(fields), f'{name}: missing columns')
            imu_rows = list(reader)
        require(len(imu_rows) == imu_count, f'{name}: expected {imu_count} samples, got {len(imu_rows)}')
        numbers = []
        for index, row in enumerate(imu_rows):
            require(None not in row, f'{name}: extra values in row {index}')
            require(row['sequence_id'] == session['sequence_id'], f'{name}: sequence boundary mismatch')
            require(not row.get('frame_id'), f'{name}: continuous IMU must not be grouped by frame')
            values = {key: float(row[key]) for key in SENSOR_FIELDS}
            require(all(math.isfinite(v) for v in values.values()), f'{name}: non-finite sample {index}')
            require(abs(values['timestamp_ms'] - index * 10) < 1e-8, f'{name}: timestamp grid mismatch at {index}')
            numbers.append(values)
        parsed.append(numbers)
    require(parsed[0] == parsed[1], 'Preprocessing changed sensor values or sample order')
    # Shared ticks: full precision Euler orientation from the frame's exact rendered pose.
    for row in rows:
        if row['simulation_tick'] % 6 == 0:
            imu = parsed[0][row['simulation_tick'] // 6]
            for field, angle in zip(('pitch_deg', 'yaw_deg', 'roll_deg'), row['rotation_xyz_rad']):
                require(abs(imu[field] - angle * 180 / math.pi) < 1e-10,
                        f'Shared-pose orientation mismatch: frame {row["frame_index"]}, {field}')
    gaps = [min(abs(row['timestamp_ms'] - n*10) for n in
                (max(0, min(imu_count-1, math.floor(row['timestamp_ms']/10))),
                 max(0, min(imu_count-1, math.ceil(row['timestamp_ms']/10))))) for row in rows]
    return {'camera_frames': camera_count, 'imu_samples': imu_count, 'duration_ms': duration,
            'width': 1280, 'height': 720, 'camera_fps': 24, 'imu_hz': 100,
            'first_camera_timestamp_ms': rows[0]['timestamp_ms'],
            'last_camera_timestamp_ms': rows[-1]['timestamp_ms'],
            'first_imu_timestamp_ms': parsed[0][0]['timestamp_ms'],
            'last_imu_timestamp_ms': parsed[0][-1]['timestamp_ms'],
            'maximum_nearest_imu_gap_ms': max(gaps), 'raw_normalized_values_equal': True,
            'duplicate_rgb_files': len(rows)-len({row['rgb_sha256'] for row in rows}),
            'shared_tick_orientation_valid': True, 'frame_files_valid': True}


def validate_video(path, count, duration_sec):
    decoder = imageio_ffmpeg.read_frames(str(path), pix_fmt='rgb24')
    try:
        info = next(decoder)
        decoded = 0
        for frame in decoder:
            require(len(frame) == 1280*720*3, 'Decoded frame dimensions mismatch')
            decoded += 1
    finally:
        decoder.close()
    require(info['size'] == (1280, 720), 'Video resolution mismatch')
    require(abs(info['fps'] - 24) < .001, 'Video FPS mismatch')
    require(decoded == count, f'Video frame count mismatch: {decoded} != {count}')
    require(abs(info['duration'] - duration_sec) < .05, 'Video duration mismatch')
    return {'decoded_frames': decoded, 'width': 1280, 'height': 720,
            'fps': info['fps'], 'duration_sec': info['duration'], 'codec': info['codec']}


def encode_recording(directory):
    root = Path(directory)
    report = validate_recording(root, allow_captured=True)
    destination = root / 'camera.mp4'
    require(not destination.exists(), f'Refusing to overwrite {destination}')
    temporary = root / 'camera.partial.mp4'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-n',
                    '-framerate', '24', '-start_number', '0', '-i', str(root / 'frames/frame_%06d.jpg'),
                    '-frames:v', str(report['camera_frames']), '-c:v', 'libx264', '-preset', 'slow',
                    '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(temporary)], check=True)
    report['video'] = validate_video(temporary, report['camera_frames'], report['duration_ms']/1000)
    temporary.rename(destination)
    (root / 'recording_validation.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    return report
