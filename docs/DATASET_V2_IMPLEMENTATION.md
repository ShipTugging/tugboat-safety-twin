**Dataset V2 pilot implementation**

Implemented a separate positive-only V2 path using twin scenes, the existing Vision pixel renderer and the unchanged Python mask-to-polygon converter. Single class: 0=towline. Sag is metadata. No final YOLO TXT is produced by the twin generator. V1 UI/defaults/output paths are preserved. No model training or full 5,000-image generation was performed.

**Every changed or added source/config/test/documentation file**

| File | Why it changed |
|---|---|
| [.gitignore](../.gitignore) | Ignore raw/derived V2 runs and local QA artifacts. |
| [README.md](../README.md) | Make the V2 local command discoverable without changing V1 instructions. |
| [docs/DATASET_V2.md](../docs/DATASET_V2.md) | Document generation/preparation/validation commands, contracts, scene policy, dependencies and reproducibility. |
| [docs/DATASET_V2_IMPLEMENTATION.md](../docs/DATASET_V2_IMPLEMENTATION.md) | Record every changed file, exact pilot results, commands, validation and remaining limits. |
| [package-lock.json](../package-lock.json) | Lock the added development dependencies; existing runtime dependencies are preserved. |
| [package.json](../package.json) | Add local generation/QA/browser-test commands and direct Playwright/tsx development dependencies. |
| [scripts/dataset-v2-capture.html](../scripts/dataset-v2-capture.html) | Local capture page excluded from the production app entry. |
| [scripts/dataset-v2-capture.tsx](../scripts/dataset-v2-capture.tsx) | Use the existing Scene3D and readiness handshake with a local V2 handler and sequential filesystem sink. |
| [scripts/dataset-v2-mask-check.py](../scripts/dataset-v2-mask-check.py) | Read-only persistent mask preflight using the unchanged Python converter and installed Ultralytics resampling. Never saves labels or edits masks. |
| [scripts/dataset-v2-oracle.ts](../scripts/dataset-v2-oracle.ts) | Independent pixel oracle with a shader-deformed opaque occluder and updated uniforms; verify RGB/mask alignment and renderer restoration. |
| [scripts/dataset-v2-pass.ts](../scripts/dataset-v2-pass.ts) | Local-only adapter reusing the adjacent VisibleTowlinePass and measureCenterline. Production twin builds have no peer-project dependency. |
| [scripts/generate-dataset-v2.mjs](../scripts/generate-dataset-v2.mjs) | Playwright/Vite CLI, unique UUID run, fresh-output refusal, atomic per-file writes, runtime/git descriptors and sequential disk export. |
| [scripts/test-dataset-v2-browser.mjs](../scripts/test-dataset-v2-browser.mjs) | Run/save the analytic browser mask oracle. |
| [scripts/verify-dataset-v2.py](../scripts/verify-dataset-v2.py) | Audit format, IDs, parents/base geometry, duplicates, distributions, strict labels and real augmented YOLO-Seg loaders; save QA and contact grids. |
| [src/components/DatasetCaptureBridge.tsx](../src/components/DatasetCaptureBridge.tsx) | Add an optional V2 capture handler before legacy annotation code; V2 never runs approximate polygons. Legacy branches remain. |
| [src/components/LargeShip.tsx](../src/components/LargeShip.tsx) | Optional deterministic simulationTime for V2 radar/propeller animation; legacy delta animation remains. |
| [src/components/Scene3D.tsx](../src/components/Scene3D.tsx) | Pass the optional local V2 handler and freeze vessel equipment time only for V2. |
| [src/components/Tugboat.tsx](../src/components/Tugboat.tsx) | Optional deterministic simulationTime for V2 radar animation; legacy delta animation remains. |
| [src/dataset/lensRenderer.ts](../src/dataset/lensRenderer.ts) | Reuse the existing blur/wet-lens composition for PNG; preserve the JPEG wrapper and settings. |
| [src/dataset/types.ts](../src/dataset/types.ts) | Add optional typed V2 sample/frame payloads without changing V1 class definitions. |
| [src/dataset/v2/capture.ts](../src/dataset/v2/capture.ts) | Create compatible per-sample metadata and run-specific filenames; simulator quantities are marked synthetic. Geometry metrics are supplied by the existing Vision helper. |
| [src/dataset/v2/export.ts](../src/dataset/v2/export.ts) | Stream raw PNG/mask/metadata/manifest/CSV/rejections; preflight all masks, commit both related variants only after the whole parent passes. |
| [src/dataset/v2/scenarios.ts](../src/dataset/v2/scenarios.ts) | Bounded positive pilot config, parent-level split plan, disjoint seeds, signed steering and controlled camera/scene variants; disable automatic FOV fitting. |
| [tests/datasetV2.test.ts](../tests/datasetV2.test.ts) | Verify parent grouping, seed separation, reproducibility, fixed requested FOV, pilot/IoU guards, all-or-nothing retries and incomplete-run status. |
| [vite.config.ts](../vite.config.ts) | Deduplicate Three.js/React for the local adapter that imports the adjacent Vision renderer. |
| [../tugboat-safety_dataset/src/dataset/mask.ts](../../tugboat-safety_dataset/src/dataset/mask.ts) | Keep the V1 TowlineMaskPass API/metadata wrapper and delegate pixel rendering to the extracted helper. |
| [../tugboat-safety_dataset/src/dataset/visibleMask.ts](../../tugboat-safety_dataset/src/dataset/visibleMask.ts) | Extract the existing accurate V1 offscreen pixel renderer as one shared implementation, preserving water vertex deformation, alpha/depth and binary readback. |
| [../tugboat-safety_model/.gitignore](../../tugboat-safety_model/.gitignore) | Ignore model output/cache artifacts. |
| [../tugboat-safety_model/prepare_yolo_seg.py](../../tugboat-safety_model/prepare_yolo_seg.py) | Reject cross-split parent variants/run mismatches for optional V2 metadata, preserving V1 support and the unchanged polygon converter. Close CSV file handles. |
| [../tugboat-safety_model/tests/test_pipeline.py](../../tugboat-safety_model/tests/test_pipeline.py) | Add a regression fixture proving parent leakage fails before any derived output is created. |
| [../tugboat-safety_model/utils/common.py](../../tugboat-safety_model/utils/common.py) | Use the actual model directory for outputs/caches after the repository folder split, replacing the stale ai directory. |

The adjacent generator has only a renderer extraction; its configuration/scenario/export defaults were not modified. The core converter, existing strict thresholds and YOLO training hyperparameters were not changed. The optional V2 render handler is supplied only by the local script; the production application does not import peer renderer/geometry code.

**Pilot outputs**

- Raw: `towline_dataset_v2/pilot-120/`
- Derived: `towline_yolo_seg_v2/pilot-120/`
- QA: [report](../artifacts.local/v2-pilot/qa_report.md), [JSON](../artifacts.local/v2-pilot/qa_report.json), [grid](../artifacts.local/v2-pilot/representative_grid.png), [RGB/GT/overlay contact sheet](../artifacts.local/v2-pilot/contact_sheet.png).

Run `7582560b00fe42a5a0d7c0c9734024a2`, master seed 2043, 1280x720. 120 accepted images, 60 parents, exactly 84/24/12 train/val/test images and 42/12/6 parents. No RGB/mask duplicates or parent leakage. Two related variants retain base geometry and stay in one split.

- Day/sunset/night: 40/40/40. Clear/blurred/wet: 39/42/39.
- Astern/port/starboard/ahead: 30 each. Sag bins 0–4: 24 each. Signed steering: 60 positive, 60 negative.
- Mask pixels: 81–18,824, median 1,464. Visible fraction: .25–.98, median .885. Projected endpoint span: 100.896–1394.785px, median 282.829px. Full numeric/categorical distributions are in QA.
- All 120 masks converted; 141 polygons; 59 explicit contour repairs; 145 removed pixels and zero added pixels. Minimum direct IoU .985507246; mean .998792358.
- Actual Ultralytics resampling: minimum .985507246; mean .998711822. Source hashes unchanged.
- 41 rejected parent attempts: tiny mask 34, insufficient geometric visibility 36, insufficient span 1, degenerate polygon component 2. Reasons overlap; failed attempts and discarded siblings are not accepted images.

**Commands**

Run from `tugboat-safety-twin`. These are the commands used; choose fresh output names on a repeat run.

```sh
npm run dataset:v2 -- --count 120 --seed 2043 --out towline_dataset_v2/pilot-120
../tugboat-safety_model/.venv/bin/python ../tugboat-safety_model/prepare_yolo_seg.py --source towline_dataset_v2/pilot-120 --output towline_yolo_seg_v2/pilot-120 --expected-counts 84 24 12
../tugboat-safety_model/.venv/bin/python ../tugboat-safety_model/validate_yolo_seg.py --dataset towline_yolo_seg_v2/pilot-120 --report artifacts.local/v2-pilot/validation.json --overlay artifacts.local/v2-pilot/conversion.png
../tugboat-safety_model/.venv/bin/python scripts/verify-dataset-v2.py --source towline_dataset_v2/pilot-120 --dataset towline_yolo_seg_v2/pilot-120 --out artifacts.local/v2-pilot
```

**Validation**

- Twin build passed; 71 Node tests passed. Adjacent V1 build passed; 34 Node tests passed. Python: 5 tests passed. Both git diff checks passed.
- Existing V1 browser preview/single ZIP/custom resolution/folder mock/cancel/retry tests passed, with its original 208-white-pixel oracle and zero mismatches.
- V2 shader-occlusion oracle: 264/260 visible pixels, zero RGB/mask mismatches, 212 changed pixels when the deformation uniform changed, renderer/material state restored.
- Real YOLO-Seg train/val/test builders and all batches passed at 960px, mask_ratio=1, overlap_mask=false and baseline augmentation. 0 corrupt images, 0 backgrounds, 0 empty instance masks. All 141 stored polygons survived parsing.
- Current train_yolo_seg.py --dry-run passed: 84 train/24 val, test_used=false, no weights downloaded/loaded and no train call.
- Same-seed first 10 accepted RGB PNGs and masks are byte-identical across the pilot, replay and final adapter diagnostic, with no filename collisions. IDs/timestamps/paths intentionally differ.
- Twenty representative categories were visually inspected using grids and RGB/GT/overlay contact panels.

**Limits for approval review**

This is a pipeline pilot, not model performance evidence. The small test split lacks port and L4; parent-level stratified coverage should be added for full generation. Baseline training augmentation removed five small components in this loader pass; every image retained positive mask support. Native twin assets, optical approximations and simulator physics remain synthetic. Full generation and model training await approval.
