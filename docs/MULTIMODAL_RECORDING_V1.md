# Multimodal Recording V1

Local/offline recording of one deterministic Three.js scenario: 1280×720 Camera
video at 24 FPS and ideal tug-body IMU at 100 Hz, both starting at simulation 0 ms.
It reuses the existing physics, camera/RGB capture, and `measureImu` implementations.
No Vision inference, synchronization, or new geometry/risk calculation runs during capture.

## Setup

Run from `tugboat-safety-twin`. Install the repository's Node dependencies with
`npm ci` if needed. The default browser is an installed Google Chrome; use
`--browser chromium` with a locally installed Playwright Chromium instead.

Use a Python interpreter with Pillow and imageio-ffmpeg:

```bash
python3 -m venv .venv-recording
.venv-recording/bin/python -m pip install Pillow imageio-ffmpeg
```

The adjacent `tugboat-safety_IMU/run_pipeline.py` is called as-is to validate raw
CSV and produce normalized CSV. Its source and existing outputs are not modified.
Pass `--python` explicitly for the recording environment; the fallback is the
adjacent model virtual environment, which must also have the encoder dependencies.

## Generate

First run the short smoke recording:

```bash
node --import tsx scripts/record-multimodal.mjs \
  --session-id smoke-001 --sequence-id recording-smoke-001 \
  --duration 2 --seed 2043 --python .venv-recording/bin/python
```

After it passes, run the complete scenario:

```bash
node --import tsx scripts/record-multimodal.mjs \
  --session-id run-001 --sequence-id recording-001 \
  --duration 20 --seed 2043 --python .venv-recording/bin/python
```

The default destination is `recordings/<session-id>/`. `--out /absolute/new/path`
overrides it. Existing output directories are always rejected. Use a new ID/path
to retry a failed run. Duration accepts whole seconds from 1 to 20; a short run
is the exact prefix of the full scenario, not a sped-up version of its motion.

The runner starts a loopback Vite server and a headless browser, renders frames
sequentially, runs IMU preprocessing, encodes MP4, and decodes it for validation.
It checks repeated rendering of the same first/last state after browser delays.
Any browser error or differing repeated image fails the recording.

## Clock and scenario

| Quantity | Schedule |
|---|---|
| Simulation | 600 Hz, one continuous PhysicsState, dt = 1/600 s |
| Camera | Every 25 ticks, timestamp = frame index / 24 × 1000 ms |
| IMU | Every 6 ticks, timestamp = sample index × 10 ms |
| Export interval | [0, duration_ms), with no 60000 ms offset |
| 2 seconds | 48 Camera frames, 200 IMU samples |
| 20 seconds | 480 Camera frames, 2000 IMU samples |

Time is computed from integer ticks. Browser frame scheduling, wall clock,
rendering delays and inference time never advance the recording clock. Camera
and IMU at a shared tick use the same telemetry object. Their nearest-time gap
is at most 5 ms on these grids.

The seeded `ahead_approach_return_v1` schedule smoothly changes existing steering
and tow distance parameters: hold at 36 m until 2 s, approach 20 m by 9 s, hold
until 11 s, return to 36 m by 18 s. It uses a day/clear-lens TUG_SAG_CAM scene.
The seed controls the initial and peak steering values; all actual parameters
and schedule values are stored in `session.json`.

Two seconds of prewarm and a future pose are integrated internally. IMU uses
the existing centered derivative over t−10 ms, t, t+10 ms. Prehistory and the
future endpoint are never exported. Roll/pitch/yaw come from full precision
Euler XYZ `[pitch,yaw,roll]`, not rounded telemetry display fields.

Ocean, foam, ship/tug radar and propeller animations receive explicit simulation
time in recording mode. Live mode and Dataset V2 keep their existing time behavior.

## Outputs

```text
recordings/run-001/
  session.json
  frames/frame_000000.jpg ...
  camera_frames.jsonl
  camera.mp4
  imu_raw.csv
  imu_normalized.csv
  imu_diagnostics.json
  render_validation.json
  recording_validation.json
```

`session.json` includes session/sequence IDs, duration, rates, dimensions, zero
timestamp origin, seed, scenario, sensor conventions, expected counts and status.
Status progresses from `generating` to `captured` to `complete`. Handled failures
record `failed` and the reason; abrupt termination can leave an incomplete state.
Only `complete` sessions should be consumed downstream.

`camera_frames.jsonl` contains one object per saved frame:

```json
{"session_id":"run-001","sequence_id":"recording-001","frame_index":0,"timestamp_ms":0,"simulation_tick":0,"image_path":"frames/frame_000000.jpg"}
```

Actual records also contain exact source position/rotation, capture camera pose/FOV,
and an RGB SHA-256 checksum for integrity checks. Frame index controls export order
and diagnostics only. Synchronization continues to match timestamps.

`imu_raw.csv` uses these columns:

```text
timestamp_ms,ax_mps2,ay_mps2,az_mps2,gx_rad_s,gy_rad_s,gz_rad_s,roll_deg,pitch_deg,yaw_deg,sequence_id
```

Normalized CSV is the existing preprocessing output with the same numeric values
and sequence ID; its legacy `frame_id` and `frame_timestamp_ms` columns are empty.
No per-camera IMU windows, frame grouping, resampling, filtering, or duplicate
endpoint samples are exported. All IMU rows belong to one recording sequence.

## Validate or encode

Read-only validation of a completed session:

```bash
.venv-recording/bin/python -B scripts/verify-recording.py \
  --recording-dir recordings/run-001
```

The runner already calls this encoder path after all frames/IMU are captured:

```bash
.venv-recording/bin/python -B scripts/encode-video.py \
  --recording-dir recordings/run-001
```

The encoder refuses to overwrite `camera.mp4`. Manual encoding does not mark a
failed/incomplete session complete. Running `encode-video.py` without arguments
retains the existing legacy 600-frame/30-FPS video behavior.

Validation checks the manifest, exact frame inventory and order, JPEG format and
checksum, timestamp grids, boundary IDs, finite sensor values, shared-tick
orientation, raw/normalized equality, and decoded MP4 dimensions/FPS/count/duration.
Exact repeated RGB files are reported; they are not automatically invalid in a
stationary scene. Raw IMU is ideal specific force: +X lateral, +Y up, +Z bow,
upright rest `[0,+9.80665,0]` m/s²; gyro is body angular velocity in rad/s.

## Downstream boundary

Vision V1 can process `camera.mp4` unchanged. Its zero-based 24-FPS timestamps
already agree with this recording. After running Vision separately, synchronize:

```bash
python3 ../tugboat-safety_IMU/run_sync.py \
  --vision /path/to/vision_output.jsonl \
  --imu recordings/run-001/imu_normalized.csv \
  --output recordings/run-001/synchronized.jsonl \
  --diagnostics recordings/run-001/sync_diagnostics.json \
  --sequence-id recording-001
```

`sequence_id` is the canonical boundary because current preprocessing preserves
it but not session ID. Do not inject only a session ID into Vision while IMU uses
only a sequence ID. Session IDs remain in the recording manifest/camera sidecar.
Towline angle and sag are downstream teammate responsibilities; curvature and
risk features are not part of this recording output.

## Tests and limitations

```bash
npm test
npx tsc --noEmit
.venv-recording/bin/python -B -m unittest discover -s tests -p 'test_recording_io.py' -v
../tugboat-safety_model/.venv/bin/python -B -m unittest discover -s tests -p 'test_dataset_v2_coverage.py' -v
```

`recording.test.ts` covers full/smoke clock grids, reproducibility, shared state,
continuous derivatives, precision, scenario motion and existing generator isolation.
`test_recording_io.py` tests bad/incomplete outputs, real MP4 encoding/decoding,
and the unmodified IMU preprocessing and synchronization implementations using
synthetic Vision records. It does not run YOLO.

This is an ideal kinematic simulator, not a hydrodynamic or hardware IMU model.
Existing physics and rope rendering retain their internal scene calculations;
the recorder adds no angle/sag/risk computation or labels. TUG_SAG_CAM uses the
existing attachment-targeting and FOV-fitting behavior, not a calibrated fixed
real camera. Deterministic numeric states do not guarantee byte-identical pixels
across different GPUs/browser versions. Images are processed sequentially; the
small numeric pose timeline is computed offline before rendering.
