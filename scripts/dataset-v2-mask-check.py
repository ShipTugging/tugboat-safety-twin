#!/usr/bin/env python3
"""Read-only mask preflight using the unchanged Vision converter/rasterizer.

JSON-lines worker for the local generator. Never saves labels or edits masks.
"""
import base64
import contextlib
import io
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tugboat-safety_model'))
with contextlib.redirect_stdout(sys.stderr):
    import numpy as np
    from PIL import Image
    from utils.common import configure_runtime, binary_counts, pixel_metrics
    from utils.polygons import mask_to_labels, parse_labels
    configure_runtime()
    from ultralytics.data.utils import polygon2mask
    from ultralytics.utils.ops import resample_segments

for line in sys.stdin:
    try:
        request = json.loads(line)
        with Image.open(io.BytesIO(base64.b64decode(request['png'].split(',')[1]))) as image:
            a = np.asarray(image.convert('RGB'))
        if not np.array_equal(a[:, :, 0], a[:, :, 1]) or not np.array_equal(a[:, :, 0], a[:, :, 2]) or not set(np.unique(a)) <= {0, 255}:
            raise ValueError('Mask is not explicitly binary grayscale')
        mask = a[:, :, 0] == 255
        minimum = request['minimum_iou']
        if not .98 <= minimum <= 1:
            raise ValueError('Minimum polygon IoU must remain >= .98')
        text, reconstructed, metrics = mask_to_labels(mask, minimum)
        polygons = parse_labels(text)
        h, w = mask.shape
        actual = np.zeros(mask.shape, dtype=bool)
        count = max(1000, max(map(len, polygons)) + 1)
        for polygon in polygons:
            points = resample_segments([polygon.copy()], n=count)[0] * np.array([w, h], dtype=np.float32)
            actual |= polygon2mask(mask.shape, [points.reshape(-1)], 1).astype(bool)
        resampled = pixel_metrics(binary_counts(actual, mask))['iou']
        if resampled < minimum:
            raise ValueError(f'Ultralytics resampling IoU {resampled:.9f} below {minimum}')
        result = {'ok': True, **metrics, 'resampled_iou': resampled}
    except Exception as error:
        result = {'ok': False, 'reason': str(error)}
    print(json.dumps(result), flush=True)
