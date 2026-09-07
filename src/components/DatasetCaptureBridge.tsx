import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Mesh, Object3D, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { applyDatasetCamera } from '../dataset/camera';
import { projectBoxToYolo } from '../dataset/projection';
import type { CaptureSample, CapturedFrame, FrameLabel, SceneCaptureApi } from '../dataset/types';

interface Props {
  sample:CaptureSample|null;
  tug:React.RefObject<Object3D>;
  ship:React.RefObject<Object3D>;
  rope:React.RefObject<Mesh>;
  onReady:(api:SceneCaptureApi|null)=>void;
}
interface Pending {id:string;frames:number;resolve:(frame:CapturedFrame)=>void;reject:(error:Error)=>void;clean:()=>void}
const abortError=()=>new DOMException('캡처 취소됨','AbortError');
function belongsTo(object:Object3D,parent:Object3D):boolean {
  for(let node:Object3D|null=object;node;node=node.parent) if(node===parent)return true;
  return false;
}

// Reject wholly hidden targets. Partial occlusion retains the requested amodal
// Box3 label, rather than pretending to provide pixel segmentation ground truth.
function hasVisibleSurface(target:Object3D,box:Box3,camera:PerspectiveCamera,occluders:Object3D[]):boolean {
  const probes:Vector3[]=[];
  target.traverseVisible(object=>{
    if(!(object instanceof Mesh)||probes.length>=80)return;
    const positions=object.geometry.getAttribute('position');
    if(!positions)return;
    for(let i=0;i<positions.count&&probes.length<80;i+=Math.max(1,Math.floor(positions.count/12))) {
      const point=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);
      if(box.containsPoint(point))probes.push(point);
    }
  });
  // Surface samples plus interior probes cover broad stern hull geometry.
  probes.push(box.getCenter(new Vector3()));
  const ray=new Raycaster(), direction=new Vector3();
  for(const point of probes) {
    const projected=point.clone().project(camera);
    if(Math.abs(projected.x)>1||Math.abs(projected.y)>1||Math.abs(projected.z)>1)continue;
    direction.subVectors(point,camera.position);
    const distance=direction.length();
    ray.set(camera.position,direction.normalize());ray.near=camera.near;ray.far=distance+.1;
    const hit=ray.intersectObjects(occluders,true)[0];
    if(hit&&belongsTo(hit.object,target)&&box.clone().expandByScalar(.15).containsPoint(hit.point))return true;
  }
  return false;
}

export function DatasetCaptureBridge({sample,tug,ship,rope,onReady}:Props) {
  const {gl,scene,camera}=useThree();
  const pending=useRef<Pending|null>(null);
  const captureCamera=useMemo(()=>new PerspectiveCamera(),[]);
  useEffect(()=>{
    const fail=(error:Error)=>{const p=pending.current;pending.current=null;if(p){p.clean();p.reject(error);}};
    onReady({capture:(id,signal)=>new Promise((resolve,reject)=>{
      if(signal.aborted){reject(abortError());return;}
      if(pending.current){reject(new Error('캡처가 이미 진행 중입니다.'));return;}
      const aborted=()=>fail(abortError());
      const timeout=setTimeout(()=>fail(new Error('렌더링이 지연되었습니다. 이 탭을 활성화하고 다시 실행하세요.')),30000);
      signal.addEventListener('abort',aborted,{once:true});
      pending.current={id,frames:0,resolve,reject,clean:()=>{clearTimeout(timeout);signal.removeEventListener('abort',aborted);}};
    })});
    const lost=()=>fail(new Error('WebGL 연결이 끊겼습니다. 장수를 줄여 다시 실행하세요.'));
    gl.domElement.addEventListener('webglcontextlost',lost);
    return ()=>{onReady(null);fail(abortError());gl.domElement.removeEventListener('webglcontextlost',lost);};
  },[gl,onReady]);

  // Positive priority owns the final render: transforms and shader uniforms
  // from every normal useFrame subscriber have already been applied.
  useFrame(()=>{
    const p=pending.current;
    if(!p||!sample||p.id!==sample.id||++p.frames<2) {gl.render(scene,camera);return;}
    pending.current=null;p.clean();
    const oldSize=gl.getSize(new Vector2()), oldDpr=gl.getPixelRatio();
    try {
      if(!tug.current||!ship.current)throw new Error('선박 모델이 준비되지 않았습니다.');
      applyDatasetCamera(captureCamera,sample.params,sample.telemetry,sample.width/sample.height);
      gl.setPixelRatio(1);gl.setSize(sample.width,sample.height,false);
      scene.updateMatrixWorld(true);
      gl.render(scene,captureCamera);
      const jpeg=gl.domElement.toDataURL('image/jpeg',.9);
      const labels:FrameLabel[]=[];
      const ocean=scene.getObjectByName('ocean-surface');
      const occluders=[ship.current,tug.current,...(rope.current?[rope.current]:[]),...(ocean?[ocean]:[])];
      const add=(classId:number,target:Object3D,box:Box3)=>{
        const projected=projectBoxToYolo(box,captureCamera);
        if(projected&&projected.width*sample.width>=1&&projected.height*sample.height>=1&&hasVisibleSurface(target,box,captureCamera,occluders))labels.push({classId,box:projected});
      };
      const onboard=sample.params.cameraMode==='TUG_AFT_DECK'||sample.params.cameraMode==='TUG_BRIDGE';
      if(!onboard)add(0,tug.current,new Box3().setFromObject(tug.current,true));
      if(rope.current&&!sample.params.quickReleaseActive) {
        add(Number(rope.current.userData.datasetClass),rope.current,new Box3().setFromObject(rope.current,true));
      }
      const sternBox=new Box3().setFromObject(ship.current,true);
      sternBox.min.y=Math.max(sternBox.min.y,-.1);
      sternBox.max.z=Math.min(sternBox.max.z,sample.telemetry.shipPosition[2]-21);
      add(3,ship.current,sternBox);
      p.resolve({jpeg,labels,camera:{position:captureCamera.position.toArray(),quaternion:captureCamera.quaternion.toArray(),fov:captureCamera.fov,aspect:captureCamera.aspect,near:captureCamera.near,far:captureCamera.far}});
    } catch(error) {p.reject(error instanceof Error?error:new Error('프레임 캡처 실패'));}
    finally {gl.setPixelRatio(oldDpr);gl.setSize(oldSize.x,oldSize.y,false);gl.render(scene,camera);}
  },1);
  return null;
}
