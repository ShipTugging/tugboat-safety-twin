import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Scene3D} from '../src/components/Scene3D';
import {createPhysicsState,stepMaritimePhysics} from '../src/simulation/physics';
import type {CaptureSample,SceneCaptureApi} from '../src/dataset/types';
import type {SimulationParams} from '../src/types/maritime';

const smooth=(x:number)=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u);};
function frames():CaptureSample[]{
 const state=createPhysicsState(),out:CaptureSample[]=[];
 for(let i=-90;i<600;i++){
  const t=Math.max(0,i/30),turn=smooth((t-5)/5),returning=smooth((t-15)/5);
  const params:SimulationParams={tugSteeringAngle:8+12*turn-9*returning,towLineLength:26+2*turn-2*returning,shipSpeed:3,propellerRpm:35,cameraMode:'TUG_SAG_CAM',timeOfDay:'day',quickReleaseActive:false,soundEnabled:false,fogDensity:.0003,towPosition:'astern',sunIntensity:1,waveStrength:.4,cameraFov:60,ropeRadius:.09,ropeColor:'#d8c4a0',ropeSagOverrideM:.08+1.1*smooth((t-10)/5)-.95*returning};
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
    const response=await fetch('/__video/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:next.index,jpeg:frame.jpeg,mask:next.index%30===0?frame.mask:undefined,metadata:{time_s:next.index/30,params:next.params,telemetry:next.telemetry,camera:frame.camera,sag:frame.sag}})});
    if(!response.ok)throw new Error(`저장 실패 ${response.status}`);
   }
   setStatus('600 / 600 완료');
  }catch(e){setStatus(`오류: ${e instanceof Error?e.message:String(e)}`);}
  finally{running.current=false;setBusy(false);}
 };
 return <><div style={{padding:12}}><button disabled={busy} onClick={start}>20초 영상 프레임 생성</button><span role="status" style={{marginLeft:20}}>{status}</span></div><div style={{width:1280,height:720}}><Scene3D params={sample.params} telemetry={sample.telemetry} onUpdatePhysics={()=>{}} onSelectCamera={()=>{}} onSelectTimeOfDay={()=>{}} captureSample={sample} captureBusy={true} datasetMode={true} liveCameraMode="TUG_SAG_CAM" onCaptureReady={React.useCallback((v:SceneCaptureApi|null)=>{api.current=v;},[])}/></div></>;
}
createRoot(document.getElementById('root')!).render(<VideoCapture/>);
