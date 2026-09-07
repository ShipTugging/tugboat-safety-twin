import JSZip from 'jszip';
import { formatYoloLabel } from './projection';
import { formatYoloSegLabel } from './segmentation';
import { CLASS_NAMES, SAG_CLASS_NAMES, classNamesFor } from './types';
import type { CapturedFrame, CaptureSample, DatasetKind } from './types';
import { SAG_LEVEL_THRESHOLDS } from '../simulation/towline';

export function frameName(index:number):string { return `frame_${String(index+1).padStart(4,'0')}`; }

const dataUrlBody=(url:string,prefix:string,message:string)=>{
  if(!url.startsWith(prefix)) throw new Error(message);
  return url.slice(url.indexOf(',')+1);
};

export function addFrame(zip:JSZip,index:number,frame:CapturedFrame,kind:DatasetKind='detection'):number {
  const base64=dataUrlBody(frame.jpeg,'data:image/jpeg;base64,','JPEG 프레임을 생성하지 못했습니다.');
  zip.file(`images/${frameName(index)}.jpg`,base64,{base64:true});
  let bytes=Math.ceil(base64.length*3/4);
  if(kind==='sag') {
    zip.file(`labels/${frameName(index)}.txt`,frame.labels.map(label=>formatYoloSegLabel(label.classId,label.polygon!,SAG_CLASS_NAMES.length-1)).join('\n')+'\n');
    if(frame.mask) {
      const mask=dataUrlBody(frame.mask,'data:image/png;base64,','마스크 PNG를 생성하지 못했습니다.');
      zip.file(`masks/${frameName(index)}.png`,mask,{base64:true});
      bytes+=Math.ceil(mask.length*3/4);
    }
  } else {
    zip.file(`labels/${frameName(index)}.txt`,frame.labels.map(label=>formatYoloLabel(label.classId,label.box)).join('\n')+'\n');
  }
  return bytes;
}

export function frameMetadata(sample:CaptureSample,frame:CapturedFrame) {
  return {
    image:`images/${frameName(sample.index)}.jpg`,label:`labels/${frameName(sample.index)}.txt`,
    ...(frame.mask?{mask:`masks/${frameName(sample.index)}.png`}:{}),
    width:sample.width,height:sample.height,environment:sample.params,
    simulationTime:sample.time,telemetry:sample.telemetry,camera:frame.camera,annotations:frame.labels,
    ...(frame.sag?{sag:frame.sag}:{}),
  };
}

export function sagCsv(frames:ReturnType<typeof frameMetadata>[]):string {
  const header='image,mask,sag_level,sag_ratio_3d,sag_m,span_m,sag_ratio_2d,visible_fraction,tension_kn,rope_slack_m,rope_length_m,time_of_day,fog_density,camera_fov';
  const rows=frames.filter(f=>f.sag).map(f=>[
    f.image,f.mask??'',f.sag!.truth.level,f.sag!.truth.sagRatio.toFixed(5),f.sag!.truth.sagM.toFixed(3),f.sag!.truth.spanM.toFixed(3),
    f.sag!.image?f.sag!.image.ratio.toFixed(5):'',f.sag!.visibleFraction.toFixed(3),f.telemetry.lineTensionKn,
    (f.environment.ropeSlackM??0).toFixed(2),f.sag!.truth.ropeLengthM.toFixed(2),f.environment.timeOfDay,f.environment.fogDensity.toFixed(5),(f.environment.cameraFov??0).toFixed(1),
  ].join(','));
  return [header,...rows].join('\n')+'\n';
}

export function addManifest(zip:JSZip,seed:number,frames:ReturnType<typeof frameMetadata>[],kind:DatasetKind='detection') {
  const classes=classNamesFor(kind);
  zip.file('classes.txt',classes.join('\n')+'\n');
  if(kind==='sag') {
    zip.file('data.yaml',['# Ultralytics YOLO-Seg dataset. Point train/val at separate captures (different seeds).','path: .','train: images','val: images','names:',...classes.map((name,i)=>`  ${i}: ${name}`)].join('\n')+'\n');
    zip.file('sag_labels.csv',sagCsv(frames));
  }
  zip.file('metadata.json',JSON.stringify({
    version:2,kind,seed,count:frames.length,classes,
    labelFormat:kind==='sag'?'YOLO-Seg polygons: class x1 y1 x2 y2 ... normalized. Towline polygons follow the visible tube silhouette (occluded runs removed by ray tests); Ship_Stern is a four-vertex box polygon.':'YOLO boxes: class x_center y_center width height normalized.',
    labelPolicy:kind==='sag'
      ?'Towline class = sag level of the rendered 3D curve (ratio = max chord deviation / chord length). masks/*.png are pixel-exact depth-tested renders of the rope (white = rope). Ego tug omitted; camera is the fixed port bridge-wing mount TUG_SAG_CAM.'
      :'Projected world AABB clipped to near/far and viewport; amodal partial occlusion. Ego tug omitted for onboard CCTV. Stern is the aft region (local z <= -21) of the main vessel. Fully invisible target rays are rejected.',
    ...(kind==='sag'?{sagLevelThresholds:SAG_LEVEL_THRESHOLDS,sagFormula:'SagRatio = MaximumDeviation / EndpointDistance; truth uses 3D geometry, image uses the projected visible centerline.'}:{}),
    tautRule:'Tension >= 320 kN or girtingStatus CRITICAL; shape and label share this rule.',
    splitPolicy:'Capture train and validation with independent seeds/runs. No automatic same-scene train/val split.',
    source:'Synthetic simulator outputs, not real sensor observations.',frames,
  },null,2));
}

export { CLASS_NAMES, SAG_CLASS_NAMES };
