import type { SimulationParams, TelemetryState, TimeOfDay } from '../types/maritime';
import { SAG_LEVEL_THRESHOLDS, getTowlineAnchors, solveRopeSlack } from '../simulation/towline';

export const ROPE_COLORS=['#d8c4a0','#f0e6c8','#c9b27a','#e9e9e9','#8f8a7a','#d97b3a','#6b8fb8','#4d4d4d'] as const;
export const HULL_COLORS=['#3d5261','#1f2a37','#5b6770','#8a2f2a','#2f5d3a','#6f6a5b','#0f172a','#7a8a99'] as const;

/** Target sag ratio band for a level: the midpoints of the five bands. */
export function targetRatioForLevel(level:number,random:()=>number):number {
  const bounds=[0,...SAG_LEVEL_THRESHOLDS,.11];
  const low=bounds[level], high=bounds[level+1];
  return low+(high-low)*(.15+.7*random());
}

/**
 * Fixed tug-mounted composition (train/val/test share it) with domain
 * randomization: light, fog, sea, hull/rope appearance, rope thickness, camera
 * micro-pose, blur. Level cycles 0..4 so every batch covers all five bands.
 */
export function randomizeSagScene(random:()=>number=Math.random,index=Math.floor(random()*600)):SimulationParams {
  const between=(a:number,b:number)=>a+(b-a)*random();
  const pick=<T,>(items:readonly T[])=>items[Math.floor(random()*items.length)];
  const level=index%5;
  // Level 0 may use the 320 kN taut rule; deeper sag needs lower tension so the
  // water cap stays reachable. Bounds keep every band attainable at any span.
  const hard=level===0&&random()<.5;
  const maxSteer=hard?52:level===4?12:level===3?18:level===2?26:32;
  const maxSpeed=hard?11:level===4?4:level===3?5.5:level===2?6.5:7;
  const maxLength=level===4?27:level===3?34:40;
  const timeOfDay=pick(['day','day','sunset','night'] as TimeOfDay[]);
  return {
    tugSteeringAngle:Math.round(between(hard?38:0,maxSteer)),
    towLineLength:Math.round(between(16,maxLength)),
    shipSpeed:Math.round(between(hard?6:1,maxSpeed)*10)/10,
    propellerRpm:pick([0,45,80,115]),
    cameraMode:'TUG_SAG_CAM',timeOfDay,quickReleaseActive:false,soundEnabled:false,
    fogDensity:between(.0002,.012),sunIntensity:between(.7,1.35),waveStrength:between(.4,1.7),
    cameraFov:between(52,70),
    cameraJitter:[between(-.35,.35),between(-.25,.25),between(-.35,.35)],
    cameraRotationJitter:[between(-4,4),between(-3,3),between(-2.5,2.5)],
    ropeColor:pick(ROPE_COLORS),ropeRadius:between(.06,.13),hullColor:pick(HULL_COLORS),
    imageBlurPx:random()<.3?between(.4,1.4):0,
    ropeSlackM:0,
  };
}

/** Pay out exactly the excess that lands in the level's band at the settled tug position. */
export function applySagTarget(params:SimulationParams,telemetry:TelemetryState,index:number,random:()=>number):SimulationParams {
  const level=index%5;
  const {start,end}=getTowlineAnchors(telemetry);
  const slack=solveRopeSlack(start,end,telemetry.lineTensionKn,telemetry.girtingStatus,targetRatioForLevel(level,random),true);
  return {...params,ropeSlackM:slack===null?0:Math.min(80,Math.round(slack*1000)/1000)};
}
