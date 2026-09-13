"""Encode the local 600-frame CCTV capture; requires imageio-ffmpeg and Pillow."""
import json
import subprocess
from pathlib import Path
import imageio_ffmpeg
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'artifacts.local' / 'towline-video'
records = []
for i in range(600):
    name = f'{i:04}'
    with Image.open(root / 'frames' / f'{name}.jpg') as im:
        assert im.size == (1280, 720), (i, im.size)
    data = json.loads((root / 'metadata' / f'{name}.json').read_text())
    assert abs(data['time_s'] - i / 30) < 1e-9
    assert data['sag']['visibleFraction'] >= .85, (i, data['sag'])
    records.append(data)
destination = root / 'towline_test_720p.mp4'
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
    'minimum_visible_rope_fraction': min(r['sag']['visibleFraction'] for r in records),
    'sag_m_range': [min(r['sag']['truth']['sagM'] for r in records), max(r['sag']['truth']['sagM'] for r in records)],
    'image_sag_ratio_range': [min(r['sag']['image']['ratio'] for r in records), max(r['sag']['image']['ratio'] for r in records)],
    'camera': 'TUG_SAG_CAM, same camera implementation as training dataset',
    'source': 'Three.js synthetic video, no model predictions or UI overlays',
    'phases': ['0-5s stable taut', '5-10s heading and separation change', '10-15s sag increases', '15-20s return toward stable']}
(root / 'video-validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
