import JSZip from 'jszip';
import { formatYoloLabel } from './projection';
import { formatYoloSegLabel } from './segmentation';
import { CLASS_NAMES, SAG_CLASS_NAMES, classNamesFor } from './types';
import type { CapturedFrame, CaptureSample, DatasetKind } from './types';
import { SAG_LEVEL_THRESHOLDS } from '../simulation/towline';
import { createSyncedImu, IMU_SPEC } from './imu';

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
  const frameId=frameName(sample.index);
  const imuRecord=createSyncedImu(frameId,sample.params,sample.telemetry);
  return {
    frameId,timestampMs:sample.telemetry.timestamp,
    imuFile:`imu/${frameId}.json`,imu:imuRecord.sample,imuRecord,
    image:`images/${frameName(sample.index)}.jpg`,label:`labels/${frameName(sample.index)}.txt`,
    ...(frame.mask?{mask:`masks/${frameName(sample.index)}.png`}:{}),
    width:sample.width,height:sample.height,environment:sample.params,
    simulationTime:sample.time,telemetry:sample.telemetry,camera:frame.camera,annotations:frame.labels,
    ...(frame.sag?{sag:frame.sag}:{}),
  };
}

/** One row per paired image, or the complete 100Hz history for every image. */
export function imuCsv(frames:ReturnType<typeof frameMetadata>[],windows=false):string {
  const columns=['frame_id','sequence_id','image','label','mask','imu_file','timestamp_ms','offset_ms','ax_mps2','ay_mps2','az_mps2','gx_rad_s','gy_rad_s','gz_rad_s','pitch_deg','yaw_deg','roll_deg','qx','qy','qz','qw','world_ax_mps2','world_ay_mps2','world_az_mps2','simulator_roll_rate_deg_s','tow_position','line_tension_kn','girting_risk_pct'];
  const rows=frames.flatMap(f=>(windows?f.imuRecord.samples:[f.imuRecord.sample]).map(sample=>[
    f.frameId,f.imuRecord.sequenceId,f.image,f.label,f.mask??'',f.imuFile,sample.timestampMs,sample.offsetMs,
    ...sample.accelerometerMps2,...sample.gyroscopeRadS,...sample.orientationEulerDeg,...sample.orientationQuaternion,
    ...sample.linearAccelerationWorldMps2,sample.simulatorRollRateDegS,f.environment.towPosition??'astern',f.telemetry.lineTensionKn,f.telemetry.girtingRiskPct,
  ].map(value=>typeof value==='number'?value.toFixed(9):value).join(',')));
  return [columns.join(','),...rows].join('\n')+'\n';
}

export function sagCsv(frames:ReturnType<typeof frameMetadata>[]):string {
  const header='image,mask,sag_level,sag_ratio_3d,sag_m,span_m,sag_ratio_2d,visible_fraction,tension_kn,rope_slack_m,rope_length_m,time_of_day,fog_density,camera_fov,tow_position,lens_condition,blur_px,lens_wetness,lens_seed';
  const rows=frames.filter(f=>f.sag).map(f=>[
    f.image,f.mask??'',f.sag!.truth.level,f.sag!.truth.sagRatio.toFixed(5),f.sag!.truth.sagM.toFixed(3),f.sag!.truth.spanM.toFixed(3),
    f.sag!.image?f.sag!.image.ratio.toFixed(5):'',f.sag!.visibleFraction.toFixed(3),f.telemetry.lineTensionKn,
    (f.environment.ropeSlackM??0).toFixed(2),f.sag!.truth.ropeLengthM.toFixed(2),f.environment.timeOfDay,f.environment.fogDensity.toFixed(5),(f.environment.cameraFov??0).toFixed(1),
    f.environment.towPosition??'astern',f.environment.lensCondition??'clear',f.environment.imageBlurPx??0,f.environment.lensWetness??0,f.environment.lensSeed??0,
  ].join(','));
  return [header,...rows].join('\n')+'\n';
}

export function addManifest(zip:JSZip,seed:number,frames:ReturnType<typeof frameMetadata>[],kind:DatasetKind='detection') {
  const classes=classNamesFor(kind);
  zip.file('classes.txt',classes.join('\n')+'\n');
  zip.file('imu.csv',imuCsv(frames));
  zip.file('imu_windows.csv',imuCsv(frames,true));
  zip.file('imu_schema.json',JSON.stringify(IMU_SPEC,null,2));
  for(const frame of frames)zip.file(frame.imuFile,JSON.stringify({...frame.imuRecord,image:frame.image,label:frame.label,mask:frame.mask??null},null,2));
  if(kind==='sag') {
    zip.file('data.yaml',['# Ultralytics YOLO-Seg dataset. Point train/val at separate captures (different seeds).','path: .','train: images','val: images','names:',...classes.map((name,i)=>`  ${i}: ${name}`)].join('\n')+'\n');
    zip.file('sag_labels.csv',sagCsv(frames));
  }
  zip.file('metadata.json',JSON.stringify({
    version:4,kind,seed,count:frames.length,classes,imuSchema:IMU_SPEC,
    towPositions:[...new Set(frames.map(f=>f.environment.towPosition??'astern'))],
    lensPolicy:'RGB-only Gaussian blur and seeded wet-lens droplets (local blur/glare, no spatial warp). Masks and Sag labels remain clean geometry ground truth; visible_fraction describes geometric occlusion, not optical visibility through droplets.',
    labelFormat:kind==='sag'?'YOLO-Seg polygons: class x1 y1 x2 y2 ... normalized. Towline polygons follow the visible tube silhouette (occluded runs removed by ray tests); Ship_Stern is a four-vertex box polygon.':'YOLO boxes: class x_center y_center width height normalized.',
    labelPolicy:kind==='sag'
      ?'Towline class = sag level of the rendered 3D curve (ratio = max chord deviation / chord length). masks/*.png are pixel-exact depth-tested renders of the rope (white = rope). Ego tug omitted; camera is the fixed port bridge-wing mount TUG_SAG_CAM.'
      :'Projected world AABB clipped to near/far and viewport; amodal partial occlusion. Ego tug omitted for onboard CCTV. Stern is the aft region (local z <= -21) of the main vessel. Fully invisible target rays are rejected.',
    ...(kind==='sag'?{sagLevelThresholds:SAG_LEVEL_THRESHOLDS,sagFormula:'SagRatio = MaximumDeviation / EndpointDistance; truth uses 3D geometry, image uses the projected visible centerline.'}:{}),
    tautRule:'Tension >= 320 kN or girtingStatus CRITICAL; shape and label share this rule.',
    splitPolicy:'Capture train and validation with independent seeds/runs. No automatic same-scene train/val split.',
    source:'Synthetic simulator outputs, not real sensor observations.',frames:frames.map(({imuRecord,...frame})=>frame),
  },null,2));
}

export { CLASS_NAMES, SAG_CLASS_NAMES };
