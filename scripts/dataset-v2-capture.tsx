import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Scene3D} from '../src/components/Scene3D';
import {generateV2,type MaskCheck,type V2Sink} from '../src/dataset/v2/export';
import {makeParent,makeVariant,planParents,v2Config,type V2Config} from '../src/dataset/v2/scenarios';
import type {SceneCaptureApi} from '../src/dataset/types';
import {captureV2,VisibleTowlinePass} from './dataset-v2-pass';
import type {V2CaptureHandler} from '../src/dataset/v2/capture';

declare global {
  interface Window {
    datasetV2?:{ready:boolean;generate:(config:V2Config,runId:string)=>Promise<unknown>};
    __v2Write:V2Sink;
    __v2CheckMask:(png:string,minimumIou:number)=>Promise<MaskCheck>;
  }
}
const p=planParents(v2Config)[0];
const initial=makeVariant(v2Config,p,0,0,'preview',makeParent(v2Config,p,0));
function DatasetV2Capture() {
  const [sample,setSample]=useState(initial),[ready,setReady]=useState(false);
  const api=useRef<SceneCaptureApi|null>(null),running=useRef(false);
  const pass=useMemo(()=>new VisibleTowlinePass(),[]);
  useEffect(()=>()=>pass.dispose(),[pass]);
  const onV2Capture=useCallback<V2CaptureHandler>((gl,scene,camera,rope,next)=>captureV2(pass,gl,scene,camera,rope,next),[pass]);
  const onReady=useCallback((value:SceneCaptureApi|null)=>{api.current=value;setReady(!!value);},[]);
  useEffect(()=>{
    window.datasetV2={ready,generate:async(config,runId)=>{
      if(running.current||!api.current)throw new Error('V2 capture not ready or already running');
      running.current=true;
      try {
        return await generateV2(config,runId,async next=>{
          setSample(next);const f=await api.current!.capture(next.id,new AbortController().signal);
          if(!f.v2)throw new Error('Expected V2 paired PNG capture');return f.v2;
        },window.__v2CheckMask,window.__v2Write,new AbortController().signal);
      } finally {running.current=false;}
    }};
    return ()=>{delete window.datasetV2;};
  },[ready]);
  return <div style={{width:1280,height:720}}><Scene3D params={sample.params} telemetry={sample.telemetry} captureSample={sample} captureBusy datasetMode liveCameraMode="TUG_SAG_CAM" onCaptureReady={onReady} onV2Capture={onV2Capture} onUpdatePhysics={()=>{}} onSelectCamera={()=>{}} onSelectTimeOfDay={()=>{}}/></div>;
}
createRoot(document.getElementById('root')!).render(<DatasetV2Capture/>);
