import { Curve, Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { computeSagMetrics, getTowlineAnchors } from '../../simulation/towline';
import type { CaptureSample } from '../types';
import { V2_VERSION } from './scenarios';

export function sampleName(sample:CaptureSample) {
  return `sample_${sample.v2!.generationRunId}_${String(sample.index+1).padStart(6,'0')}`;
}
export function v2Metadata(sample:CaptureSample,camera:PerspectiveCamera,rope:Mesh,mask:Uint8Array,metrics:Record<string,number>) {
  const s=sample.v2!,p=sample.params,t=sample.telemetry,id=sampleName(sample);
  const curve=rope.userData.curve as Curve<Vector3>;
  const points=curve.getSpacedPoints(99).map(point=>point.applyMatrix4(rope.matrixWorld));
  const anchors=getTowlineAnchors(t);
  const sag=computeSagMetrics(anchors.start,anchors.end,p.towLineLength,t.lineTensionKn,t.girtingStatus,p.ropeSlackM);
  let pixels=0,xMin=sample.width,yMin=sample.height,xMax=-1,yMax=-1;
  for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++)if(mask[y*sample.width+x]===255){pixels++;xMin=Math.min(xMin,x);xMax=Math.max(xMax,x);yMin=Math.min(yMin,y);yMax=Math.max(yMax,y);}
  const projected=points.map(point=>{
    const view=point.clone().applyMatrix4(camera.matrixWorldInverse),ndc=point.clone().project(camera);
    const u=(ndc.x+1)*sample.width/2,v=(1-ndc.y)*sample.height/2;
    const inFrame=-view.z>camera.near&&-view.z<camera.far&&u>=0&&u<sample.width&&v>=0&&v<sample.height;
    let visible=false;
    if(inFrame)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=Math.floor(u)+dx,y=Math.floor(v)+dy;
      if(x>=0&&x<sample.width&&y>=0&&y<sample.height&&mask[y*sample.width+x]===255)visible=true;
    }
    return {image:[u,v],inFrame,visible};
  });
  const chordPx=Math.hypot(projected[0].image[0]-projected[99].image[0],projected[0].image[1]-projected[99].image[1]);
  return {
    generatorVersion:V2_VERSION,sampleId:id,sample_id:id,split:s.split,
    generation_run_id:s.generationRunId,scenario_id:s.scenarioId,parent_scenario_id:s.parentScenarioId,
    scenarioSeed:s.scenarioSeed,scenario_seed:s.scenarioSeed,parent_scenario_seed:s.parentSeed,
    // Legacy preprocessing expects a unique scenarioGroup per sample. Parent ID
    // is the split unit and is separately audited across all variants.
    scenarioGroup:s.scenarioId,variant:s.variant,attempt:s.attempt,
    classes:{0:'towline'},sagBin:sag.level,targetSagBin:s.targetSagBin,
    paths:{image:`images/${s.split}/${id}.png`,mask:`masks/${s.split}/${id}_mask.png`,metadata:`metadata/${s.split}/${id}.json`},
    image:{width:sample.width,height:sample.height,format:'PNG',coordinateConvention:'origin top-left; pixel centers x+0.5,y+0.5'},
    camera:{mode:p.cameraMode,mount:s.mount,jitter:p.cameraJitter,rotationJitterDeg:p.cameraRotationJitter,aimPolicy:s.aimPolicy,automaticFovFit:false,
      position:camera.position.toArray(),rotation:camera.rotation.toArray().slice(0,3),quaternion:camera.quaternion.toArray(),fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far,projectionMatrix:camera.projectionMatrix.toArray()},
    towline:{nominalLengthM:p.towLineLength,ropeSlackM:p.ropeSlackM,radius:p.ropeRadius,color:p.ropeColor,sag,...metrics,
      centerlineWorld:points.map(point=>point.toArray()),centerlineImage:projected.map(point=>point.image),centerlineInFrame:projected.map(point=>point.inFrame),centerlineVisible:projected.map(point=>point.visible)},
    environment:{towPosition:p.towPosition,timeOfDay:p.timeOfDay,fogDensity:p.fogDensity,waveStrength:p.waveStrength,sunIntensity:p.sunIntensity,hullColor:p.hullColor,
      lensCondition:p.lensCondition,blurPx:p.imageBlurPx,appliedBlurPx:(p.imageBlurPx??0)*sample.width/960,lensWetness:p.lensWetness,lensSeed:p.lensSeed},
    validation:{maskPixels:pixels,foregroundFraction:pixels/(sample.width*sample.height),visibleFraction:projected.filter(point=>point.visible).length/100,
      inFrameFraction:projected.filter(point=>point.inFrame).length/100,projectedChordPixels:chordPx,
      foregroundBoundsPx:pixels?[xMin,yMin,xMax+1,yMax+1]:null,foregroundSizePx:pixels?[xMax-xMin+1,yMax-yMin+1]:[0,0]},
    visibilityPolicy:'Geometric visible tube, mask-support within 5x5 of projected centerline; fog and RGB-only lens blur/droplets do not erase geometry ground truth.',
    requestedDifficultView:s.difficult,
    simulator:{source:'Synthetic simulator quantities, not real sensor/physical ground truth',simulationTime:sample.time,steeringAngleDeg:p.tugSteeringAngle,shipSpeedKn:p.shipSpeed,propellerRpm:p.propellerRpm,telemetry:t,params:p},
    replacement:s.replacementOf?{failed_parent_id:s.replacementOf,replacement_parent_id:s.parentScenarioId,failed_attempts:s.replacementFailure!.failedAttempts,failure_reasons:s.replacementFailure!.failureReasons,replacement_seed:s.replacementSeed}:null,
    renderer:{quality:'high',maskSamples:0,maskThreshold:128,maskPass:'shared VisibleTowlinePass; original vertex/alpha/depth behavior retained'},
  };
}
export type V2Metadata=ReturnType<typeof v2Metadata>;
export interface V2Capture {rgb:string;mask:string;metadata:V2Metadata}
export type V2CaptureHandler=(gl:WebGLRenderer,scene:Scene,camera:PerspectiveCamera,rope:Mesh,sample:CaptureSample)=>Promise<V2Capture>;
