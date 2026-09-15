import {useMemo} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {PerspectiveCamera,Vector2} from 'three';
import {applyDatasetCamera} from '../dataset/camera';
import {encodeDatasetJpeg} from '../dataset/lensRenderer';
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
   const jpeg=encodeDatasetJpeg(gl.domElement,p);
   const cameraContext=JSON.stringify({mount:'TUG_SAG_CAM',position:p.towPosition??'astern',fov:p.cameraFov??60,jitter:p.cameraJitter,rotation:p.cameraRotationJitter});
   void analysis.onFrame({jpeg,timestamp:telemetry.timestamp,rollDeg:telemetry.imuRollDeg,rollRateDegS:telemetry.imuRollRateDegS,cameraContext});
  }catch(e){analysis.captureError(e instanceof Error?e:Error('CCTV 캡처 실패'));}
  finally{gl.setPixelRatio(dpr);gl.setSize(size.x,size.y,false);gl.render(scene,camera);}
 },2);
 return null;
}
