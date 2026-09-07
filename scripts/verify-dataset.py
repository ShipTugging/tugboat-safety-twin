"""Validate a downloaded TUG GUARD ZIP. Optional Pillow enables image checks.

python scripts/verify-dataset.py path/to/synthetic_tug_dataset.zip --count 100
python scripts/verify-dataset.py path/to/dataset.zip --preview preview.png
"""
import argparse
import io
import json
import math
import zipfile
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('archive', type=Path)
parser.add_argument('--count', type=int)
parser.add_argument('--preview', type=Path)
args = parser.parse_args()
try:
    from PIL import Image, ImageDraw, ImageStat
except ImportError:
    Image = None
    if args.preview:
        raise SystemExit('Preview requires Pillow: python -m pip install Pillow')

counts = Counter()
with zipfile.ZipFile(args.archive) as archive:
    metadata = json.loads(archive.read('metadata.json'))
    frames = metadata['frames']
    expected = args.count or metadata['count']
    assert len(frames) == expected
    images = sorted(n for n in archive.namelist() if n.startswith('images/') and n.endswith('.jpg'))
    labels = sorted(n for n in archive.namelist() if n.startswith('labels/') and n.endswith('.txt'))
    assert len(images) == len(labels) == expected
    assert [Path(n).stem for n in images] == [Path(n).stem for n in labels]
    assert archive.read('classes.txt').decode().splitlines() == ['Tugboat', 'Towline_Taut', 'Towline_Slack', 'Ship_Stern']
    samples = []
    empty = 0
    for index, frame in enumerate(frames):
        assert frame['image'] == f'images/frame_{index+1:04d}.jpg'
        assert frame['label'] == f'labels/frame_{index+1:04d}.txt'
        lines = archive.read(frame['label']).decode().splitlines()
        lines = [line for line in lines if line.strip()]
        assert len(lines) == len(frame['annotations'])
        parsed = []
        for line, annotation in zip(lines, frame['annotations']):
            values = line.split()
            assert len(values) == 5
            class_id = int(values[0])
            box = [float(v) for v in values[1:]]
            assert class_id in range(4) and class_id == annotation['classId']
            if class_id in (1, 2):
                taut = frame['telemetry']['lineTensionKn'] >= 320 or frame['telemetry']['girtingStatus'] == 'CRITICAL'
                assert class_id == (1 if taut else 2)
            assert all(math.isfinite(v) and 0 <= v <= 1 for v in box)
            x, y, w, h = box
            assert w > 0 and h > 0
            assert x-w/2 >= -1e-6 and x+w/2 <= 1+1e-6
            assert y-h/2 >= -1e-6 and y+h/2 <= 1+1e-6
            assert all(abs(v-annotation['box'][key]) <= 1e-6 for v, key in zip(box, ['xCenter', 'yCenter', 'width', 'height']))
            counts[class_id] += 1
            parsed.append((class_id, box))
        if not lines:
            empty += 1
        jpeg = archive.read(frame['image'])
        if frame['environment']['cameraMode'] in ('TUG_BRIDGE', 'TUG_AFT_DECK'):
            assert not any(c == 0 for c, _ in parsed), 'Ego tug must not receive a self-detection label'
        if frame['environment']['cameraMode'] == 'TUG_BRIDGE':
            assert frame['camera']['fov'] == 80
        assert jpeg[:2] == b'\xff\xd8' and jpeg[-2:] == b'\xff\xd9'
        if Image:
            image = Image.open(io.BytesIO(jpeg)).convert('RGB')
            assert image.size == (frame['width'], frame['height']) == (960, 540)
            assert max(ImageStat.Stat(image).stddev) > 1, f'Blank image: {frame["image"]}'
            if args.preview and index < 6:
                image = image.resize((480, 270))
                draw = ImageDraw.Draw(image)
                for class_id, (x, y, w, h) in parsed:
                    rect = [(x-w/2)*480, (y-h/2)*270, (x+w/2)*480, (y+h/2)*270]
                    draw.rectangle(rect, outline=['#50dbff', '#ffcb50', '#a1ed83', '#ff85d0'][class_id], width=2)
                    draw.text((max(0, rect[0]), max(0, rect[1])), str(class_id), fill='white')
                draw.text((8, 8), f'{index+1:04d} {frame["environment"]["cameraMode"]} {frame["environment"]["timeOfDay"]}', fill='white')
                samples.append(image)
    if samples:
        sheet = Image.new('RGB', (960, math.ceil(len(samples)/2)*270), '#10202b')
        for index, image in enumerate(samples):
            sheet.paste(image, ((index%2)*480, (index//2)*270))
        sheet.save(args.preview)
    print(json.dumps({'frames':len(frames), 'class_counts':dict(counts), 'empty_labels':empty, 'pixel_checks':bool(Image), 'seed':metadata['seed'], 'result':'PASS'}, ensure_ascii=False))
