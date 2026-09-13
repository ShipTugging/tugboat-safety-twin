import type { SimulationParams, TelemetryState } from '../types/maritime';
import type { YoloBox } from './projection';
import type { Polygon, Sag2D } from './segmentation';
import type { SagMetrics } from '../simulation/towline';
import type { V2Scenario } from './v2/scenarios';
import type { V2Capture } from './v2/capture';

export type DatasetKind='detection'|'sag';
export const CLASS_NAMES=['Tugboat','Towline_Taut','Towline_Slack','Ship_Stern'] as const;
export const SAG_CLASS_NAMES=['Towline_Sag_L0','Towline_Sag_L1','Towline_Sag_L2','Towline_Sag_L3','Towline_Sag_L4','Ship_Stern'] as const;
export const classNamesFor=(kind:DatasetKind):readonly string[]=>kind==='sag'?SAG_CLASS_NAMES:CLASS_NAMES;

export interface CaptureSample {
  id:string;
  index:number;
  kind:DatasetKind;
  params:SimulationParams;
  telemetry:TelemetryState;
  time:number;
  width:number;
  height:number;
  v2?:V2Scenario;
}
export interface FrameLabel {classId:number;box:YoloBox;polygon?:Polygon}
export interface FrameSag {
  truth:SagMetrics;          // from the rendered 3D curve
  image:Sag2D|null;          // Notion formula on the projected visible centerline
  visibleFraction:number;
  ropeRadiusM:number;
}
export interface CapturedFrame {
  v2?:V2Capture;
  jpeg:string;
  /** Pixel-exact binary rope mask (PNG data URL); sag kind only. */
  mask?:string;
  labels:FrameLabel[];
  sag?:FrameSag;
  camera:{position:number[];quaternion:number[];fov:number;aspect:number;near:number;far:number};
}
export interface SceneCaptureApi {capture:(sampleId:string,signal:AbortSignal)=>Promise<CapturedFrame>}
