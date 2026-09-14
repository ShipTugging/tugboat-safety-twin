import { Euler, Quaternion } from 'three';
import { measureImu, IMU_SPEC } from '../dataset/imu';
import { seededRandom } from '../dataset/environment';
import type { CaptureSample } from '../dataset/types';
import type { SimulationParams, TelemetryState } from '../types/maritime';
import { createPhysicsState, stepMaritimePhysics } from './physics';

export const RECORDING_CLOCK = {
  simulationHz: 600, cameraFps: 24, imuHz: 100,
  cameraTicks: 25, imuTicks: 6, prewarmTicks: 1200,
} as const;

export interface RecordingConfig {
  sessionId: string;
  sequenceId: string;
  durationSec: number;
  seed: number;
}

export function validateRecordingConfig(config: RecordingConfig) {
  for (const value of [config.sessionId, config.sequenceId]) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value))
      throw new Error('Recording IDs must be 1..80 letters, digits, underscores or hyphens');
  }
  if (!Number.isInteger(config.durationSec) || config.durationSec < 1 || config.durationSec > 20)
    throw new Error('Recording V1 duration must be an integer from 1 to 20 seconds');
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 4294967295)
    throw new Error('Recording seed must be a uint32');
}

/** Tick arithmetic, never an accumulated floating-point clock or browser time. */
export const recordingTimestampMs = (tick: number) => tick * 1000 / RECORDING_CLOCK.simulationHz;

export function recordingScenario(seed: number) {
  const random = seededRandom(seed);
  const initialSteeringDeg = 6 + random() * 2;
  const peakSteeringDeg = 20 + random() * 4;
  const base: SimulationParams = {
    tugSteeringAngle: initialSteeringDeg, towLineLength: 36, shipSpeed: 3, propellerRpm: 20,
    cameraMode: 'TUG_SAG_CAM', timeOfDay: 'day', quickReleaseActive: false,
    soundEnabled: false, fogDensity: .00015, towPosition: 'ahead', sunIntensity: 1,
    waveStrength: .25, cameraFov: 64, ropeRadius: .14, ropeColor: '#d8c4a0',
    lensCondition: 'clear', lensSeed: seed,
  };
  return {
    name: 'ahead_approach_return_v1', initialParams: base,
    schedule: { initialSteeringDeg, peakSteeringDeg, farDistanceM: 36, nearDistanceM: 20,
      approachStartSec: 2, approachEndSec: 9, returnStartSec: 11, returnEndSec: 18,
      interpolation: 'smoothstep u*u*(3-2*u)' },
  };
}

export function recordingParamsAt(scenario: ReturnType<typeof recordingScenario>, timeSec: number): SimulationParams {
  const smooth = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x*x*(3-2*x); };
  const s = scenario.schedule;
  const approach = smooth((timeSec-s.approachStartSec)/(s.approachEndSec-s.approachStartSec));
  const retreat = smooth((timeSec-s.returnStartSec)/(s.returnEndSec-s.returnStartSec));
  const fraction = approach-retreat;
  return { ...scenario.initialParams,
    tugSteeringAngle: s.initialSteeringDeg+(s.peakSteeringDeg-s.initialSteeringDeg)*fraction,
    towLineLength: s.farDistanceM+(s.nearDistanceM-s.farDistanceM)*fraction,
  };
}

export function recordingPose(telemetry: TelemetryState) {
  return { position: telemetry.tugPosition,
    quaternion: new Quaternion().setFromEuler(new Euler(...telemetry.tugRotation)).toArray() as [number,number,number,number] };
}

export const IMU_COLUMNS = ['timestamp_ms','ax_mps2','ay_mps2','az_mps2',
  'gx_rad_s','gy_rad_s','gz_rad_s','roll_deg','pitch_deg','yaw_deg','sequence_id'] as const;

/** One continuous state, including derivative prehistory and a future pose.
 * Existing physics/rope rendering remains responsible for the simulated scene.
 * This module exports only camera and sensor measurements, no geometry/risk features.
 */
export function generateRecording(config: RecordingConfig) {
  validateRecordingConfig(config);
  const clock = RECORDING_CLOCK, scenario = recordingScenario(config.seed);
  const state = createPhysicsState(), endTick = config.durationSec*clock.simulationHz;
  const timeline = new Map<number, { params: SimulationParams; telemetry: TelemetryState }>();
  for (let tick = -clock.prewarmTicks; tick <= endTick; tick++) {
    const timestamp = recordingTimestampMs(tick);
    const params = recordingParamsAt(scenario, timestamp/1000);
    const telemetry = stepMaritimePhysics(params, state, 1/clock.simulationHz, timestamp);
    if (tick >= -clock.imuTicks) timeline.set(tick, {params, telemetry});
  }
  const camera = Array.from({length: config.durationSec*clock.cameraFps}, (_, index) => {
    const tick = index*clock.cameraTicks, {params, telemetry} = timeline.get(tick)!;
    const sample: CaptureSample = {id: `video:recording:${config.sessionId}:${index}`, index,
      kind: 'sag', params, telemetry, time: telemetry.timestamp/1000, width: 1280, height: 720};
    return {tick, sample, sidecar: {
      session_id: config.sessionId, sequence_id: config.sequenceId, frame_index: index,
      timestamp_ms: index/clock.cameraFps*1000, simulation_tick: tick,
      image_path: `frames/frame_${String(index).padStart(6,'0')}.jpg`,
      position_world_m: [...telemetry.tugPosition], rotation_xyz_rad: [...telemetry.tugRotation],
    }};
  });
  const imu = Array.from({length: config.durationSec*clock.imuHz}, (_, index) => {
    const tick = index*clock.imuTicks, telemetry = timeline.get(tick)!.telemetry;
    const measurement = measureImu(recordingPose(timeline.get(tick-clock.imuTicks)!.telemetry),
      recordingPose(telemetry), recordingPose(timeline.get(tick+clock.imuTicks)!.telemetry), 1/clock.imuHz);
    const [ax,ay,az] = measurement.accelerometerMps2, [gx,gy,gz] = measurement.gyroscopeRadS;
    const [pitch,yaw,roll] = telemetry.tugRotation.map(v => v*180/Math.PI);
    return {tick, telemetry, row: {timestamp_ms: recordingTimestampMs(tick),
      ax_mps2: ax, ay_mps2: ay, az_mps2: az, gx_rad_s: gx, gy_rad_s: gy, gz_rad_s: gz,
      roll_deg: roll, pitch_deg: pitch, yaw_deg: yaw, sequence_id: config.sequenceId}};
  });
  const session = {
    schema_version: 1, session_id: config.sessionId, sequence_id: config.sequenceId,
    duration_ms: config.durationSec*1000, simulation_hz: clock.simulationHz,
    camera_fps: clock.cameraFps, imu_hz: clock.imuHz, width: 1280, height: 720,
    timestamp_origin_ms: 0, seed: config.seed, scenario,
    expected_camera_frames: camera.length, expected_imu_samples: imu.length,
    interval: '[0, duration_ms)', prewarm_ms: 2000, derivative_half_window_ms: 10,
    imu: {source: IMU_SPEC.source, sensor_frame: IMU_SPEC.sensorFrame,
      accelerometer: IMU_SPEC.accelerometer, gyroscope: IMU_SPEC.gyroscope, rotation: IMU_SPEC.rotation,
      limitations: IMU_SPEC.limitations},
    boundary: 'sequence_id is canonical through the existing IMU preprocessing and synchronization pipeline',
    camera_policy: 'Existing applyDatasetCamera/TUG_SAG_CAM; attachment-fit FOV may increase beyond configured FOV',
  };
  return {session, camera, imu};
}

export function recordingImuCsv(imu: ReturnType<typeof generateRecording>['imu']) {
  return [IMU_COLUMNS.join(','), ...imu.map(({row}) => IMU_COLUMNS.map(key => row[key]).join(','))].join('\n')+'\n';
}
