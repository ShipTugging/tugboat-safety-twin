import type { SimulationParams, TelemetryState } from '../types/maritime';
import type { YoloBox } from './projection';

export const CLASS_NAMES=['Tugboat','Towline_Taut','Towline_Slack','Ship_Stern'] as const;
export interface CaptureSample {
  id:string;
  index:number;
  params:SimulationParams;
  telemetry:TelemetryState;
  time:number;
  width:number;
  height:number;
}
export interface FrameLabel {classId:number;box:YoloBox}
export interface CapturedFrame {
  jpeg:string;
  labels:FrameLabel[];
  camera:{position:number[];quaternion:number[];fov:number;aspect:number;near:number;far:number};
}
export interface SceneCaptureApi {capture:(sampleId:string,signal:AbortSignal)=>Promise<CapturedFrame>}
