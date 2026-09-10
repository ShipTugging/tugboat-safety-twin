import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { SimulationParams, TelemetryState } from '../types/maritime';
import { measureImu } from '../dataset/imu';
import { createPhysicsState, stepMaritimePhysics } from './physics';
import { computeSagMetrics, getTowlineAnchors } from './towline';

export type RiskScenario='normal_steady'|'normal_to_girting_slow'|'normal_to_girting_fast';
export const RISK_SCENARIOS=[
  {id:'normal_steady',label:'정상 유지'},
  {id:'normal_to_girting_slow',label:'느린 정상 → 거팅'},
  {id:'normal_to_girting_fast',label:'빠른 정상 → 거팅'},
] as const;
export interface RiskFrame {
  index:number;timeSec:number;phase:'normal'|'transition'|'risk_hold';
  params:SimulationParams;telemetry:TelemetryState;
  sagRatio:number;targetSagRatio:number;sagRatioRatePerSec:number;
  angleDeg:number;planarAngleDeg:number;acuteAngleDeg:number;signedAngleDeg:number;angleRateDegS:number;
  rollDeg:number;rollRateDegS:number;
  imu:ReturnType<typeof measureImu>;
}
export interface RiskSequence {
  scenario:RiskScenario;label:string;durationSec:number;sampleRateHz:number;
  frames:RiskFrame[];metadata:Record<string,unknown>;
}

/** Rope vector points from tug staple toward ship chock; model local +Z is bow. */
export function measureRopeAngles(rope:Vector3,orientation:Quaternion) {
  const heading=new Vector3(0,0,1).applyQuaternion(orientation);
  const angleDeg=MathUtils.radToDeg(heading.angleTo(rope));
  const h=new Vector3(heading.x,0,heading.z),r=new Vector3(rope.x,0,rope.z);
  const planarAngleDeg=MathUtils.radToDeg(h.angleTo(r));
  const signedAngleDeg=MathUtils.radToDeg(Math.atan2(h.z*r.x-h.x*r.z,h.dot(r)));
  return {angleDeg,planarAngleDeg,acuteAngleDeg:Math.min(planarAngleDeg,180-planarAngleDeg),signedAngleDeg};
}
const pose=(t:TelemetryState)=>({position:t.tugPosition,quaternion:new Quaternion().setFromEuler(new Euler(...t.tugRotation)).toArray() as [number,number,number,number]});
const DT=.01,EPOCH_MS=60000,TAU=.3;

export function generateRiskSequence(base:SimulationParams,scenario:RiskScenario):RiskSequence {
  const descriptor=RISK_SCENARIOS.find(s=>s.id===scenario);
  if(!descriptor) throw new Error('Unknown continuous risk scenario');
  const transitionSec=scenario==='normal_to_girting_slow'?10:scenario==='normal_to_girting_fast'?1:0;
  const fixed:SimulationParams={...base,shipSpeed:6,towLineLength:32,propellerRpm:45,tugSteeringAngle:12,quickReleaseActive:false,soundEnabled:false};
  delete fixed.ropeSlackM;delete fixed.ropeSagOverrideM;
  const state=createPhysicsState();
  // Include prewarm and one future pose, all from this single integration state.
  const samples:Array<Omit<RiskFrame,'imu'>>=[];
  let sagM:number|undefined;
  for(let i=-200;i<=2001;i++) {
    const timeSec=i/100;
    const u=transitionSec?MathUtils.clamp((timeSec-5)/transitionSec,0,1):0;
    const params={...fixed,tugSteeringAngle:12+60*u*u*(3-2*u)};
    const telemetry=stepMaritimePhysics(params,state,DT,EPOCH_MS+i*10);
    const {start,end}=getTowlineAnchors(telemetry);
    const target=computeSagMetrics(start,end,params.towLineLength,telemetry.lineTensionKn,telemetry.girtingStatus);
    sagM=sagM===undefined?target.sagM:sagM+(target.sagM-sagM)*(1-Math.exp(-DT/TAU));
    const actual=computeSagMetrics(start,end,params.towLineLength,telemetry.lineTensionKn,telemetry.girtingStatus,undefined,sagM);
    sagM=actual.sagM;params.ropeSagOverrideM=sagM;
    const angles=measureRopeAngles(start.clone().sub(end),new Quaternion(...pose(telemetry).quaternion));
    const rollDeg=MathUtils.radToDeg(telemetry.tugRotation[2]);
    const previous=samples.at(-1);
    samples.push({index:i,timeSec,phase:transitionSec&&timeSec>=5?(timeSec<5+transitionSec?'transition':'risk_hold'):'normal',params,telemetry,
      sagRatio:actual.sagRatio,targetSagRatio:target.sagRatio,sagRatioRatePerSec:previous?(actual.sagRatio-previous.sagRatio)/DT:0,
      ...angles,angleRateDegS:previous?(angles.angleDeg-previous.angleDeg)/DT:0,
      rollDeg,rollRateDegS:previous?(rollDeg-previous.rollDeg)/DT:0});
  }
  const frames=samples.slice(200,-1).map((f,i)=>({...f,imu:measureImu(pose(samples[i+199].telemetry),pose(f.telemetry),pose(samples[i+201].telemetry),DT)}));
  return {scenario,label:descriptor.label,durationSec:20,sampleRateHz:100,frames,metadata:{
    schemaVersion:1,source:'deterministic simulator experiment; not real vessel measurements',scenario,
    durationSec:20,sampleRateHz:100,prewarmSec:2,simulatorEpochMs:EPOCH_MS,
    transitionStartSec:5,transitionDurationSec:transitionSec,steeringStartDeg:12,steeringEndDeg:transitionSec?72:12,
    interpolation:'smoothstep u*u*(3-2*u)',fixedParams:fixed,
    sagModel:'Legacy computeSagMetrics target sag meters, exact first-order update with tau=0.3 s; same override used for rendering and logging.',sagTimeConstantSec:TAU,
    derivative:'Sag ratio, heading angle and Euler roll use causal backward 10 ms differences, including warmed prehistory at t=0.',
    angles:'heading local +Z transformed by Euler XYZ quaternion; rope tug staple to rendered ship chock; full 3D and planar 0..180 deg; acute angle min(planar,180-planar); planar signed atan2(+X relative to +Z).',
    riskStatus:'Existing steering-driven model status; not a threshold derived from actual rope geometry.',
    imu:'Ideal body XYZ (+Y up, +Z bow), specific force m/s^2 and gyro rad/s; centered adjacent 10 ms poses, including future t+10 ms. All poses share one physics state. No noise, bias or latency.',
    limitations:'Synthetic kinematic scene, not hydrodynamic or real-vessel validation. Simulator clock is not Unix time. No real-world safety threshold is claimed. Fast steering can produce large ideal accelerations.',
  }};
}

export function sequenceCsv(sequence:RiskSequence):string {
  const header=['scenario','index','time_s','simulator_timestamp_ms','phase','sag_ratio','target_sag_ratio','sag_ratio_rate_per_s','sag_m','heading_rope_3d_deg','heading_rope_planar_deg','heading_rope_acute_deg','heading_rope_signed_deg','heading_rope_rate_deg_per_s','roll_deg','roll_rate_deg_per_s','model_driver_angle_deg','model_girting_status','model_girting_risk_pct','line_tension_kN','accel_body_x_mps2','accel_body_y_mps2','accel_body_z_mps2','gyro_body_x_rad_per_s','gyro_body_y_rad_per_s','gyro_body_z_rad_per_s'];
  return [header.join(','),...sequence.frames.map(f=>[sequence.scenario,f.index,f.timeSec,f.telemetry.timestamp,f.phase,f.sagRatio,f.targetSagRatio,f.sagRatioRatePerSec,f.params.ropeSagOverrideM,f.angleDeg,f.planarAngleDeg,f.acuteAngleDeg,f.signedAngleDeg,f.angleRateDegS,f.rollDeg,f.rollRateDegS,f.params.tugSteeringAngle,f.telemetry.girtingStatus,f.telemetry.girtingRiskPct,f.telemetry.lineTensionKn,...f.imu.accelerometerMps2,...f.imu.gyroscopeRadS].join(','))].join('\n')+'\n';
}

/** Fixed common scales allow direct comparison of the three SVGs. */
export function sequenceSvg(sequence:RiskSequence):string {
  const channels=[{label:'Sag ratio (m/m)',min:0,max:.08,get:(f:RiskFrame)=>f.sagRatio},
    {label:'Sag ratio rate (1/s)',min:-.15,max:.15,get:(f:RiskFrame)=>f.sagRatioRatePerSec},
    {label:'Heading to rope 3D (deg)',min:0,max:180,get:(f:RiskFrame)=>f.angleDeg},
    {label:'Roll (deg)',min:-5,max:30,get:(f:RiskFrame)=>f.rollDeg}];
  const transition=sequence.scenario==='normal_to_girting_slow'?10:sequence.scenario==='normal_to_girting_fast'?1:0;
  const label=RISK_SCENARIOS.find(s=>s.id===sequence.scenario)?.label??'';
  const plots=channels.map((c,i)=>{
    const y=70+i*145,h=105;
    const points=sequence.frames.filter((_,j)=>j%4===0).map(f=>`${(80+f.timeSec*43).toFixed(2)},${(y+h-(MathUtils.clamp(c.get(f),c.min,c.max)-c.min)/(c.max-c.min)*h).toFixed(2)}`).join(' ');
    return `<text x="80" y="${y-9}">${c.label}</text><rect x="80" y="${y}" width="860" height="${h}" fill="#effaf4"/>${transition?`<rect x="295" y="${y}" width="${transition*43}" height="${h}" fill="#fff3d6"/><rect x="${295+transition*43}" y="${y}" width="${(15-transition)*43}" height="${h}" fill="#ffebeb"/>`:''}<text x="12" y="${y+12}">${c.max}</text><text x="12" y="${y+h}">${c.min}</text><polyline fill="none" stroke="#146ac0" stroke-width="1.7" points="${points}"/>${[0,5,10,15,20].map(t=>`<text x="${80+t*43}" y="${y+h+17}">${t}s</text>`).join('')}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="white"/><g font-family="sans-serif" font-size="12" fill="#223044"><text x="80" y="25" font-size="18">${label} · continuous simulator experiment</text>${plots}<text x="80" y="665">Green: normal · amber: transition · red: risk hold. Fixed shared axes; values outside bounds clipped.</text><text x="80" y="686">Synthetic model data. No real-vessel safety thresholds implied.</text></g></svg>`;
}
