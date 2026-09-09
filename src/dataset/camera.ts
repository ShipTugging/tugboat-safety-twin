import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { SimulationParams, TelemetryState } from '../types/maritime';
import { getTowlineAnchors } from '../simulation/towline';

const DEG=Math.PI/180;

/** Vertical FOV (deg) that shows every point given the camera pose and aspect. */
export function requiredVerticalFov(camera:PerspectiveCamera,points:Vector3[],aspect:number):number {
  let needed=0;
  for(const point of points) {
    const v=point.clone().applyMatrix4(camera.matrixWorldInverse);
    if(v.z>=-.01) return 95;
    needed=Math.max(needed,Math.atan(Math.abs(v.y)/-v.z),Math.atan(Math.abs(v.x)/-v.z/aspect));
  }
  return needed*2/DEG;
}

export function applyDatasetCamera(camera:PerspectiveCamera,params:SimulationParams,t:TelemetryState,aspect:number):void {
  const jitter=new Vector3(...(params.cameraJitter??[0,0,0]));
  const rotation=new Quaternion().setFromEuler(new Euler(...t.tugRotation));
  const onTug=(p:Vector3)=>p.add(jitter).applyQuaternion(rotation).add(new Vector3(...t.tugPosition));
  const towTarget=new Vector3(...t.lineStartPoint).add(new Vector3(0,1.2,0));
  camera.up.set(0,1,0);
  if(params.cameraMode==='TUG_AFT_DECK') {
    camera.position.copy(onTug(new Vector3(-2.3,2.55,-4.3)));
    camera.up.applyQuaternion(rotation);
    camera.fov=params.cameraFov??68;
    camera.lookAt(towTarget);
  } else if(params.cameraMode==='TUG_BRIDGE') {
    camera.position.copy(onTug(new Vector3(0,3.9,-.4)));
    camera.up.applyQuaternion(rotation);
    camera.fov=80;
    const lineTarget=towTarget.clone().lerp(new Vector3(...t.tugPosition),.25);
    lineTarget.y=2;
    camera.lookAt(lineTarget);
  } else if(params.cameraMode==='TUG_SAG_CAM') {
    // Port bridge-wing mount: the towline leaves the staple below and ahead of
    // the lens, so the chord and its sag stay inside a fixed composition.
    camera.position.copy(onTug(new Vector3(-3.6,5.2,-3.2)));
    camera.up.applyQuaternion(rotation);
    camera.aspect=aspect;
    const {start,end}=getTowlineAnchors(t);
    // Aim along the bisector of the two attachment directions so the whole
    // chord sits symmetrically in frame; bias slightly downward for the sag.
    const toStart=start.clone().sub(camera.position).normalize();
    const toEnd=end.clone().sub(camera.position).normalize();
    const aim=toStart.add(toEnd).normalize();
    aim.y-=.12;
    camera.lookAt(camera.position.clone().add(aim.normalize().multiplyScalar(20)));
    const [yaw,pitch,roll]=params.cameraRotationJitter??[0,0,0];
    camera.rotateY(yaw*DEG);camera.rotateX(pitch*DEG);camera.rotateZ(roll*DEG);
    camera.updateMatrixWorld(true);
    // Zoom out only as far as needed so both attachment points stay in frame
    // when the line swings wide (large steering angles).
    camera.fov=Math.min(95,Math.max(params.cameraFov??60,requiredVerticalFov(camera,[start,end],aspect)*1.2));
  } else {
    const center=new Vector3().addVectors(new Vector3(...t.shipPosition),new Vector3(...t.tugPosition)).multiplyScalar(.5);
    center.y=3;
    const offsets={astern:[76,48,-75],port:[-80,60,-65],starboard:[80,60,65],ahead:[-70,60,95]} as const;
    camera.position.copy(center).add(new Vector3(...offsets[params.towPosition??'astern'])).addScaledVector(jitter,30);
    camera.fov=params.cameraFov??43;
    camera.lookAt(center);camera.updateMatrixWorld(true);
    const bounds=[new Vector3(-8,0,-40),new Vector3(8,24,40),new Vector3(-8,24,40),new Vector3(8,0,-40)].map(p=>p.add(new Vector3(...t.shipPosition)));
    bounds.push(new Vector3(...t.tugPosition).addScalar(7),new Vector3(...t.tugPosition).addScalar(-7));
    camera.fov=Math.min(95,Math.max(camera.fov,requiredVerticalFov(camera,bounds,aspect)*1.12));
  }
  camera.aspect=aspect;
  camera.near=.15;
  camera.far=1800;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export const isOnboardCamera=(mode:SimulationParams['cameraMode'])=>mode==='TUG_AFT_DECK'||mode==='TUG_BRIDGE'||mode==='TUG_SAG_CAM';
