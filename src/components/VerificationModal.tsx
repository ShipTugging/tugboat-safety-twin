import React, { useEffect, useRef, useState } from 'react';
import { SimulationParams, TelemetryState } from '../types/maritime';
import { X, Play, CheckCircle2, Activity } from 'lucide-react';

interface Props {
  isOpen:boolean; onClose:()=>void; currentParams:SimulationParams;
  currentTelemetry:TelemetryState; onChangeParams:(params:Partial<SimulationParams>)=>void;
}
const scenarios = [
  { name:'거팅 위험', params:{tugSteeringAngle:72,towLineLength:26,shipSpeed:8.5,propellerRpm:60,towPosition:'ahead' as const,quickReleaseActive:false}},
  { name:'후류 진입', params:{tugSteeringAngle:4,towLineLength:28,shipSpeed:9,propellerRpm:115,towPosition:'astern' as const,quickReleaseActive:false}},
  { name:'선체 근접', params:{tugSteeringAngle:-22,towLineLength:14,shipSpeed:10,propellerRpm:50,towPosition:'astern' as const,quickReleaseActive:false}},
  { name:'예인줄 분리', params:{quickReleaseActive:true}},
];
export function VerificationModal({isOpen,onClose,currentParams,currentTelemetry,onChangeParams}:Props) {
  const [running,setRunning]=useState(false);
  const [active,setActive]=useState(-1);
  const [results,setResults]=useState<string[]>([]);
  const telemetry=useRef(currentTelemetry);
  const params=useRef(currentParams);
  const restore=useRef<SimulationParams|null>(null);
  const generation=useRef(0);
  const timer=useRef<ReturnType<typeof setTimeout>>();
  const dialog=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  const changeRef=useRef(onChangeParams);
  telemetry.current=currentTelemetry; params.current=currentParams;
  closeRef.current=onClose; changeRef.current=onChangeParams;
  const cancel=()=>{
    generation.current++;
    clearTimeout(timer.current);
    if(restore.current) { changeRef.current(restore.current); restore.current=null; }
    setRunning(false);
  };
  const close=()=>{cancel(); closeRef.current();};
  useEffect(()=>{
    if(!isOpen) return;
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape') { e.preventDefault(); close(); }
      if(e.key==='Tab') {
        const elements=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]');
        if(!elements?.length) return;
        const first=elements[0], last=elements[elements.length-1];
        if(e.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)) {e.preventDefault();last.focus();}
        else if(!Array.from(elements).includes(document.activeElement as HTMLElement) && document.activeElement!==dialog.current) {e.preventDefault();first.focus();}
        else if(!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return ()=>{generation.current++;clearTimeout(timer.current);if(restore.current) {changeRef.current(restore.current);restore.current=null;}document.removeEventListener('keydown',key);previous?.focus();};
  },[isOpen]);
  const run=()=>{
    if(running) return;
    dialog.current?.focus();
    const id=++generation.current;
    restore.current={...params.current};
    setRunning(true);setResults([]);
    const next=(index:number)=>{
      if(id!==generation.current) return;
      setActive(index);
      changeRef.current(scenarios[index].params);
      timer.current=setTimeout(()=>{
        if(id!==generation.current) return;
        const t=telemetry.current;
        const measurement = index===0 ? `위험 ${t.girtingRiskPct}% · 롤 ${t.imuRollDeg}° · ${t.girtingStatus}`
          : index===1 ? `난류 ${t.washTurbulencePct}% · ${t.inWashZone?'후류 내부':'후류 외부'}`
          : index===2 ? `이격 ${t.hullDistanceM.toFixed(1)}m · 흡인 ${t.suctionRiskPct}% · ${t.suctionStatus}`
          : `인장 ${t.lineTensionKn}kN · ${t.emergencyReleaseTriggered?'분리됨':'연결됨'}`;
        setResults(previous=>[...previous,measurement]);
        if(index<scenarios.length-1) next(index+1);
        else { if(restore.current) changeRef.current(restore.current);restore.current=null;setRunning(false);setActive(-1); }
      },1500);
    };
    next(0);
  };
  if(!isOpen) return null;
  return <div className="modal-backdrop"><div ref={dialog} className="scenario-modal" role="dialog" aria-modal="true" aria-labelledby="demo-title" tabIndex={-1}>
    <header><div><span className="eyebrow">SCENARIO CHECK</span><h2 id="demo-title">운항 시나리오 점검</h2></div><button className="icon-button" onClick={close} aria-label="점검창 닫기"><X size={20}/></button></header>
    <p>네 가지 상황을 순서대로 실행하고 현재 시뮬레이션 값을 기록합니다. 종료하거나 닫으면 이전 운항 설정으로 돌아갑니다.</p>
    <div className="demo-steps">{scenarios.map((step,i)=><div key={step.name}><span>{results[i]?<CheckCircle2 size={17}/>:<Activity size={17}/>}</span><div><strong>{step.name}</strong><p>{results[i] || (running && active===i ? '관측 중…':'대기')}</p></div></div>)}</div>
    <p className="demo-disclaimer">관측 기록이며 안전 인증·실선 검증 결과가 아닙니다. 위험 임계값에 도달하지 않은 시나리오는 실제 상태 그대로 표시됩니다.</p>
    <button className="demo-run" onClick={run} disabled={running}><Play size={15}/>{running?'시나리오 실행 중…':results.length?'다시 점검':'점검 시작'}</button>
  </div></div>;
}
