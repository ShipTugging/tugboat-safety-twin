import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { seededRandom } from '../environment';
import { applySagTarget, randomizeSagScene } from '../sagScene';
import { randomizeLens } from '../lens';
import { settlePhysics } from '../../simulation/physics';
import { computeSagMetrics, getTowlineAnchors } from '../../simulation/towline';
import type { CaptureSample } from '../types';
import { stratifyParents, variantConditions } from './split';
import type { TowPosition } from '../../types/maritime';

export const V2_VERSION='towline-v2-stratified-1.1.0';
export const v2Config={
  datasetSize:120,seed:2043,imageWidth:1280,imageHeight:720,variantsPerScenario:2,
  split:{train:.7,val:.2,test:.1},maxAttemptsPerScenario:20,maxParentReplacements:500,
  camera:{fovRange:[58,88],translationRange:[1.2,.6,1.2],rotationRange:[14,10,5]},
  validation:{minMaskPixels:80,minVisibleFraction:.25,minInFrameFraction:.3,minProjectedChordPixels:45,minimumPolygonIou:.98},
};
export type V2Config=typeof v2Config;
export type Split='train'|'val'|'test';
export interface ParentPlan {index:number;split:Split;towPosition:TowPosition;sagBin:number;steeringSign:number;parentScenarioId?:string;replacementOf?:string;replacementNumber?:number;replacementSeed?:number;sampleSeedSlot?:number;outputIndex?:number;replacementFailure?:{failedParentId:string;failedAttempts:number;failureReasons:string[];replacementSeed:number}}
export interface V2Scenario {
  generationRunId:string;scenarioId:string;parentScenarioId:string;scenarioSeed:number;parentSeed:number;
  split:Split;targetSagBin:number;variant:number;attempt:number;difficult:boolean;
  mount:[number,number,number];aimPolicy:'offset_bisector'|'fixed_heading';
  replacementOf?:string;replacementNumber?:number;replacementSeed?:number;replacementFailure?:ParentPlan['replacementFailure'];
}
export function validateV2Config(c:V2Config) {
  for(const [key,min,max] of [['datasetSize',10,5000],['seed',0,4294967295],['imageWidth',64,4096],['imageHeight',64,4096],['maxAttemptsPerScenario',1,100],['maxParentReplacements',0,10000]] as const)
    if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw new Error(`Invalid ${key}: ${min}..${max}`);
  if(c.variantsPerScenario!==2||c.datasetSize%2)throw new Error('V2 uses two variants per parent; count must be even');
  if(Object.values(c.split).some(v=>!Number.isFinite(v)||v<=0)||Math.abs(Object.values(c.split).reduce((a,b)=>a+b,0)-1)>1e-9)throw new Error('All three split ratios must be positive and sum to one');
  if(c.camera.fovRange.length!==2||c.camera.fovRange.some(v=>!Number.isFinite(v))||c.camera.fovRange[0]<=0||c.camera.fovRange[1]>=150||c.camera.fovRange[0]>c.camera.fovRange[1])throw new Error('Invalid FOV range');
  for(const values of [c.camera.translationRange,c.camera.rotationRange])if(values.length!==3||values.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid camera jitter range');
  const v=c.validation;
  if(!Number.isInteger(v.minMaskPixels)||v.minMaskPixels<1||!Number.isFinite(v.minProjectedChordPixels)||v.minProjectedChordPixels<=0||[v.minVisibleFraction,v.minInFrameFraction].some(n=>!Number.isFinite(n)||n<0||n>1)||!Number.isFinite(v.minimumPolygonIou)||v.minimumPolygonIou<.98||v.minimumPolygonIou>1)throw new Error('Invalid acceptance thresholds; polygon IoU must remain >= .98');
}
export function allocateCounts(total:number,ratios:V2Config['split']) {
  const names:Split[]=['train','val','test'];
  const counts=Object.fromEntries(names.map(s=>[s,Math.floor(total*ratios[s])])) as Record<Split,number>;
  const order=[...names].sort((a,b)=>(total*ratios[b]-counts[b])-(total*ratios[a]-counts[a]));
  const remaining=total-Object.values(counts).reduce((a,b)=>a+b,0);
  for(let i=0;i<remaining;i++)counts[order[i]]++;
  // A tiny smoke run still needs a held-out test parent.
  for(const split of names)if(counts[split]===0){const donor=[...names].sort((a,b)=>counts[b]-counts[a])[0];counts[donor]--;counts[split]++;}
  return counts;
}
export function planParents(c:V2Config):ParentPlan[] {
  validateV2Config(c);
  const n=c.datasetSize/c.variantsPerScenario,counts=allocateCounts(n,c.split);
  const parents=Array.from({length:n},(_,index)=>({index,towPosition:(['astern','port','starboard','ahead'] as const)[index%4],sagBin:Math.floor(index/4)%5,steeringSign:(index+Math.floor(index/4))%2?-1:1}));
  return stratifyParents(parents,counts,c.seed);
}
export function parentScenarioId(runId:string,p:ParentPlan) { return p.parentScenarioId ?? `${runId}:parent:${p.index}`; }
export function makeReplacement(c:V2Config,p:ParentPlan,runId:string,replacementNumber:number,replacementOrdinal:number,failure:{failedParentId:string;failedAttempts:number;failureReasons:string[]}):ParentPlan {
  const parentCount=c.datasetSize/c.variantsPerScenario;
  const slot=parentCount*c.maxAttemptsPerScenario+replacementOrdinal-1;
  const replacementSeed=seedForSlot(c.seed,slot);
  return {...p,parentScenarioId:`${runId}:replacement:${p.index}:${replacementNumber}`,replacementOf:failure.failedParentId,replacementNumber,replacementSeed,
    sampleSeedSlot:1_000_000+(parentCount*c.maxAttemptsPerScenario+replacementOrdinal*c.maxAttemptsPerScenario)*2,
    outputIndex:2_000_000+(replacementOrdinal-1)*2,replacementFailure:{...failure,replacementSeed}};
}
// Disjoint attempt/sample slots, bijective within the configured generation bounds.
export const seedForSlot=(seed:number,slot:number)=>(seed+Math.imul(slot+1,2654435761))>>>0;
export function makeParent(c:V2Config,p:ParentPlan,attempt:number) {
  const parentSeed=p.replacementSeed===undefined ? seedForSlot(c.seed,p.index*c.maxAttemptsPerScenario+attempt) : (attempt===0 ? p.replacementSeed : seedForSlot(p.replacementSeed,attempt)),r=seededRandom(parentSeed);
  const time=60+r()*120;
  let params=randomizeSagScene(r,p.sagBin,p.towPosition);
  params={...params,tugSteeringAngle:params.tugSteeringAngle*p.steeringSign};
  const telemetry=settlePhysics(params,time*1000);
  params=applySagTarget(params,telemetry,p.sagBin,r);
  const a=getTowlineAnchors(telemetry);
  const sag=computeSagMetrics(a.start,a.end,params.towLineLength,telemetry.lineTensionKn,telemetry.girtingStatus,params.ropeSlackM);
  return {params,telemetry,time,parentSeed,sag};
}
export function makeVariant(c:V2Config,p:ParentPlan,attempt:number,variant:number,runId:string,parent:ReturnType<typeof makeParent>):CaptureSample {
  const sampleSeedStart=p.sampleSeedSlot ?? (1000000+p.index*c.maxAttemptsPerScenario*2);
  const scenarioSeed=seedForSlot(c.seed,sampleSeedStart+attempt*2+variant),r=seededRandom(scenarioSeed);
  const between=(a:number,b:number)=>a+(b-a)*r();
  const difficult=variant===1&&p.index%3===0;
  const {lens,timeOfDay}=variantConditions(p.index,variant);
  const jitter=c.camera.translationRange,rotation=c.camera.rotationRange;
  const params={...parent.params,timeOfDay,...randomizeLens(r,lens),
    cameraFov:between(...c.camera.fovRange as [number,number]),
    cameraJitter:[between(-jitter[0],jitter[0]),between(-jitter[1],jitter[1]),between(-jitter[2],jitter[2])] as [number,number,number],
    cameraRotationJitter:[between(-rotation[0],rotation[0]),between(-rotation[1],rotation[1]),between(-rotation[2],rotation[2])] as [number,number,number]};
  const parentScenarioIdValue=parentScenarioId(runId,p);
  const v2:V2Scenario={generationRunId:runId,scenarioId:`${parentScenarioIdValue}:attempt:${attempt}:variant:${variant}`,parentScenarioId:parentScenarioIdValue,scenarioSeed,parentSeed:parent.parentSeed,
    split:p.split,targetSagBin:p.sagBin,variant,attempt,difficult,
    mount:difficult?[-2.2,3.4,-2.5]:[-3.6,5.2,-3.2],aimPolicy:variant===1&&p.index%5===0?'fixed_heading':'offset_bisector',replacementOf:p.replacementOf,replacementNumber:p.replacementNumber,replacementSeed:p.replacementSeed,replacementFailure:p.replacementFailure};
  const index=(p.outputIndex ?? p.index*2)+variant;
  return {id:`v2:${v2.scenarioId}`,index,kind:'sag',params,telemetry:parent.telemetry,time:parent.time,width:c.imageWidth,height:c.imageHeight,v2};
}
export function applyV2Camera(camera:PerspectiveCamera,sample:CaptureSample) {
  const s=sample.v2!,t=sample.telemetry,params=sample.params;
  const rotation=new Quaternion().setFromEuler(new Euler(...t.tugRotation));
  const onTug=(v:Vector3)=>v.applyQuaternion(rotation).add(new Vector3(...t.tugPosition));
  camera.position.copy(onTug(new Vector3(...s.mount).add(new Vector3(...params.cameraJitter!))));
  camera.up.set(0,1,0).applyQuaternion(rotation);
  if(s.aimPolicy==='fixed_heading')camera.lookAt(onTug(new Vector3(0,3.2,25)));
  else {
    const {start,end}=getTowlineAnchors(t);
    const aim=start.sub(camera.position).normalize().add(end.sub(camera.position).normalize()).normalize();aim.y-=.12;
    camera.lookAt(camera.position.clone().add(aim.normalize().multiplyScalar(20)));
  }
  const [yaw,pitch,roll]=params.cameraRotationJitter!;
  camera.rotateY(yaw*Math.PI/180);camera.rotateX(pitch*Math.PI/180);camera.rotateZ(roll*Math.PI/180);
  // No attachment fitting or automatic zoom-out in V2.
  camera.fov=params.cameraFov!;camera.aspect=sample.width/sample.height;camera.near=.15;camera.far=1800;
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
