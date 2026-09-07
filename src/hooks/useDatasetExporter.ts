import { useCallback, useEffect, useRef, useState } from 'react';
import { randomizeEnvironment, seededRandom } from '../dataset/environment';
import { settlePhysics } from '../simulation/physics';
import type { CaptureSample, CapturedFrame, SceneCaptureApi } from '../dataset/types';
import type { frameMetadata } from '../dataset/archive';

export function useDatasetExporter() {
  const [enabled,setEnabled]=useState(false);
  const [count,setCount]=useState(100);
  const [seed,setSeed]=useState(1043);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [sample,setSample]=useState<CaptureSample|null>(null);
  const [archiveBlob,setArchiveBlob]=useState<Blob|null>(null);
  const [preview,setPreview]=useState<CapturedFrame|null>(null);
  const [previewMode,setPreviewMode]=useState('');
  const [classCounts,setClassCounts]=useState([0,0,0,0]);
  const captureApi=useRef<SceneCaptureApi|null>(null);
  const abort=useRef<AbortController|null>(null);
  const runId=useRef(0);
  const mounted=useRef(true);
  const setCaptureApi=useCallback((api:SceneCaptureApi|null)=>{captureApi.current=api;},[]);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;abort.current?.abort();};},[]);
  const cancel=useCallback(()=>abort.current?.abort(),[]);
  const download=useCallback(async()=>{
    if(archiveBlob) { const {saveAs}=await import('file-saver');saveAs(archiveBlob,'synthetic_tug_dataset.zip'); }
  },[archiveBlob]);
  const start=async()=>{
    if(abort.current) return;
    if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(seed)||seed<0||seed>4294967295) {
      setError('장수는 1~500, 시드는 0~4294967295 정수로 입력하세요.');return;
    }
    if(!captureApi.current) {setError('3D 장면이 준비된 후 다시 시도하세요.');return;}
    const controller=new AbortController();abort.current=controller;
    const id=++runId.current;
    const throwIfCancelled=()=>{if(controller.signal.aborted)throw new DOMException('취소됨','AbortError');};
    setBusy(true);setProgress(0);setStatus('준비 중');setError('');setArchiveBlob(null);setPreview(null);setClassCounts([0,0,0,0]);
    try {
      const [{default:JSZip},archive,{saveAs}]=await Promise.all([import('jszip'),import('../dataset/archive'),import('file-saver')]);
      throwIfCancelled();
      const zip=new JSZip(), random=seededRandom(seed);
      const metadata:ReturnType<typeof frameMetadata>[]=[];
      const counts=[0,0,0,0];
      let bytes=0;
      for(let index=0;index<count;index++) {
        throwIfCancelled();
        const params=randomizeEnvironment(random,index);
        const time=60+index*.73+random()*30;
        const next:CaptureSample={id:`${id}:${index}`,index,params,telemetry:settlePhysics(params,time*1000),time,width:960,height:540};
        setSample(next);setStatus(`${index+1} / ${count} 캡처`);
        const frame=await captureApi.current!.capture(next.id,controller.signal);
        throwIfCancelled();
        bytes+=archive.addFrame(zip,index,frame);
        if(bytes>150*1024*1024) throw new Error('ZIP 메모리 한도에 도달했습니다. 장수를 줄여 다시 실행하세요.');
        metadata.push(archive.frameMetadata(next,frame));
        frame.labels.forEach(label=>counts[label.classId]++);
        setProgress(Math.round((index+1)/count*90));
        if(index===count-1) {setPreview(frame);setPreviewMode(params.cameraMode);}
      }
      archive.addManifest(zip,seed,metadata);
      setStatus('ZIP 생성 중');
      const blob=await zip.generateAsync({type:'blob',compression:'STORE'},meta=>{
        throwIfCancelled();
        if(mounted.current)setProgress(90+Math.round(meta.percent*.1));
      });
      throwIfCancelled();
      if(mounted.current) {
        setArchiveBlob(blob);setClassCounts(counts);setProgress(100);setStatus(`${count}장 생성 완료`);
        saveAs(blob,'synthetic_tug_dataset.zip');
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
  return {enabled,setEnabled,count,setCount,seed,setSeed,busy,progress,status,error,sample,archiveBlob,preview,previewMode,classCounts,setCaptureApi,start,cancel,download};
}
export type DatasetController=ReturnType<typeof useDatasetExporter>;
