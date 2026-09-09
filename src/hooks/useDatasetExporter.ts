import { useCallback, useEffect, useRef, useState } from 'react';
import { randomizeEnvironment, seededRandom } from '../dataset/environment';
import { applySagTarget, randomizeSagScene } from '../dataset/sagScene';
import { settlePhysics } from '../simulation/physics';
import { classNamesFor } from '../dataset/types';
import type { CaptureSample, CapturedFrame, DatasetKind, SceneCaptureApi } from '../dataset/types';
import type { frameMetadata } from '../dataset/archive';
import type { TowPosition } from '../types/maritime';
import { resolveCapturePosition, type CapturePosition } from '../dataset/position';
import { randomizeLens, type LensSelection } from '../dataset/lens';

export function useDatasetExporter(currentPosition:TowPosition='astern') {
  const [capturePosition,setCapturePosition]=useState<CapturePosition>('current');
  const [lensSelection,setLensSelection]=useState<LensSelection>('mixed');
  const [enabled,setEnabled]=useState(false);
  const [kind,setKind]=useState<DatasetKind>('sag');
  const [count,setCount]=useState(100);
  const [seed,setSeed]=useState(1043);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [sample,setSample]=useState<CaptureSample|null>(null);
  const [archiveBlob,setArchiveBlob]=useState<Blob|null>(null);
  const [archiveKind,setArchiveKind]=useState<DatasetKind>('sag');
  const [preview,setPreview]=useState<CapturedFrame|null>(null);
  const [previewMode,setPreviewMode]=useState('');
  const [classCounts,setClassCounts]=useState<number[]>([]);
  const captureApi=useRef<SceneCaptureApi|null>(null);
  const abort=useRef<AbortController|null>(null);
  const runId=useRef(0);
  const mounted=useRef(true);
  const setCaptureApi=useCallback((api:SceneCaptureApi|null)=>{captureApi.current=api;},[]);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;abort.current?.abort();};},[]);
  const cancel=useCallback(()=>abort.current?.abort(),[]);
  const fileName=(k:DatasetKind)=>k==='sag'?'towline_sag_seg_dataset.zip':'synthetic_tug_dataset.zip';
  const download=useCallback(async()=>{
    if(archiveBlob) { const {saveAs}=await import('file-saver');saveAs(archiveBlob,fileName(archiveKind)); }
  },[archiveBlob,archiveKind]);
  const start=async()=>{
    if(abort.current) return;
    if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(seed)||seed<0||seed>4294967295) {
      setError('장수는 1~500, 시드는 0~4294967295 정수로 입력하세요.');return;
    }
    if(!captureApi.current) {setError('3D 장면이 준비된 후 다시 시도하세요.');return;}
    const controller=new AbortController();abort.current=controller;
    const id=++runId.current;
    const runKind=kind;
    const runPosition=capturePosition,runCurrentPosition=currentPosition,runLens=lensSelection;
    const classes=classNamesFor(runKind);
    const throwIfCancelled=()=>{if(controller.signal.aborted)throw new DOMException('취소됨','AbortError');};
    setBusy(true);setProgress(0);setStatus('준비 중');setError('');setArchiveBlob(null);setPreview(null);setClassCounts(classes.map(()=>0));
    try {
      const [{default:JSZip},archive,{saveAs}]=await Promise.all([import('jszip'),import('../dataset/archive'),import('file-saver')]);
      throwIfCancelled();
      const zip=new JSZip(), random=seededRandom(seed);
      const metadata:ReturnType<typeof frameMetadata>[]=[];
      const counts=classes.map(()=>0);
      let bytes=0;
      for(let index=0;index<count;index++) {
        throwIfCancelled();
        const time=60+index*.73+random()*30;
        const towPosition=resolveCapturePosition(runPosition,runCurrentPosition,index);
        let params=runKind==='sag'?randomizeSagScene(random,index,towPosition):{...randomizeEnvironment(random,index),towPosition};
        const telemetry=settlePhysics(params,time*1000);
        if(runKind==='sag') params=applySagTarget(params,telemetry,index,random);
        // Lens sampling is independent of position and sag class.
        params={...params,...randomizeLens(random,runLens)};
        const next:CaptureSample={id:`${id}:${index}`,index,kind:runKind,params,telemetry,time,width:960,height:540};
        setSample(next);setStatus(`${index+1} / ${count} 캡처`);
        const frame=await captureApi.current!.capture(next.id,controller.signal);
        throwIfCancelled();
        bytes+=archive.addFrame(zip,index,frame,runKind);
        if(bytes>150*1024*1024) throw new Error('ZIP 메모리 한도에 도달했습니다. 장수를 줄여 다시 실행하세요.');
        metadata.push(archive.frameMetadata(next,frame));
        frame.labels.forEach(label=>{if(label.classId<counts.length)counts[label.classId]++;});
        setProgress(Math.round((index+1)/count*90));
        if(index===count-1) {setPreview(frame);setPreviewMode(`${params.cameraMode} · ${towPosition} · ${params.lensCondition}`);}
      }
      archive.addManifest(zip,seed,metadata,runKind);
      setStatus('ZIP 생성 중');
      const blob=await zip.generateAsync({type:'blob',compression:'STORE'},meta=>{
        throwIfCancelled();
        if(mounted.current)setProgress(90+Math.round(meta.percent*.1));
      });
      throwIfCancelled();
      if(mounted.current) {
        setArchiveBlob(blob);setArchiveKind(runKind);setClassCounts(counts);setProgress(100);setStatus(`${count}장 생성 완료`);
        saveAs(blob,fileName(runKind));
      }
    } catch(caught) {
      if(mounted.current) {
        if(controller.signal.aborted) {setStatus('생성 취소됨');setPreview(null);}
        else {setError(caught instanceof Error?caught.message:'데이터 생성에 실패했습니다.');setStatus('');}
      }
    } finally {
      abort.current=null;
      if(mounted.current){setSample(null);setBusy(false);}
    }
  };
  return {enabled,setEnabled,kind,setKind,count,setCount,seed,setSeed,busy,progress,status,error,sample,archiveBlob,archiveKind,preview,previewMode,classCounts,setCaptureApi,start,cancel,download,capturePosition,setCapturePosition,currentPosition,lensSelection,setLensSelection};
}
export type DatasetController=ReturnType<typeof useDatasetExporter>;
