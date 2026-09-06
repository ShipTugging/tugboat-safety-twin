export type CameraMode = 'orbit' | 'tugChase' | 'bridgeView' | 'topDown' | 'cinematic';

export type TimeOfDay = 'day' | 'sunset' | 'night';

export type RiskLevel = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface SimulationParams {
  tugSteeringAngle: number; // -90° to +90°
  towLineLength: number;    // 10m to 60m
  shipSpeed: number;        // 0 to 14 knots
  propellerRpm: number;     // 0 to 120 RPM
  cameraMode: CameraMode;
  timeOfDay: TimeOfDay;
  quickReleaseActive: boolean;
  soundEnabled: boolean;
  fogDensity: number;
}

export interface TelemetryState {
  timestamp: number;
  
  // Coordinates
  tugPosition: [number, number, number];
  tugRotation: [number, number, number]; // [pitch, yaw, roll] in radians
  shipPosition: [number, number, number];
  lineStartPoint: [number, number, number]; // Attachment on large ship
  lineEndPoint: [number, number, number];   // Attachment on tug staple
  
  // Girting & Tow Line
  lineAngleDeg: number;       // Angle between tug heading and towline
  imuRollDeg: number;         // Tug roll angle
  imuPitchDeg: number;        // Tug pitch angle
  imuRollRateDegS: number;    // Gyro roll velocity
  lineTensionKn: number;      // Line tension in kiloNewtons
  girtingRiskPct: number;     // 0-100%
  girtingStatus: RiskLevel;
  
  // Propeller Wash
  inWashZone: boolean;
  washTurbulencePct: number;  // 0-100%
  washStatus: 'CLEAR' | 'MARGINAL' | 'SEVERE_INGRESS';
  turbulenceJitter: [number, number, number];
  
  // Suction & Hull Proximity
  hullDistanceM: number;      // Euclidean distance in meters
  closingRateMs: number;      // m/s
  suctionRiskPct: number;     // 0-100%
  suctionForceKn: number;     // Bernoulli force in kN
  suctionStatus: RiskLevel;
  
  // System State
  emergencyReleaseTriggered: boolean;
  aiDetectionConfidence: number; // e.g., 99.4%
}

export type ScenarioPresetId = 
  | 'NORMAL_ESCORT'
  | 'GIRTING_CRISIS'
  | 'PROP_WASH_TRAP'
  | 'SUCTION_NEAR_MISS';

export interface ScenarioPreset {
  id: ScenarioPresetId;
  name: string;
  badge: string;
  description: string;
  params: {
    tugSteeringAngle: number;
    towLineLength: number;
    shipSpeed: number;
    propellerRpm: number;
  };
}
