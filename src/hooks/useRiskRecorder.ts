import { useEffect, useRef, useState } from 'react';
import type { SimulationParams } from '../types/maritime';
import type { CaptureSample } from '../dataset/types';
import type { RiskScenario, RiskSequence } from '../simulation/riskSequence';
import { playbackFrameIndex } from '../simulation/playback';

export function useRiskRecorder(params:SimulationParams,datasetBusy:boolean) {
  const [scenario,setScenario]=useState<RiskScenario>('normal_to_girting_slow');
  const [result,setResult]=useState<RiskSequence|null>(null);
  const [graph,setGraph]=useState('');
  const [sample,setSample]=useState<CaptureSample|null>(null);
  const [busy,setBusy]=useState(false);
  const [cursor,setCursor]=useState(0);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const token=useRef(0),raf=useRef(0),locked=useRef(false);
  useEffect(()=>()=>{token.current++;cancelAnimationFrame(raf.current);},[]);
  const stop=()=>{
    token.current++;cancelAnimationFrame(raf.current);locked.current=false;
    setBusy(false);setSample(null);setStatus(result?'재생 중지 · 생성된 로그는 다운로드할 수 있습니다.':'생성 취소됨');
  };
  const start=async()=>{
    if(locked.current||datasetBusy)return;
    locked.current=true;const id=++token.current,base={...params};
    setBusy(true);setError('');setStatus('연속 시뮬레이션 계산 중');setCursor(0);
    try {
      const engine=await import('../simulation/riskSequence');
      if(id!==token.current)return;
      const sequence=engine.generateRiskSequence(base,scenario);
      setResult(sequence);setGraph('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(engine.sequenceSvg(sequence)));
      setStatus('로그 생성 완료 · 20초 재생 중');
      const started=performance.now();
      const tick=(now:number)=>{
        if(id!==token.current)return;
        const elapsed=(now-started)/1000;
        const index=playbackFrameIndex(elapsed,sequence.sampleRateHz,sequence.frames.length);
        const frame=sequence.frames[index];setCursor(index);
        setSample({id:`risk:${id}:${index}`,index,kind:'sag',params:frame.params,telemetry:frame.telemetry,time:frame.telemetry.timestamp/1000,width:960,height:540});
        if(elapsed>=sequence.durationSec) {
          locked.current=false;setBusy(false);setSample(null);setStatus('재생 완료 · CSV 다운로드 가능');return;
        }
        raf.current=requestAnimationFrame(tick);
      };
      raf.current=requestAnimationFrame(tick);
    } catch(caught) {
      if(id===token.current){locked.current=false;setBusy(false);setSample(null);setError(caught instanceof Error?caught.message:'로그 생성 실패');}
    }
  };
  const download=async()=>{
    if(!result)return;
    const [{sequenceCsv},{saveAs}]=await Promise.all([import('../simulation/riskSequence'),import('file-saver')]);
    saveAs(new Blob([sequenceCsv(result)],{type:'text/csv;charset=utf-8'}),`${result.scenario}.csv`);
  };
  const compare=async()=>{
    if(locked.current||datasetBusy)return;
    locked.current=true;const id=++token.current,base={...params};
    setBusy(true);setError('');setStatus('3종 비교 로그 생성 중');
    try {
      const [engine,{default:JSZip},{saveAs}]=await Promise.all([import('../simulation/riskSequence'),import('jszip'),import('file-saver')]);
      if(id!==token.current)return;
      const sequences=engine.RISK_SCENARIOS.map(item=>engine.generateRiskSequence(base,item.id));
      const zip=new JSZip();
      for(const seq of sequences){zip.file(`${seq.scenario}.csv`,engine.sequenceCsv(seq));zip.file(`${seq.scenario}.svg`,engine.sequenceSvg(seq));}
      zip.file('conditions.json',JSON.stringify(sequences.map(seq=>({scenario:seq.scenario,...seq.metadata})),null,2));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
      if(id!==token.current)return;
      saveAs(blob,'risk_transition_logs.zip');
      const selected=sequences.find(seq=>seq.scenario===scenario)!;
      setResult(selected);setGraph('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(engine.sequenceSvg(selected)));setCursor(0);
      setStatus('정상·느린 전환·빠른 전환 ZIP 다운로드 완료');
    } catch(caught) {if(id===token.current)setError(caught instanceof Error?caught.message:'비교 로그 생성 실패');}
    finally {if(id===token.current){locked.current=false;setBusy(false);setSample(null);}}
  };
  return {scenario,setScenario,result,graph,sample,busy,cursor,status,error,start,stop,download,compare};
}
export type RiskRecorder=ReturnType<typeof useRiskRecorder>;
