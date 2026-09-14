"""Encode the local 600-frame CCTV capture; requires imageio-ffmpeg and Pillow."""
import json
import subprocess
from pathlib import Path
import imageio_ffmpeg
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'artifacts.local' / 'towline-video-ahead'

def encode_legacy():
    records = []
    for i in range(600):
        name = f'{i:04}'
        with Image.open(root / 'frames' / f'{name}.jpg') as im:
            assert im.size == (1280, 720), (i, im.size)
        data = json.loads((root / 'metadata' / f'{name}.json').read_text())
        assert abs(data['time_s'] - i / 30) < 1e-9
        records.append(data)
    assert records[0]['tow_position'] == 'ahead'
    assert records[0]['distance_m'] > records[300]['distance_m'] < records[450]['distance_m']
    assert records[0]['sag']['truth']['sagM'] < records[300]['sag']['truth']['sagM'] > records[450]['sag']['truth']['sagM']
    destination = root / 'towline_ahead_distance_test_720p.mp4'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y',
        '-framerate', '30', '-i', str(root / 'frames' / '%04d.jpg'),
        '-frames:v', '600', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(destination)], check=True)
    decoder = imageio_ffmpeg.read_frames(str(destination), pix_fmt='rgb24')
    info = next(decoder)
    count = sum(1 for _ in decoder)
    assert count == 600, count
    assert info['size'] == (1280, 720), info
    assert abs(info['fps'] - 30) < .001 and abs(info['duration'] - 20) < .05, info
    report = {'file': destination.name, 'decoded_frames': count, 'video': info,
        'minimum_visible_rope_fraction': min((r['sag']['visibleFraction'] for r in records if r['sag']['visibleFraction'] is not None), default=None),
        'visibility_note': 'Lightweight video capture skips pixel-mask ray probes; visual framing was checked at 0, 5, 10 and 15 seconds.',
        'sag_m_range': [min(r['sag']['truth']['sagM'] for r in records), max(r['sag']['truth']['sagM'] for r in records)],
        'image_sag_ratio_range': None,
        'rendered_truth_sag_ratio_range': [min(r['sag']['truth']['sagRatio'] for r in records), max(r['sag']['truth']['sagRatio'] for r in records)],
        'camera': 'TUG_SAG_CAM, same camera implementation as training dataset',
        'tow_position': 'ahead',
        'distance_m_range': [min(r['distance_m'] for r in records), max(r['distance_m'] for r in records)],
        'relationship': 'tow distance decreases 36m→15m while sag increases, then distance increases while sag collapses',
        'source': 'Three.js synthetic video, no model predictions or UI overlays',
        'phases': ['0-5s far and taut', '5-10s approach while sag increases', '10-15s retreat while sag collapses', '15-20s far and stable']}
    (root / 'video-validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Encode legacy CCTV or Multimodal Recording V1')
    parser.add_argument('--recording-dir', type=Path)
    args = parser.parse_args()
    if args.recording_dir is None:
        encode_legacy()
    else:
        from recording_io import encode_recording
        try:
            print(json.dumps(encode_recording(args.recording_dir), indent=2))
        except (OSError, ValueError, KeyError) as exc:
            parser.exit(1, f'Recording encoding failed: {exc}\n')
