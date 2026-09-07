import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { SimulationParams, TelemetryState } from '../types/maritime';

export function applyDatasetCamera(camera:PerspectiveCamera,params:SimulationParams,t:TelemetryState,aspect:number):void {
  const jitter=new Vector3(...(params.cameraJitter??[0,0,0]));
  const rotation=new Quaternion().setFromEuler(new Euler(...t.tugRotation));
  const onTug=(p:Vector3)=>p.add(jitter).applyQuaternion(rotation).add(new Vector3(...t.tugPosition));
  const stern=new Vector3(3.5,3.8,-34.2).add(new Vector3(...t.shipPosition));
  camera.up.set(0,1,0);
  if(params.cameraMode==='TUG_AFT_DECK') {
    camera.position.copy(onTug(new Vector3(-2.3,2.55,-4.3)));
    camera.up.applyQuaternion(rotation);
    camera.fov=params.cameraFov??68;
    camera.lookAt(stern);
  } else if(params.cameraMode==='TUG_BRIDGE') {
    camera.position.copy(onTug(new Vector3(0,3.9,-.4)));
    camera.up.applyQuaternion(rotation);
    camera.fov=80;
    const lineTarget=stern.clone().lerp(new Vector3(...t.tugPosition),.25);
    lineTarget.y=2;
    camera.lookAt(lineTarget);
  } else {
    camera.position.set(76+jitter.x*50,48+jitter.y*40,-100+jitter.z*50);
    camera.fov=params.cameraFov??43;
    camera.lookAt(4,2,-17);
  }
  camera.aspect=aspect;
  camera.near=.15;
  camera.far=1800;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
