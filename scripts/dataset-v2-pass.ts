// Local-only adapter: production twin builds have no peer-project dependency.
import { Curve, Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { VisibleTowlinePass } from '../../tugboat-safety_dataset/src/dataset/visibleMask';
import { measureCenterline } from '../../tugboat-safety_dataset/src/dataset/geometry';
import { encodeDatasetPng } from '../src/dataset/lensRenderer';
import { v2Metadata, type V2Capture } from '../src/dataset/v2/capture';
import type { CaptureSample } from '../src/dataset/types';
export { VisibleTowlinePass };

export async function captureV2(pass:VisibleTowlinePass,gl:WebGLRenderer,scene:Scene,camera:PerspectiveCamera,rope:Mesh,sample:CaptureSample):Promise<V2Capture> {
  if(!rope.userData.curve)throw new Error('V2 towline curve unavailable');
  const pixels=pass.capture(gl,scene,camera,rope,sample.width,sample.height);
  const image=new Image();image.src=pixels.rgb;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=sample.width;canvas.height=sample.height;
  const context=canvas.getContext('2d');if(!context)throw new Error('V2 lens canvas unavailable');context.drawImage(image,0,0);
  return {rgb:encodeDatasetPng(canvas,sample.params),mask:pixels.mask,metadata:v2Metadata(sample,camera,rope,pixels.maskPixels,measureCenterline((rope.userData.curve as Curve<Vector3>).getSpacedPoints(99).map(point=>point.applyMatrix4(rope.matrixWorld))))};
}
