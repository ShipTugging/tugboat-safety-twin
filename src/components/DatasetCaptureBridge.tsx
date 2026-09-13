import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Color, Curve, LessEqualDepth, Mesh, MeshBasicMaterial, NoToneMapping, Object3D, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { applyDatasetCamera, isOnboardCamera } from '../dataset/camera';
import { projectBoxToYolo } from '../dataset/projection';
import { boxToPolygon, estimateSag2D, projectRopeSegmentation } from '../dataset/segmentation';
import type { CaptureSample, CapturedFrame, FrameLabel, SceneCaptureApi } from '../dataset/types';
import type { SagMetrics } from '../simulation/towline';
import { encodeDatasetJpeg } from '../dataset/lensRenderer';
import { applyV2Camera } from '../dataset/v2/scenarios';
import type { V2CaptureHandler } from '../dataset/v2/capture';

interface Props {
  sample:CaptureSample|null;
  tug:React.RefObject<Object3D>;
  ship:React.RefObject<Object3D>;
  rope:React.RefObject<Mesh>;
  onReady:(api:SceneCaptureApi|null)=>void;
  onV2Capture?:V2CaptureHandler;
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

/** Centerline sample is visible when the first surface along its ray is the rope tube itself. */
function ropeVisibility(rope:Mesh,camera:PerspectiveCamera,occluders:Object3D[]) {
  const ray=new Raycaster(), direction=new Vector3();
  return (point:Vector3)=>{
    direction.subVectors(point,camera.position);
    const distance=direction.length();
    ray.set(camera.position,direction.normalize());ray.near=camera.near;ray.far=distance+.05;
    const hit=ray.intersectObjects(occluders,true)[0];
    return !hit||hit.object===rope||hit.point.distanceTo(point)<.3;
  };
}

/**
 * Pixel-exact rope mask: fill the depth buffer with the whole scene in black,
 * then draw only the rope in white with a less-or-equal depth test so hidden
 * rope pixels stay black. Sky, fog, tone mapping and sprites are disabled.
 */
function renderRopeMask(gl:WebGLRenderer,scene:Scene,camera:PerspectiveCamera,rope:Mesh,black:MeshBasicMaterial,white:MeshBasicMaterial,maskScene:Scene,maskMesh:Mesh):string {
  const saved={background:scene.background,fog:scene.fog,override:scene.overrideMaterial,tone:gl.toneMapping,autoClear:gl.autoClear,clear:gl.getClearColor(new Color()),alpha:gl.getClearAlpha()};
  const hidden:Object3D[]=[];
  scene.traverse(object=>{const o=object as Object3D&{isPoints?:boolean;isSprite?:boolean;isLine?:boolean};if((o.isPoints||o.isSprite||o.isLine)&&o.visible){o.visible=false;hidden.push(o);}});
  try {
    scene.background=null;scene.fog=null;scene.overrideMaterial=black;
    gl.toneMapping=NoToneMapping;gl.setClearColor(0x000000,1);gl.autoClear=true;
    gl.render(scene,camera);
    maskMesh.geometry=rope.geometry;maskMesh.matrixWorld.copy(rope.matrixWorld);
    gl.autoClear=false;
    gl.render(maskScene,camera);
    return gl.domElement.toDataURL('image/png');
  } finally {
    hidden.forEach(o=>{o.visible=true;});
    scene.background=saved.background;scene.fog=saved.fog;scene.overrideMaterial=saved.override;
    gl.toneMapping=saved.tone;gl.autoClear=saved.autoClear;gl.setClearColor(saved.clear,saved.alpha);
    maskMesh.geometry=undefined as unknown as Mesh['geometry'];
  }
}

export function DatasetCaptureBridge({sample,tug,ship,rope,onReady,onV2Capture}:Props) {
  const {gl,scene,camera}=useThree();
  const pending=useRef<Pending|null>(null);
  const captureCamera=useMemo(()=>new PerspectiveCamera(),[]);
  const maskResources=useMemo(()=>{
    const black=new MeshBasicMaterial({color:0x000000,fog:false});
    const white=new MeshBasicMaterial({color:0xffffff,fog:false,depthFunc:LessEqualDepth});
    const maskScene=new Scene();
    const maskMesh=new Mesh(undefined,white);
    maskMesh.matrixAutoUpdate=false;maskMesh.frustumCulled=false;
    maskScene.add(maskMesh);
    return {black,white,maskScene,maskMesh};
  },[]);
  useEffect(()=>()=>{maskResources.black.dispose();maskResources.white.dispose();},[maskResources]);
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
  useFrame(async()=>{
    const p=pending.current;
    if(!p||!sample||p.id!==sample.id||++p.frames<2) {gl.render(scene,camera);return;}
    pending.current=null;p.clean();
    const oldSize=gl.getSize(new Vector2()), oldDpr=gl.getPixelRatio();
    try {
      if(!tug.current||!ship.current)throw new Error('선박 모델이 준비되지 않았습니다.');
      if(sample.v2) {
        if(!rope.current||sample.params.quickReleaseActive)throw new Error('V2 requires a positive towline scene');
        applyV2Camera(captureCamera,sample);scene.updateMatrixWorld(true);
        if(!onV2Capture)throw new Error('V2 local capture adapter unavailable');
        const frame=await onV2Capture(gl,scene,captureCamera,rope.current,sample);
        p.resolve({v2:frame,jpeg:'',labels:[],camera:frame.metadata.camera});
        return;
      }
      applyDatasetCamera(captureCamera,sample.params,sample.telemetry,sample.width/sample.height);
      gl.setPixelRatio(1);gl.setSize(sample.width,sample.height,false);
      scene.updateMatrixWorld(true);
      gl.render(scene,captureCamera);
      const jpeg=encodeDatasetJpeg(gl.domElement,sample.params);
      const labels:FrameLabel[]=[];
      const ocean=scene.getObjectByName('ocean-surface');
      const occluders=[ship.current,tug.current,...(rope.current?[rope.current]:[]),...(ocean?[ocean]:[])];
      const add=(classId:number,target:Object3D,box:Box3,polygon=false)=>{
        const projected=projectBoxToYolo(box,captureCamera);
        if(projected&&projected.width*sample.width>=1&&projected.height*sample.height>=1&&hasVisibleSurface(target,box,captureCamera,occluders)) {
          labels.push({classId,box:projected,...(polygon?{polygon:boxToPolygon(projected)}:{})});
        }
      };
      const onboard=isOnboardCamera(sample.params.cameraMode);
      const camera3={position:captureCamera.position.toArray(),quaternion:captureCamera.quaternion.toArray(),fov:captureCamera.fov,aspect:captureCamera.aspect,near:captureCamera.near,far:captureCamera.far};
      // The local video renderer only needs the RGB frame. Skipping YOLO boxes,
      // ray probes, segmentation and mask rendering keeps 600-frame video export
      // responsive; ordinary dataset captures retain the full path below.
      if(sample.id.startsWith('video:')) {
        p.resolve({jpeg,labels:[],camera:camera3});
        return;
      }
      if(sample.kind==='sag') {
        let mask:string|undefined, sag:CapturedFrame['sag'];
        if(rope.current&&!sample.params.quickReleaseActive) {
          const data=rope.current.userData as {curve?:Curve<Vector3>;radius?:number;sag?:SagMetrics};
          if(!data.curve||!data.sag||!data.radius) throw new Error('예인줄 곡선 정보가 준비되지 않았습니다.');
          const visible=ropeVisibility(rope.current,captureCamera,occluders);
          const segmentation=projectRopeSegmentation(data.curve,data.radius,captureCamera,sample.width,sample.height,visible);
          const box=projectBoxToYolo(new Box3().setFromObject(rope.current,true),captureCamera);
          for(const polygon of segmentation.polygons) {
            labels.push({classId:data.sag.level,box:box??{xCenter:.5,yCenter:.5,width:1,height:1},polygon});
          }
          sag={truth:data.sag,image:estimateSag2D(segmentation.centerline),visibleFraction:segmentation.visibleFraction,ropeRadiusM:data.radius};
          mask=renderRopeMask(gl,scene,captureCamera,rope.current,maskResources.black,maskResources.white,maskResources.maskScene,maskResources.maskMesh);
        }
        const sternBox=new Box3().setFromObject(ship.current,true);
        sternBox.min.y=Math.max(sternBox.min.y,-.1);
        sternBox.max.z=Math.min(sternBox.max.z,sample.telemetry.shipPosition[2]-21);
        add(5,ship.current,sternBox,true);
        p.resolve({jpeg,mask,labels,sag,camera:camera3});
        return;
      }
      if(!onboard)add(0,tug.current,new Box3().setFromObject(tug.current,true));
      if(rope.current&&!sample.params.quickReleaseActive) {
        add(Number(rope.current.userData.datasetClass),rope.current,new Box3().setFromObject(rope.current,true));
      }
      const sternBox=new Box3().setFromObject(ship.current,true);
      sternBox.min.y=Math.max(sternBox.min.y,-.1);
      sternBox.max.z=Math.min(sternBox.max.z,sample.telemetry.shipPosition[2]-21);
      add(3,ship.current,sternBox);
      p.resolve({jpeg,labels,camera:camera3});
    } catch(error) {p.reject(error instanceof Error?error:new Error('프레임 캡처 실패'));}
    finally {gl.setPixelRatio(oldDpr);gl.setSize(oldSize.x,oldSize.y,false);gl.render(scene,camera);}
  },1);
  return null;
}
