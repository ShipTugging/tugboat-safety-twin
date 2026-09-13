import {useMemo} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {PerspectiveCamera,Vector2} from 'three';
import {applyDatasetCamera} from '../dataset/camera';
import {encodeDatasetJpeg} from '../dataset/lensRenderer';
import {estimateSag2D} from '../dataset/segmentation';
import {createTowlineCurve,getTowlineAnchors} from '../simulation/towline';
import type {SimulationParams,TelemetryState} from '../types/maritime';
import type {ServerAnalysis} from '../hooks/useServerAnalysis';
export function ServerCaptureBridge({params,telemetry,analysis}:{params:SimulationParams;telemetry:TelemetryState;analysis:ServerAnalysis}){
 const {gl,scene,camera}=useThree(),captureCamera=useMemo(()=>new PerspectiveCamera(),[]);
 useFrame(()=>{
  if(!analysis.wantsFrame())return;
  const size=gl.getSize(new Vector2()),dpr=gl.getPixelRatio();
  try{
   const p={...params,cameraMode:'TUG_SAG_CAM' as const};
   applyDatasetCamera(captureCamera,p,telemetry,16/9);
   gl.setPixelRatio(1);gl.setSize(960,540,false);scene.updateMatrixWorld(true);gl.render(scene,captureCamera);
   const jpeg=encodeDatasetJpeg(gl.domElement,p),{start,end}=getTowlineAnchors(telemetry);
   const points=createTowlineCurve(start,end,p.towLineLength,telemetry.lineTensionKn,telemetry.girtingStatus,p.ropeSlackM,p.ropeSagOverrideM).getPoints(128).map(v=>{v.project(captureCamera);return {x:(v.x+1)*480,y:(1-v.y)*270};});
   const sag=estimateSag2D(points),a=points[0],b=points.at(-1)!;
   const top=a.y<b.y?a:b,bottom=top===a?b:a;
   void analysis.onFrame({jpeg,timestamp:telemetry.timestamp,rollDeg:telemetry.imuRollDeg,rollRateDegS:telemetry.imuRollRateDegS,sagRatio:sag?.ratio??0,angleDeg:Math.atan2(top.x-bottom.x,bottom.y-top.y)*180/Math.PI,detached:p.quickReleaseActive});
  }catch(e){analysis.captureError(e instanceof Error?e:Error('CCTV 캡처 실패'));}
  finally{gl.setPixelRatio(dpr);gl.setSize(size.x,size.y,false);gl.render(scene,camera);}
 },2);
 return null;
}
