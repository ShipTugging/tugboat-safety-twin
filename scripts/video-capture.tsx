import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Scene3D} from '../src/components/Scene3D';
import {createPhysicsState,stepMaritimePhysics} from '../src/simulation/physics';
import {computeSagMetrics,getTowlineAnchors} from '../src/simulation/towline';
import type {CaptureSample,SceneCaptureApi} from '../src/dataset/types';
import type {SimulationParams} from '../src/types/maritime';

const smooth=(x:number)=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u);};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function frames():CaptureSample[]{
 const state=createPhysicsState(),out:CaptureSample[]=[];
 for(let i=-90;i<600;i++){
  const t=Math.max(0,i/30);
  // The bow test intentionally couples the line geometry to tow distance:
  // far = taut, close = slack. The same source values are recorded as metadata.
  const approach=smooth((t-5)/5),retreat=smooth((t-10)/5),nearFraction=clamp(approach-retreat);
  const towDistance=36-21*nearFraction;
  const sagM=.06+1.54*nearFraction;
  const steeringDeg=4+10*nearFraction;
  const params:SimulationParams={tugSteeringAngle:steeringDeg,towLineLength:towDistance,shipSpeed:3,propellerRpm:20,cameraMode:'TUG_SAG_CAM',timeOfDay:'day',quickReleaseActive:false,soundEnabled:false,fogDensity:.00015,towPosition:'ahead',sunIntensity:1,waveStrength:.25,cameraFov:64,ropeRadius:.14,ropeColor:'#d8c4a0',ropeSagOverrideM:sagM};
  const time=60+i/30,telemetry=stepMaritimePhysics(params,state,1/30,time*1000);
  if(i>=0)out.push({id:`video:${i}`,index:i,kind:'sag',params,telemetry,time,width:1280,height:720});
 }
 return out;
}
const sequence=frames();
function VideoCapture(){
 const api=useRef<SceneCaptureApi|null>(null),running=useRef(false);
 const [sample,setSample]=useState(sequence[0]),[status,setStatus]=useState('준비'),[busy,setBusy]=useState(false);
 const start=async()=>{
  if(running.current||!api.current)return;running.current=true;setBusy(true);
  const abort=new AbortController();
  try{
   for(const next of sequence){
    setSample(next);setStatus(`${next.index+1} / 600 프레임 저장`);
    const frame=await api.current.capture(next.id,abort.signal);
    const anchors=getTowlineAnchors(next.telemetry);
    const truth=computeSagMetrics(anchors.start,anchors.end,next.params.towLineLength,next.telemetry.lineTensionKn,next.telemetry.girtingStatus,next.params.ropeSlackM,next.params.ropeSagOverrideM);
    const response=await fetch('/__video/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:next.index,jpeg:frame.jpeg,metadata:{time_s:next.index/30,tow_position:'ahead',distance_m:next.params.towLineLength,near_fraction:clamp((next.params.towLineLength-15)/21),params:next.params,telemetry:next.telemetry,camera:frame.camera,sag:{truth,image:null,visibleFraction:null,ropeRadiusM:next.params.ropeRadius}}})});
    if(!response.ok)throw new Error(`저장 실패 ${response.status}`);
   }
   setStatus('600 / 600 완료');
  }catch(e){setStatus(`오류: ${e instanceof Error?e.message:String(e)}`);}
  finally{running.current=false;setBusy(false);}
 };
 return <><div style={{padding:12}}><button disabled={busy} onClick={start}>선수 예인줄 20초 영상 프레임 생성</button><span role="status" style={{marginLeft:20}}>{status}</span></div><div style={{width:1280,height:720}}><Scene3D params={sample.params} telemetry={sample.telemetry} onUpdatePhysics={()=>{}} onSelectCamera={()=>{}} onSelectTimeOfDay={()=>{}} captureSample={sample} captureBusy={true} datasetMode={true} liveCameraMode="TUG_SAG_CAM" onCaptureReady={React.useCallback((v:SceneCaptureApi|null)=>{api.current=v;},[])}/></div></>;
}
createRoot(document.getElementById('root')!).render(<VideoCapture/>);
