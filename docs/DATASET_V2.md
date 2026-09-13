# Dataset V2 positive pilot

Class 0 is `towline`. Sag is simulator metadata, never a segmentation class.
This local CLI reuses twin scenes and the adjacent Vision generator's
`VisibleTowlinePass`. V1 UI export, V1 defaults and V1 output files are preserved.
No YOLO TXT is generated in the twin. The binary visible-tube mask is the source
of truth. Original occluder vertex shaders, alpha/depth behavior and water
wave deformation are retained. Readback is top-left PNG and explicitly 0/255.
RGB-only blur/wet droplets do not spatially warp the clean geometric mask.
Geometric visibility does not mean optical visibility through fog/droplets.

## Generate

From `tugboat-safety-twin` (adjacent dataset/model folders required):

```sh
npm ci
npm run dataset:v2 -- --count 120 --seed 2043 --out towline_dataset_v2/pilot-120
```

Requires Chrome (default) or Playwright Chromium (`--browser chromium`) and the
existing model Python environment. `--python` accepts an alternate environment.
The count guard permits even counts 10–5000. Coverage feasibility is checked before output creation; insufficient parent availability fails explicitly. Full generation still requires separate approval.
`--config` accepts JSON overrides of the exported v2Config; `--width/--height`
override 1280x720. Existing output directories are refused. Each run has a UUID,
which is also embedded in sample filenames to prevent collisions when merging.

Two related variants share parent geometry, rope appearance, simulation time
and a parent seed. Camera/time-of-day/lens vary. Parents are assigned to 70/20/10
splits before rendering: largest remainder gives requested parent quotas, then
scenario-level stratification guarantees marginal coverage. Never image-level
split. For 120 images there are 42/12/6 parents and 84/24/12 images.
Coverage includes all four tow positions, Sag L0–L4, three times of day, three
lens conditions and both steering signs in every split. Deterministic coverage
search assigns whole parents first, then fills quotas by marginal balance.
Coverage outranks ratios if quotas must be relaxed. Unavailable categories and
search limits fail explicitly. Accepted metadata is independently audited by QA.
All rejected retries stay in the same split, and both variants must pass before
the parent is committed. Unique legacy scenarioGroup is per sample; the separate
parent_scenario_id is the leakage unit. Exact requested Sag bins are checked.

Existing four tow sectors, signed steering, five Sag bins, rope radius/colors,
fog/waves, day/sunset/night and clear/blurred/wet lenses are used. Camera rotation
and translation ranges are wider; a subset uses a lower mount or fixed heading.
Automatic endpoint fitting/FOV enlargement is disabled. Difficult views can
crop or occlude the rope, but empty masks are rejected. No new 3D assets.

## Format

```text
images/{train,val,test}/sample_<run_uuid>_XXXXXX.png
masks/{train,val,test}/sample_<run_uuid>_XXXXXX_mask.png
metadata/{train,val,test}/sample_<run_uuid>_XXXXXX.json
generation_manifest.json
dataset_summary.csv
rejection_log.json
README_DATASET.md
runtime.json
```

The 1280x720 pilot PNG files are stored as 8-bit RGBA (four channels), for both
images and masks. Mask RGB channels are identical binary 0/255; mask alpha is
255. Existing preprocessing converts to RGB and reads one mask color channel.

Metadata keeps legacy preprocessing fields plus run/scenario/parent IDs, seeds,
pose/FOV, appearance, environmental/lens conditions, pixel bounds, centerline,
visibility and per-mask converter preflight. Simulator telemetry/physics are
explicitly marked synthetic, not measured sensor or physical ground truth.

## Prepare and validate (no model training)

```sh
../tugboat-safety_model/.venv/bin/python ../tugboat-safety_model/prepare_yolo_seg.py --source towline_dataset_v2/pilot-120 --output towline_yolo_seg_v2/pilot-120 --expected-counts 84 24 12
../tugboat-safety_model/.venv/bin/python ../tugboat-safety_model/validate_yolo_seg.py --dataset towline_yolo_seg_v2/pilot-120 --report artifacts.local/v2-pilot/validation.json --overlay artifacts.local/v2-pilot/conversion.png
../tugboat-safety_model/.venv/bin/python scripts/verify-dataset-v2.py --source towline_dataset_v2/pilot-120 --dataset towline_yolo_seg_v2/pilot-120 --out artifacts.local/v2-pilot
```

The original mask-to-polygon implementation and strict direct IoU >=0.98,
zero added foreground, positive-area/no-hole checks, and Ultralytics resampling
IoU >=0.98 are retained. The generator runs a read-only converter preflight on
every mask. Failures reject the entire parent attempt; masks are never eroded,
bridged or altered to satisfy the converter. Final labels are derived by the
existing prepare command and source/label hashes are independently validated.
QA creates distributions, duplicate/parent leakage checks, contact sheet and a
real Ultralytics training-loader check without invoking model.train().

Reproduction uses the same configuration/master seed; run UUIDs/paths/timestamps
intentionally change. Pixel equality is only expected on the same browser/GPU.
All geometry animations are frozen to simulation time for V2. Renderer quality
is recorded as high. Generated datasets and local QA artifacts are ignored.

The stratified re-validation run and exact commands are recorded in
[DATASET_V2_SPLIT_VALIDATION.md](DATASET_V2_SPLIT_VALIDATION.md).
