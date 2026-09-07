"""Validate a downloaded TUG GUARD ZIP (detection boxes or towline sag segmentation).

python scripts/verify-dataset.py path/to/synthetic_tug_dataset.zip --count 100
python scripts/verify-dataset.py path/to/towline_sag_seg_dataset.zip --preview preview.png

Optional Pillow enables image checks, the preview sheet and polygon-vs-mask IoU.
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
parser.add_argument('--min-iou', type=float, default=0.45, help='sag only: minimum mean polygon-vs-mask IoU')
args = parser.parse_args()
try:
    from PIL import Image, ImageDraw, ImageStat
except ImportError:
    Image = None
    if args.preview:
        raise SystemExit('Preview requires Pillow: python -m pip install Pillow')

DETECTION_CLASSES = ['Tugboat', 'Towline_Taut', 'Towline_Slack', 'Ship_Stern']
SAG_CLASSES = ['Towline_Sag_L0', 'Towline_Sag_L1', 'Towline_Sag_L2', 'Towline_Sag_L3', 'Towline_Sag_L4', 'Ship_Stern']
SAG_THRESHOLDS = [0.006, 0.02, 0.04, 0.065]
PALETTE = ['#7ee0a8', '#c9e07e', '#f1d28e', '#f0a25e', '#f57b73', '#7fc7ff']


def level_of(ratio):
    level = 0
    while level < len(SAG_THRESHOLDS) and ratio >= SAG_THRESHOLDS[level]:
        level += 1
    return level


def polygon_mask(polygons, size):
    canvas = Image.new('1', size, 0)
    draw = ImageDraw.Draw(canvas)
    for polygon in polygons:
        draw.polygon([(x * size[0], y * size[1]) for x, y in polygon], fill=1)
    return canvas


counts = Counter()
with zipfile.ZipFile(args.archive) as archive:
    names = set(archive.namelist())
    metadata = json.loads(archive.read('metadata.json'))
    kind = metadata.get('kind', 'detection')
    frames = metadata['frames']
    expected = args.count or metadata['count']
    assert len(frames) == expected, f'{len(frames)} frames != {expected}'
    images = sorted(n for n in names if n.startswith('images/') and n.endswith('.jpg'))
    labels = sorted(n for n in names if n.startswith('labels/') and n.endswith('.txt'))
    assert len(images) == len(labels) == expected
    assert [Path(n).stem for n in images] == [Path(n).stem for n in labels]
    classes = SAG_CLASSES if kind == 'sag' else DETECTION_CLASSES
    assert archive.read('classes.txt').decode().splitlines() == classes
    assert list(metadata['classes']) == classes
    if kind == 'sag':
        assert 'data.yaml' in names and 'sag_labels.csv' in names
        csv_rows = archive.read('sag_labels.csv').decode().splitlines()
        assert csv_rows[0].startswith('image,mask,sag_level,sag_ratio_3d')
        assert len(csv_rows) - 1 == sum(1 for f in frames if 'sag' in f)
        masks = sorted(n for n in names if n.startswith('masks/') and n.endswith('.png'))
        assert masks == sorted(f['mask'] for f in frames if 'mask' in f)
    samples = []
    empty = 0
    ious = []
    level_truth = Counter()
    ratio_2d = []
    for index, frame in enumerate(frames):
        assert frame['image'] == f'images/frame_{index+1:04d}.jpg'
        assert frame['label'] == f'labels/frame_{index+1:04d}.txt'
        lines = [line for line in archive.read(frame['label']).decode().splitlines() if line.strip()]
        assert len(lines) == len(frame['annotations'])
        parsed = []
        for line, annotation in zip(lines, frame['annotations']):
            values = line.split()
            class_id = int(values[0])
            assert class_id in range(len(classes)) and class_id == annotation['classId']
            coords = [float(v) for v in values[1:]]
            assert all(math.isfinite(v) and -1e-6 <= v <= 1 + 1e-6 for v in coords)
            if kind == 'sag':
                assert len(coords) >= 6 and len(coords) % 2 == 0, 'YOLO-Seg polygon needs >= 3 vertices'
                polygon = list(zip(coords[0::2], coords[1::2]))
                assert len(polygon) == len(annotation['polygon'])
                assert all(abs(px - ax) <= 1e-6 and abs(py - ay) <= 1e-6 for (px, py), (ax, ay) in zip(polygon, annotation['polygon']))
                if class_id < 5:
                    assert class_id == frame['sag']['truth']['level'], 'rope class must equal the 3D sag level'
                parsed.append((class_id, polygon))
            else:
                assert len(coords) == 4
                x, y, w, h = coords
                assert w > 0 and h > 0
                assert x-w/2 >= -1e-6 and x+w/2 <= 1+1e-6 and y-h/2 >= -1e-6 and y+h/2 <= 1+1e-6
                assert all(abs(v-annotation['box'][key]) <= 1e-6 for v, key in zip(coords, ['xCenter', 'yCenter', 'width', 'height']))
                if class_id in (1, 2):
                    taut = frame['telemetry']['lineTensionKn'] >= 320 or frame['telemetry']['girtingStatus'] == 'CRITICAL'
                    assert class_id == (1 if taut else 2)
                parsed.append((class_id, coords))
            counts[class_id] += 1
        if not lines:
            empty += 1
        jpeg = archive.read(frame['image'])
        mode = frame['environment']['cameraMode']
        if mode in ('TUG_BRIDGE', 'TUG_AFT_DECK', 'TUG_SAG_CAM'):
            assert not any(c == 0 for c, _ in parsed) or kind == 'sag', 'Ego tug must not receive a self-detection label'
        if mode == 'TUG_BRIDGE':
            assert frame['camera']['fov'] == 80
        if kind == 'sag':
            assert mode == 'TUG_SAG_CAM', 'sag dataset must use the fixed tug camera'
            truth = frame['sag']['truth']
            assert truth['level'] == level_of(truth['sagRatio'])
            assert abs(truth['sagRatio'] - (truth['sagM'] / truth['spanM'] if truth['spanM'] else 0)) < 1e-6
            level_truth[truth['level']] += 1
            if frame['sag']['image']:
                ratio_2d.append((truth['sagRatio'], frame['sag']['image']['ratio']))
        assert jpeg[:2] == b'\xff\xd8' and jpeg[-2:] == b'\xff\xd9'
        if Image:
            image = Image.open(io.BytesIO(jpeg)).convert('RGB')
            assert image.size == (frame['width'], frame['height']) == (960, 540)
            assert max(ImageStat.Stat(image).stddev) > 1, f'Blank image: {frame["image"]}'
            mask = None
            if kind == 'sag' and 'mask' in frame:
                mask = Image.open(io.BytesIO(archive.read(frame['mask']))).convert('L')
                assert mask.size == image.size
                mask_bits = mask.point(lambda v: 255 if v > 127 else 0).convert('1')
                rope_polygons = [p for c, p in parsed if c < 5]
                if rope_polygons:
                    poly_bits = polygon_mask(rope_polygons, image.size)
                    a = set(i for i, v in enumerate(mask_bits.getdata()) if v)
                    b = set(i for i, v in enumerate(poly_bits.getdata()) if v)
                    if a or b:
                        ious.append(len(a & b) / len(a | b))
            if args.preview and index < 6:
                image = image.resize((480, 270))
                draw = ImageDraw.Draw(image, 'RGBA')
                for class_id, shape in parsed:
                    if kind == 'sag':
                        pts = [(x * 480, y * 270) for x, y in shape]
                        color = PALETTE[class_id]
                        draw.polygon(pts, outline=color, fill=color + ('22' if class_id == 5 else '88'))
                        draw.text((max(0, min(p[0] for p in pts)), max(0, min(p[1] for p in pts))), classes[class_id], fill='white')
                    else:
                        x, y, w, h = shape
                        rect = [(x-w/2)*480, (y-h/2)*270, (x+w/2)*480, (y+h/2)*270]
                        draw.rectangle(rect, outline=['#50dbff', '#ffcb50', '#a1ed83', '#ff85d0'][class_id], width=2)
                        draw.text((max(0, rect[0]), max(0, rect[1])), str(class_id), fill='white')
                caption = f'{index+1:04d} {mode} {frame["environment"]["timeOfDay"]}'
                if kind == 'sag':
                    caption += f' L{frame["sag"]["truth"]["level"]} r={frame["sag"]["truth"]["sagRatio"]:.3f}'
                draw.text((8, 8), caption, fill='white')
                if mask is not None:
                    thumb = mask.resize((120, 68))
                    image.paste(thumb.convert('RGB'), (480 - 124, 270 - 72))
                samples.append(image)
    if samples:
        sheet = Image.new('RGB', (960, math.ceil(len(samples)/2)*270), '#10202b')
        for index, image in enumerate(samples):
            sheet.paste(image, ((index%2)*480, (index//2)*270))
        sheet.save(args.preview)
    report = {'kind': kind, 'frames': len(frames), 'class_counts': dict(sorted(counts.items())), 'empty_labels': empty, 'pixel_checks': bool(Image), 'seed': metadata['seed']}
    if kind == 'sag':
        report['sag_level_counts'] = dict(sorted(level_truth.items()))
        if ious:
            report['polygon_mask_iou_mean'] = round(sum(ious) / len(ious), 4)
            report['polygon_mask_iou_min'] = round(min(ious), 4)
            assert report['polygon_mask_iou_mean'] >= args.min_iou, f'polygon/mask IoU too low: {report["polygon_mask_iou_mean"]}'
        if len(ratio_2d) > 2:
            xs = [a for a, _ in ratio_2d]; ys = [b for _, b in ratio_2d]
            mx, my = sum(xs)/len(xs), sum(ys)/len(ys)
            cov = sum((a-mx)*(b-my) for a, b in ratio_2d)
            var = math.sqrt(sum((a-mx)**2 for a in xs) * sum((b-my)**2 for b in ys))
            report['ratio_3d_vs_2d_corr'] = round(cov / var, 3) if var else None
    report['result'] = 'PASS'
    print(json.dumps(report, ensure_ascii=False))
