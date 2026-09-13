# Dataset V2 scenario-level split validation

The new 120-image pilot passes all required marginal coverage checks in train,
validation and test. Test now contains port (2 images) and Sag L4 (2 images).
No model was loaded or trained; no full 5,000-image run was generated.

Raw output: `towline_dataset_v2/pilot-120-stratified-v1/`.
Derived output: `towline_yolo_seg_v2/pilot-120-stratified-v1/`.
Run ID: `c9aa2ac52c354254982d51bfe84e6e3f`; seed: 2043.

## Files changed in this step

| File | Change |
|---|---|
| `src/dataset/v2/split.ts` (new) | Whole-parent coverage search, quota relaxation, deterministic marginal balancing and explicit feasibility errors. Shared variant category schedule. |
| `src/dataset/v2/scenarios.ts` | Delegate split membership to stratification, reuse unchanged variant categories, bump generator version. Count validation permits up to 5,000 for later use; default remains 120. |
| `src/dataset/v2/export.ts` | Describe stratification in the manifest split policy. Capture, acceptance and commit logic unchanged. |
| `scripts/generate-dataset-v2.mjs` | Preflight coverage before output creation/browser startup. |
| `scripts/verify-dataset-v2.py` | Require every requested category in every split using accepted metadata. Report coverage and actual PNG modes/dimensions. Keep leakage/base geometry and loader checks. |
| `tests/datasetV2.test.ts` | Coverage/reproducibility/availability tests across sizes and seeds; test ratio relaxation and preserve all-or-nothing retries. |
| `tests/test_dataset_v2_coverage.py` (new) | Complete-coverage fixture and 51 missing-category subcases (17 categories × 3 splits). |
| `docs/DATASET_V2.md` | Current stratification/count/PNG format documentation. |
| `docs/DATASET_V2_SPLIT_VALIDATION.md` (new) | This report, commands, results and limits. |

Accurate pixel rendering, lens rendering, scene physics, mask-to-polygon
conversion and model training code were not modified in this step.

## Algorithm

1. Retain the original indexed parent pool, physical condition assignments,
   parent/sample seed slots and two-variant schedule.
2. Compute each parent's condition vector from both variants. Tow position,
   Sag and steering are parent attributes; lens and time-of-day coverage is the
   union of the two existing variant categories.
3. Start with largest-remainder 70/20/10 parent quotas. Coverage requires at
   least five parents per split for the five Sag bins. A category needs at least
   three eligible parents globally. Fail before rendering with each missing
   category and eligible-parent count if availability is insufficient.
4. Backtrack on the most constrained missing split/category, ranking candidates
   by newly covered categories, marginal balance and seeded ties. Prune impossible
   slot/availability allocations. If exact quotas are infeasible, search with
   relaxed quotas, then restore counts as close to requested quotas as the
   selected coverage parents allow. An explicit search-budget error reports
   feasibility as undetermined rather than accepting an unverified plan.
5. Fill remaining slots using the increase in weighted marginal squared error
   against the global condition distribution. Assert final coverage and counts.
6. Render parents in their original order. Every retry remains in the parent's
   split; both variants must pass existing physical/mask/conversion checks before
   commit. QA independently checks coverage on accepted metadata, leakage and
   shared base geometry.

No Cartesian combinations or altered physics are required. For this pilot the
original 42/12/6 parent quotas remain feasible, yielding exactly 84/24/12 images.
Planner-only automated checks for 5,000 images give 3,500/1,000/500, with coverage
in every split. No images are rendered by those tests.

## Exact generation and QA commands

Run from `tugboat-safety-twin` using the existing Python environment. Output
paths must be fresh for another generation/preparation run.

```sh
npm run dataset:v2 -- --count 120 --seed 2043 --out towline_dataset_v2/pilot-120-stratified-v1
../tugboat-safety_model/.venv/bin/python -B ../tugboat-safety_model/prepare_yolo_seg.py --source towline_dataset_v2/pilot-120-stratified-v1 --output towline_yolo_seg_v2/pilot-120-stratified-v1 --expected-counts 84 24 12
../tugboat-safety_model/.venv/bin/python -B ../tugboat-safety_model/validate_yolo_seg.py --dataset towline_yolo_seg_v2/pilot-120-stratified-v1 --report artifacts.local/v2-pilot-stratified-v1/validation.json --overlay artifacts.local/v2-pilot-stratified-v1/conversion.png
../tugboat-safety_model/.venv/bin/python -B scripts/verify-dataset-v2.py --source towline_dataset_v2/pilot-120-stratified-v1 --dataset towline_yolo_seg_v2/pilot-120-stratified-v1 --out artifacts.local/v2-pilot-stratified-v1
../tugboat-safety_model/.venv/bin/python -B ../tugboat-safety_model/train_yolo_seg.py --mode baseline --dataset towline_yolo_seg_v2/pilot-120-stratified-v1 --seed 2043 --name v2-stratified-pilot-dry-run --dry-run
npm test
npm run build
../tugboat-safety_model/.venv/bin/python -B -m unittest discover -s tests -p 'test_dataset_v2_coverage.py'
npm run test:dataset-v2-browser
```

Existing model regression tests, run from `tugboat-safety_model`:

```sh
.venv/bin/python -B -m unittest discover -s tests
```

Local generation and browser QA used the approved sandbox escalation because
binding the local Vite server is blocked in the filesystem sandbox. The initial
sandbox attempt stopped before any frames were generated. Actual completed
output is the `pilot-120-stratified-v1` directory above.

## Coverage: accepted image counts

Numbers follow the category order printed in the first column.

| Category order | Train (84) | Val (24) | Test (12) |
|---|---|---|---|
| Tow: astern / port / starboard / ahead | 20 / 22 / 22 / 20 | 6 / 6 / 6 / 6 | 4 / 2 / 2 / 4 |
| Sag: L0 / L1 / L2 / L3 / L4 | 18 / 16 / 18 / 14 / 18 | 4 / 6 / 4 / 6 / 4 | 2 / 2 / 2 / 4 / 2 |
| Time: day / sunset / night | 28 / 28 / 28 | 7 / 8 / 9 | 5 / 4 / 3 |
| Lens: clear / blurred / wet | 25 / 32 / 27 | 9 / 7 / 8 | 5 / 3 / 4 |
| Steering: positive / negative | 42 / 42 | 12 / 12 | 6 / 6 |

## QA and comparison

| Check | Previous pilot | New pilot |
|---|---:|---:|
| Train / val / test | 84 / 24 / 12 | 84 / 24 / 12 |
| Parent leakage count | 0 | 0 |
| RGB duplicate count | 0 | 0 |
| Test port images | 0 | 2 |
| Test L4 images | 0 | 2 |
| Label conversion success / failure | 120 / 0 | 120 / 0 |
| Mean mask-to-polygon IoU | 0.9987923583531992 | 0.9987923583531992 |
| Minimum IoU | 0.9855072463768116 | 0.9855072463768116 |
| Added foreground pixels | 0 | 0 |
| Removed foreground pixels | 145 | 145 |
| Polygons / explicit contour repairs | 141 / 59 | 141 / 59 |
| Rejected parent attempts | 41 | 41 |
| Train augmentation removed components | 5 | 7 |

All 120 image/mask pairs remain 1280×720, 8-bit RGBA PNG. Mask R/G/B channels
are identical and contain only 0 and 255; mask alpha is uniformly 255. Class
0 remains towline; Sag remains metadata. No mask duplicates were found.

Ultralytics polygon resampling passes for all samples: mean IoU
0.9987118222007308, minimum 0.9855072463768116. Source hashes remain unchanged.
Real train/val/test loaders pass at 960px, mask_ratio=1, overlap_mask=false and
the existing baseline augmentation. All 141 stored polygons survive parsing
(100 train, 25 val, 16 test). Augmentation crops seven small train components,
leaving 93 train instances; no loaded image or instance mask is empty. There are
zero corrupt images and zero background-only images. The dry-run uses 84 train
and 24 val images, no test data, no loaded weights and no training call.

Rejected attempt reasons overlap:

- Tiny/empty positive mask: 34.
- Insufficient geometric centerline visibility: 36.
- Insufficient projected towline span: 1.
- Isolated one-pixel/linear polygon component: 2.

Tests: 75 Node tests, two new Python coverage tests including 51 gap subcases,
and five existing model regression tests pass. Twin production build passes
with its existing large-chunk warning. Existing browser mask oracle passes:
zero RGB/mask mismatches, 264/260 visible pixels, 212 deformation-changed pixels,
renderer state restored.

Same-seed comparison against the original pilot confirms all 120 RGB PNGs and
all 120 masks are byte-identical, with identical scenario/parent seeds and
accepted attempts. Fifty-two images (26 complete parents) change split; the
run IDs differ. This isolates the split improvement without changing sample
appearance. The final planner was also checked against all 120 captured split
assignments after adding the quota-relaxation regression case.

Artifacts:

- [QA JSON](../artifacts.local/v2-pilot-stratified-v1/qa_report.json)
- [QA Markdown](../artifacts.local/v2-pilot-stratified-v1/qa_report.md)
- [Resampling validation](../artifacts.local/v2-pilot-stratified-v1/validation.json)
- [Reproducibility/comparison](../artifacts.local/v2-pilot-stratified-v1/comparison.json)
- [Final planner check](../artifacts.local/v2-pilot-stratified-v1/split-plan-check.json)
- [Representative grid](../artifacts.local/v2-pilot-stratified-v1/representative_grid.png)
- [RGB / GT / overlay contact sheet](../artifacts.local/v2-pilot-stratified-v1/contact_sheet.png)

## Remaining limits before full generation

The missing marginal coverage blocker is resolved. No split, format, label or
loader failure remains. The 5,000-image planner is tested; an actual 5,000-image
capture/preparation/QA run has not been exercised and awaits approval. Default
sample count remains 120. Generation still rejects physically unreachable Sag
or inadequate views and fails an entire run if a parent exhausts retries.

The pilot demonstrates pipeline integrity, not real-world model performance.
Twelve test images provide coverage but little statistical support per condition.
Existing augmentation can crop small components, as explicitly counted above.
