import * as THREE from 'three';
import type { SimulationParams, TelemetryState, RiskLevel } from '../types/maritime';

/** Integration memory belongs to one simulation, never to a global singleton. */
export interface PhysicsState {
  previousDistance: number;
  prevRoll: number;
  smoothedRoll: number;
}

export function createPhysicsState(): PhysicsState {
  return { previousDistance: 14.2, prevRoll: 0, smoothedRoll: 0 };
}

export function createInitialTelemetry(now = Date.now()): TelemetryState {
  return {
    timestamp: now,
    tugPosition: [16, 0.4, -42],
    tugRotation: [0, 0, 0],
    shipPosition: [0, 0, 0],
    lineStartPoint: [3.2, 2.5, -34],
    lineEndPoint: [16, 1.8, -40],
    lineAngleDeg: 18,
    imuRollDeg: 2.1,
    imuPitchDeg: 0.5,
    imuRollRateDegS: 0.2,
    lineTensionKn: 125,
    girtingRiskPct: 15,
    girtingStatus: 'SAFE',
    inWashZone: false,
    washTurbulencePct: 0,
    washStatus: 'CLEAR',
    turbulenceJitter: [0, 0, 0],
    hullDistanceM: 14.2,
    closingRateMs: 0.1,
    suctionRiskPct: 12,
    suctionForceKn: 15,
    suctionStatus: 'SAFE',
    emergencyReleaseTriggered: false,
    aiDetectionConfidence: 99.4,
  };
}

/** Deterministic step: updates only the supplied integration memory. */
export function stepMaritimePhysics(
  params: SimulationParams,
  state: PhysicsState,
  delta: number,
  now: number,
): TelemetryState {
  const dt = Math.min(0.1, Math.max(0.001, delta));

  // Ship motion reference frame (ship at origin or slowly bobbing)
  const shipPos: [number, number, number] = [0, Math.sin(now * 0.001) * 0.15, 0];

  // Towing chock on ship's starboard quarter
  const shipChock: [number, number, number] = [3.5, 2.6 + shipPos[1], -34];

  // Calculate tugboat position based on towline length & steering angle
  const steerRad = (params.tugSteeringAngle * Math.PI) / 180;

  // Base towing trajectory:
  // Tug floats behind the ship at distance approx towLineLength, swung by steering angle
  const baseDistance = Math.max(12, params.towLineLength);

  // Lateral offset driven by steering angle and towing dynamics
  const lateralSwing = Math.sin(steerRad) * (baseDistance * 0.85);
  const longitudinalOffset = -Math.cos(steerRad * 0.7) * baseDistance - 34;

  // Tugboat target position in 3D space
  const targetX = 3.5 + lateralSwing;
  const targetY = 0.5 + Math.sin(now * 0.002) * 0.18;
  const targetZ = longitudinalOffset;

  // Propeller Wash Evaluation
  // Propeller wake zone: extends behind ship from Z=-35 to Z=-90, centered at X=0, radius expanding
  const washOriginZ = -35;
  const distBehindWash = washOriginZ - targetZ;
  const washRadius = Math.max(2.5, 3.0 + distBehindWash * 0.22);
  const radialDistFromWakeCenter = Math.sqrt(targetX * targetX);

  let inWash = false;
  let washTurbulence = 0;
  let washStatus: 'CLEAR' | 'MARGINAL' | 'SEVERE_INGRESS' = 'CLEAR';
  const jitter: [number, number, number] = [0, 0, 0];

  if (distBehindWash > 0 && distBehindWash < 55 && radialDistFromWakeCenter < washRadius) {
    inWash = true;
    const wakeIntensity = (1 - radialDistFromWakeCenter / washRadius);
    washTurbulence = Math.min(100, Math.round(wakeIntensity * (params.propellerRpm / 120) * 100));

    if (washTurbulence > 65) {
      washStatus = 'SEVERE_INGRESS';
    } else if (washTurbulence > 20) {
      washStatus = 'MARGINAL';
    }

    // Add high-frequency stochastic turbulence jitter to tugboat
    const turbFactor = (washTurbulence / 100);
    jitter[0] = (Math.sin(now * 0.035) + Math.cos(now * 0.047)) * 0.22 * turbFactor;
    jitter[1] = (Math.cos(now * 0.028) + Math.sin(now * 0.053)) * 0.18 * turbFactor;
    jitter[2] = Math.sin(now * 0.041) * 0.15 * turbFactor;
  }

  const tugPos: [number, number, number] = [
    targetX + jitter[0],
    targetY + jitter[1],
    targetZ + jitter[2],
  ];

  // Tugboat towing staple (on the bow / forward deck of ASD tug)
  const tugHeadingYaw = steerRad * 0.85;
  const stapleOffsetLocal: [number, number, number] = [
    Math.sin(tugHeadingYaw) * 3.5,
    1.2,
    Math.cos(tugHeadingYaw) * 3.5
  ];
  const tugStaple: [number, number, number] = [
    tugPos[0] + stapleOffsetLocal[0],
    tugPos[1] + stapleOffsetLocal[1],
    tugPos[2] + stapleOffsetLocal[2]
  ];

  // Preserve the steering-based angle used by the live simulator.
  const lineAngleDeg = Math.min(90, Math.abs(params.tugSteeringAngle));

  // Dynamic Line Tension calculation
  let lineTension = 0;
  if (!params.quickReleaseActive) {
    const baseTension = 60 + params.shipSpeed * 15;
    const angleMultiplier = 1 + Math.pow(Math.sin((lineAngleDeg * Math.PI) / 180), 2) * 2.8;
    lineTension = Math.round(baseTension * angleMultiplier);
  }

  // Girting (전복) Risk System:
  // Sensor fusion combines Vision AI line angle tracking with IMU roll
  let girtingRisk = 0;
  let girtingStatus: RiskLevel = 'SAFE';
  let targetRollDeg = 0;

  if (!params.quickReleaseActive) {
    // Risk spikes non-linearly as line angle approaches 90° and steering is hard-over
    const normalizedAngleRisk = Math.pow(lineAngleDeg / 80, 1.8) * 82;
    const speedFactor = Math.min(1.3, Math.max(0.7, (params.shipSpeed + 3) / 9));
    girtingRisk = Math.min(100, Math.round(normalizedAngleRisk * speedFactor));

    // Visual roll physics: Tugboat heels over under beam tension up to 25-26 degrees
    const rollDirection = params.tugSteeringAngle >= 0 ? 1 : -1;
    const maxRoll = 25.5; // Cap at 25.5 degrees as requested
    const tensionRatio = Math.min(1.25, lineTension / 160);
    targetRollDeg = rollDirection * Math.min(26, Math.pow(lineAngleDeg / 85, 1.8) * maxRoll * tensionRatio);

    // Turbulence adds to roll perturbation
    if (inWash) {
      targetRollDeg += Math.sin(now * 0.04) * (washTurbulence * 0.08);
    }

    if (girtingRisk >= 85 || Math.abs(targetRollDeg) >= 20) {
      girtingStatus = 'CRITICAL';
    } else if (girtingRisk >= 45 || Math.abs(targetRollDeg) >= 10) {
      girtingStatus = 'WARNING';
    }
  } else {
    // Quick release active: line disconnected! Immediate righting moment
    targetRollDeg = Math.sin(now * 0.003) * 1.5; // gentle wave motion
    girtingRisk = 0;
    girtingStatus = 'SAFE';
    lineTension = 0;
  }

  // Smooth IMU roll with damping
  state.smoothedRoll = THREE.MathUtils.lerp(state.smoothedRoll, targetRollDeg, Math.min(1, dt * 6));
  const imuRoll = state.smoothedRoll;
  const imuRollRate = (imuRoll - state.prevRoll) / dt;
  state.prevRoll = imuRoll;

  const imuPitch = (Math.sin(now * 0.0025) * 1.8) + (params.shipSpeed * 0.15) + (jitter[1] * 3);

  // Suction & Hull Distance Calculation
  // Large ship starboard hull is at X = 7.0 (ship width 14m, half-width 7m)
  // Stern is at Z = -35. If tug is along the quarter/flank:
  let hullDistanceM = 0;
  if (tugPos[2] >= -37) {
    // Alongside the hull
    hullDistanceM = Math.max(0.5, Math.abs(tugPos[0] - 7.0));
  } else {
    // Aft of the stern
    const dz = -35 - tugPos[2];
    const dx = Math.max(0, Math.abs(tugPos[0]) - 7.0);
    hullDistanceM = Math.max(0.8, Math.sqrt(dx * dx + dz * dz));
  }

  // Closing rate (m/s)
  const prevDist = state.previousDistance;
  const closingRate = Math.max(-5, Math.min(10, (prevDist - hullDistanceM) / Math.max(0.016, dt)));
  state.previousDistance = hullDistanceM;

  // Suction risk & Bernoulli force (inversely proportional to distance squared)
  let suctionRisk = 0;
  let suctionStatus: RiskLevel = 'SAFE';
  const bernoulliSpeedTerm = Math.pow(Math.max(1, params.shipSpeed), 1.8);
  const suctionForceKn = Math.round(THREE.MathUtils.clamp((bernoulliSpeedTerm * 28) / Math.pow(Math.max(1.5, hullDistanceM), 1.5), 5, 280));

  if (hullDistanceM <= 5.0) {
    suctionRisk = Math.min(100, Math.round(85 + (5.0 - hullDistanceM) * 3.5));
    suctionStatus = 'CRITICAL';
  } else if (hullDistanceM <= 9.0) {
    suctionRisk = Math.min(84, Math.round(35 + (9.0 - hullDistanceM) * 12));
    suctionStatus = 'WARNING';
  } else {
    suctionRisk = Math.max(5, Math.round(15 - (hullDistanceM - 9.0) * 0.5));
    suctionStatus = 'SAFE';
  }

  // Assemble updated telemetry packet
  return {
    timestamp: now,
    tugPosition: tugPos,
    tugRotation: [
      (imuPitch * Math.PI) / 180,
      tugHeadingYaw,
      (imuRoll * Math.PI) / 180
    ],
    shipPosition: shipPos,
    lineStartPoint: shipChock,
    lineEndPoint: tugStaple,
    lineAngleDeg: Math.round(lineAngleDeg * 10) / 10,
    imuRollDeg: Math.round(imuRoll * 10) / 10,
    imuPitchDeg: Math.round(imuPitch * 10) / 10,
    imuRollRateDegS: Math.round(imuRollRate * 10) / 10,
    lineTensionKn: lineTension,
    girtingRiskPct: girtingRisk,
    girtingStatus,
    inWashZone: inWash,
    washTurbulencePct: washTurbulence,
    washStatus,
    turbulenceJitter: jitter,
    hullDistanceM: Math.round(hullDistanceM * 10) / 10,
    closingRateMs: Math.round(closingRate * 10) / 10,
    suctionRiskPct: suctionRisk,
    suctionForceKn,
    suctionStatus,
    emergencyReleaseTriggered: params.quickReleaseActive,
    aiDetectionConfidence: 99.4 + (Math.sin(now * 0.001) * 0.3),
  };
}

/** Advance a fresh simulation at 60 Hz, ending at the requested timestamp. */
export function settlePhysics(params: SimulationParams, now: number, steps = 120): TelemetryState {
  const state = createPhysicsState();
  const count = Math.max(1, Math.floor(steps));
  let telemetry = createInitialTelemetry(now);
  for (let index = 0; index < count; index++) {
    telemetry = stepMaritimePhysics(params, state, 1 / 60, now - (count - 1 - index) * 1000 / 60);
  }
  return telemetry;
}
