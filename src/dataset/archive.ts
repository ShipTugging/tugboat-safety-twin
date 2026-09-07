import JSZip from 'jszip';
import { formatYoloLabel } from './projection';
import { CLASS_NAMES } from './types';
import type { CapturedFrame, CaptureSample } from './types';

export function frameName(index:number):string { return `frame_${String(index+1).padStart(4,'0')}`; }

export function addFrame(zip:JSZip,index:number,frame:CapturedFrame):number {
  if(!frame.jpeg.startsWith('data:image/jpeg;base64,')) throw new Error('JPEG 프레임을 생성하지 못했습니다.');
  const base64=frame.jpeg.slice(frame.jpeg.indexOf(',')+1);
  zip.file(`images/${frameName(index)}.jpg`,base64,{base64:true});
  zip.file(`labels/${frameName(index)}.txt`,frame.labels.map(label=>formatYoloLabel(label.classId,label.box)).join('\n')+'\n');
  return Math.ceil(base64.length*3/4);
}

export function frameMetadata(sample:CaptureSample,frame:CapturedFrame) {
  return {
    image:`images/${frameName(sample.index)}.jpg`,label:`labels/${frameName(sample.index)}.txt`,
    width:sample.width,height:sample.height,environment:sample.params,
    simulationTime:sample.time,telemetry:sample.telemetry,camera:frame.camera,annotations:frame.labels,
  };
}

export function addManifest(zip:JSZip,seed:number,frames:ReturnType<typeof frameMetadata>[]) {
  zip.file('classes.txt',CLASS_NAMES.join('\n')+'\n');
  zip.file('metadata.json',JSON.stringify({
    version:1,seed,count:frames.length,classes:CLASS_NAMES,
    labelPolicy:'Projected world AABB clipped to near/far and viewport; amodal partial occlusion. Ego tug omitted for onboard CCTV. Stern is the aft region (local z <= -21) of the main vessel. Fully invisible target rays are rejected.',
    tautRule:'Tension >= 320 kN or girtingStatus CRITICAL; shape and label share this rule.',
    splitPolicy:'Capture train and validation with independent seeds/runs. No automatic same-scene train/val split.',
    source:'Synthetic simulator outputs, not real sensor observations.',frames,
  },null,2));
}
