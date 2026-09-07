"""Compute the towline SagRatio from a binary rope mask (Notion 1st-goal formula).

    SagRatio = MaximumDeviation / EndpointDistance

The mask may come from the simulator ZIP (masks/frame_XXXX.png) or from a
YOLO-Seg prediction rasterised to the image size. The centerline is estimated
per image column (or row when the rope is steeper than 45 degrees) as the mean
of rope pixels, then the two extreme points form the chord and the largest
perpendicular distance of the centerline from that chord is the deviation.

python scripts/sag_from_mask.py masks/frame_0001.png
python scripts/sag_from_mask.py towline_sag_seg_dataset.zip --compare        # every frame vs. metadata truth
python scripts/sag_from_mask.py towline_sag_seg_dataset.zip --compare --csv out.csv
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
import zipfile
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit('Requires numpy and Pillow: python -m pip install numpy Pillow') from exc

LEVEL_THRESHOLDS = [0.006, 0.02, 0.04, 0.065]


def classify(ratio: float) -> int:
    level = 0
    while level < len(LEVEL_THRESHOLDS) and ratio >= LEVEL_THRESHOLDS[level]:
        level += 1
    return level


def load_mask(data: bytes | Path) -> np.ndarray:
    image = Image.open(io.BytesIO(data) if isinstance(data, bytes) else data).convert('L')
    return np.asarray(image) > 127


def centerline(mask: np.ndarray) -> np.ndarray:
    """Return N x 2 (x, y) centerline points ordered along the dominant axis."""
    ys, xs = np.nonzero(mask)
    if xs.size < 2:
        return np.empty((0, 2))
    horizontal = (xs.max() - xs.min()) >= (ys.max() - ys.min())
    primary, secondary = (xs, ys) if horizontal else (ys, xs)
    order = np.argsort(primary, kind='stable')
    primary, secondary = primary[order], secondary[order]
    keys, starts = np.unique(primary, return_index=True)
    means = np.add.reduceat(secondary.astype(float), starts) / np.diff(np.append(starts, secondary.size))
    points = np.stack([keys, means], axis=1) if horizontal else np.stack([means, keys], axis=1)
    return points


def sag_ratio(points: np.ndarray) -> dict:
    if len(points) < 2:
        return {'ratio': math.nan, 'deviation_px': math.nan, 'chord_px': math.nan, 'level': None}
    a, b = points[0], points[-1]
    chord = float(np.hypot(*(b - a)))
    if chord < 1e-6:
        return {'ratio': math.nan, 'deviation_px': math.nan, 'chord_px': chord, 'level': None}
    deviation = np.abs((points[:, 0] - a[0]) * (b[1] - a[1]) - (points[:, 1] - a[1]) * (b[0] - a[0])) / chord
    ratio = float(deviation.max() / chord)
    return {'ratio': ratio, 'deviation_px': float(deviation.max()), 'chord_px': chord, 'level': classify(ratio)}


def analyse_mask(mask: np.ndarray) -> dict:
    result = sag_ratio(centerline(mask))
    result['rope_pixels'] = int(mask.sum())
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('source', type=Path, help='mask PNG or dataset ZIP')
    parser.add_argument('--compare', action='store_true', help='ZIP only: compare with metadata.json truth')
    parser.add_argument('--csv', type=Path, help='write per-frame results')
    args = parser.parse_args()

    if args.source.suffix.lower() != '.zip':
        print(json.dumps(analyse_mask(load_mask(args.source)), indent=2))
        return 0

    rows = []
    with zipfile.ZipFile(args.source) as archive:
        metadata = json.loads(archive.read('metadata.json'))
        if metadata.get('kind') != 'sag':
            raise SystemExit('This ZIP is not a sag segmentation dataset (metadata.kind != "sag").')
        for frame in metadata['frames']:
            if 'mask' not in frame:
                continue
            estimate = analyse_mask(load_mask(archive.read(frame['mask'])))
            truth = frame.get('sag', {})
            rows.append({
                'image': frame['image'],
                'truth_level': truth.get('truth', {}).get('level'),
                'truth_ratio_3d': truth.get('truth', {}).get('sagRatio'),
                'truth_ratio_2d': (truth.get('image') or {}).get('ratio'),
                'mask_ratio': estimate['ratio'],
                'mask_level_from_2d': estimate['level'],
                'rope_pixels': estimate['rope_pixels'],
                'visible_fraction': truth.get('visibleFraction'),
            })
    if not rows:
        raise SystemExit('No masks found in the archive.')
    if args.csv:
        with args.csv.open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        print(f'wrote {args.csv} ({len(rows)} rows)')
    if args.compare:
        paired = [(r['truth_ratio_2d'], r['mask_ratio']) for r in rows if r['truth_ratio_2d'] is not None and not math.isnan(r['mask_ratio'])]
        if paired:
            truth = np.array([p[0] for p in paired])
            mask = np.array([p[1] for p in paired])
            error = np.abs(truth - mask)
            corr = float(np.corrcoef(truth, mask)[0, 1]) if len(paired) > 2 and truth.std() > 0 and mask.std() > 0 else math.nan
            print(f'frames with masks: {len(rows)} | compared: {len(paired)}')
            print(f'mask-vs-centerline 2D ratio: mean abs error {error.mean():.4f}, max {error.max():.4f}, corr {corr:.3f}')
            empty = sum(1 for r in rows if r['rope_pixels'] == 0)
            print(f'empty masks (rope fully hidden): {empty}')
            print('Note: the 3D truth ratio is view-independent; image ratios depend on the camera and are what a model sees.')
        levels = {}
        for r in rows:
            levels[r['truth_level']] = levels.get(r['truth_level'], 0) + 1
        print('truth level counts:', dict(sorted(levels.items(), key=lambda kv: (kv[0] is None, kv[0]))))
    else:
        for r in rows[:10]:
            print(r)
        if len(rows) > 10:
            print(f'... {len(rows) - 10} more (use --csv)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
