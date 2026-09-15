import type { CameraMode, SimulationParams } from '../types/maritime';

export type NumericScenarioControl = 'tugSteeringAngle'|'towLineLength'|'shipSpeed'|'propellerRpm';
export const SCENARIO_CONTROL_RANGES:Record<NumericScenarioControl,{min:number;max:number;step:number;unit:string}>={
  tugSteeringAngle:{min:-90,max:90,step:1,unit:'°'},
  towLineLength:{min:10,max:60,step:1,unit:'m'},
  shipSpeed:{min:0,max:14,step:.5,unit:'kn'},
  propellerRpm:{min:0,max:120,step:5,unit:'RPM'},
};
export const BOW_BASELINE:Pick<SimulationParams,'towPosition'|'cameraMode'>={towPosition:'ahead',cameraMode:'TUG_SAG_CAM'};
export function clampScenarioValue(key:NumericScenarioControl,value:number):number{
  const range=SCENARIO_CONTROL_RANGES[key];
  if(!Number.isFinite(value))return range.min;
  return Math.min(range.max,Math.max(range.min,value));
}
export const SCENARIO_CAMERA_MODES:readonly CameraMode[]=['TUG_SAG_CAM','TUG_AFT_DECK','TUG_BRIDGE','orbit','tugChase','bridgeView','topDown','cinematic'];
