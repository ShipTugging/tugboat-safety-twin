import { CatmullRomCurve3, Euler, Vector3 } from 'three';
import type { RiskLevel, TelemetryState } from '../types/maritime';

export const getTowlineState = (tensionKn:number,risk:RiskLevel):'taut'|'slack' =>
  tensionKn>=320 || risk==='CRITICAL' ? 'taut' : 'slack';

/** Sag ratio = maximum deviation from the chord / chord length. Five bands, Level 0 = very taut. */
export const SAG_LEVEL_THRESHOLDS=[.006,.02,.04,.065] as const;
export const SAG_LEVEL_NAMES=['매우 팽팽함','약간 처짐','중간','많이 처짐','매우 느슨함'] as const;
export type SagLevel=0|1|2|3|4;

export interface SagMetrics {
  spanM:number;        // chord length between the two attachment points
  sagM:number;         // maximum vertical deviation of the rendered curve from the chord
  sagRatio:number;     // sagM / spanM
  level:SagLevel;
  excessM:number;      // effective slack length (after tension take-up) that produced the sag
  ropeLengthM:number;  // chord + excess
}

export function classifySagLevel(ratio:number):SagLevel {
  if(!Number.isFinite(ratio)||ratio<0) return 0;
  let level=0;
  while(level<SAG_LEVEL_THRESHOLDS.length && ratio>=SAG_LEVEL_THRESHOLDS[level]) level++;
  return level as SagLevel;
}

/**
 * The physics places the tug hull, not the staple, at the rope length, so the
 * live chord is a few metres shorter than the nominal rope. Live sag uses the excess
 * beyond that reach; dataset scenes set `ropeSlackM` directly as the excess.
 */
export const STAPLE_REACH_M=2;
/** Sag may dip below the lower attachment by this much (into the water) before saturating. */
export const SAG_DIP_BELOW_ANCHOR_M=2;

/** Identity up to 70 % of the cap, then a smooth tanh saturation toward the cap. */
export function softCap(value:number,cap:number):number {
  if(cap<=0||value<=0) return 0;
  const knee=cap*.7;
  return value<=knee?value:knee+(cap-knee)*Math.tanh((value-knee)/(cap-knee));
}
export function invertSoftCap(target:number,cap:number):number|null {
  if(cap<=0||target<0) return null;
  const knee=cap*.7;
  if(target<=knee) return target;
  const x=(target-knee)/(cap-knee);
  if(x>=.999) return null;
  return knee+(cap-knee)*Math.atanh(x);
}
const sagCap=(start:Vector3,end:Vector3)=>Math.max(.5,Math.min(start.y,end.y)+SAG_DIP_BELOW_ANCHOR_M);
const lowLoadFor=(tensionKn:number)=>1-Math.min(1,Math.max(0,tensionKn)/320);
/** Parabolic approximation of a rope with `excess` extra length over chord `span`. */
const geometricSag=(span:number,excess:number)=>Math.sqrt(Math.max(0,3*span*excess/8));

export function computeSagMetrics(start:Vector3,end:Vector3,length:number,tensionKn:number,risk:RiskLevel,ropeSlackM?:number):SagMetrics {
  const span=start.distanceTo(end);
  const excess=ropeSlackM!==undefined&&Number.isFinite(ropeSlackM)
    ?Math.max(0,ropeSlackM)
    :Math.max(0,Math.max(0,length)-span-STAPLE_REACH_M);
  const lowLoad=lowLoadFor(tensionKn);
  const taut=getTowlineState(tensionKn,risk)==='taut';
  const sag=taut||span<=1e-6?0:softCap(geometricSag(span,excess),sagCap(start,end))*lowLoad;
  const ratio=span>1e-6?sag/span:0;
  return {spanM:span,sagM:sag,sagRatio:ratio,level:classifySagLevel(ratio),excessM:taut?0:excess*lowLoad,ropeLengthM:span+excess};
}

/**
 * Excess rope (m) that yields the target sag ratio at this span and tension.
 * Returns null when the line is taut, or when the target exceeds the water
 * cap unless `clampToCap` asks for the deepest reachable sag instead.
 */
export function solveRopeSlack(start:Vector3,end:Vector3,tensionKn:number,risk:RiskLevel,targetRatio:number,clampToCap=false):number|null {
  if(getTowlineState(tensionKn,risk)==='taut') return null;
  const span=start.distanceTo(end);
  const lowLoad=lowLoadFor(tensionKn);
  if(span<=1e-6||lowLoad<=1e-6||!(targetRatio>=0)) return null;
  const cap=sagCap(start,end);
  const wanted=targetRatio*span/lowLoad;
  const geometric=invertSoftCap(clampToCap?Math.min(wanted,cap*.98):wanted,cap);
  if(geometric===null) return null;
  return 8*geometric*geometric/(3*span);
}

export function createTowlineCurve(start:Vector3,end:Vector3,length:number,tensionKn:number,risk:RiskLevel,ropeSlackM?:number):CatmullRomCurve3 {
  const {sagM}=computeSagMetrics(start,end,length,tensionKn,risk,ropeSlackM);
  const points=[0,.25,.5,.75,1].map(t=>new Vector3().lerpVectors(start,end,t).add(new Vector3(0,-Math.sin(Math.PI*t)*sagM,0)));
  return new CatmullRomCurve3(points,false,'centripetal');
}

/** Render anchors follow the actual chock/staple and the tug's roll/pitch. */
export function getTowlineAnchors(t:TelemetryState):{start:Vector3;end:Vector3} {
  return {
    start:new Vector3(3.5,2.7,-34.2).add(new Vector3(...t.shipPosition)),
    end:new Vector3(0,2.8,3.2).applyEuler(new Euler(...t.tugRotation)).add(new Vector3(...t.tugPosition)),
  };
}
