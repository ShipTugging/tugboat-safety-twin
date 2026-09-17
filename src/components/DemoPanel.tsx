import { useEffect, useState } from 'react';
import type { ServerAnalysis } from '../hooks/useServerAnalysis';
import type { SimulationParams } from '../types/maritime';
import { fusionLabel, riskLabel, riskReasonLabel } from '../server/protocol';
import { KOREAN_PRESETS } from './ControlPanel';
import { clampScenarioValue, SCENARIO_CONTROL_RANGES, type NumericScenarioControl } from './scenarioControlModel';

type Props = { analysis: ServerAnalysis; params: SimulationParams; onChange: (value: Partial<SimulationParams>) => void; onReset: () => void; onTools: () => void };
const controls: {key: NumericScenarioControl; label: string; values: number[]}[] = [
  {key:'tugSteeringAngle',label:'예인선 방향',values:[0,18,68,85]},
  {key:'towLineLength',label:'예인줄 길이',values:[20,32,55]},
  {key:'shipSpeed',label:'큰 배 속도',values:[0,6,10,14]},
];
export function DemoPanel({analysis:a,params,onChange,onReset,onTools}:Props) {
  const [settings,setSettings]=useState(false);
  const [age,setAge]=useState(0);
  useEffect(()=>{if(a.state==='error')setSettings(true);},[a.state]);
  useEffect(()=>{setAge(0);const start=Date.now();const timer=setInterval(()=>setAge(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[a.result]);
  const r=a.result?.response;
  const active=a.state==='running'||a.state==='connecting';
  const fresh=a.state==='running'&&!a.paused&&age<3;
  const reason=['RISK_HELD','ROLL_CRITICAL','ROLL_RISING_FAST','ANGLE_AND_ROLL','ROLL_DEVELOPING','ROLL_RISING','RAPID_TIGHTENING','ROLL_RISK','ANGLE_CHANGE','SAG_LOADED','WITHIN_POLICY'].find(code=>r?.reason_codes?.includes(code));
  const observation=!r?'분석 시작 후 표시':r.observation_status==='valid'?'예인줄 감지됨':r.vision?.towline_detected?'예인줄 감지 불안정':'예인줄 감지되지 않음';
  return <aside className="demo-panel" aria-label="실시간 분석과 조작">
    <div className="demo-heading"><h2>실시간 분석</h2><span className={'connection-dot '+a.state}>{a.paused?'일시 중지':a.state==='running'?'연결됨':a.state==='connecting'?'연결 중':a.state==='error'?'연결 오류':'연결 전'}</span></div>
    <section className={'demo-verdict '+(r&&fresh?r.risk_state:'idle')} aria-live="polite">
      <div><small>{r&&!fresh?`마지막 결과 / ${age}초 전`:'AI 위험 판단'}</small><strong>{r?riskLabel(r.risk_state):'분석 대기'}</strong></div>
      <p>{r?(reason?riskReasonLabel(reason):'판단에 필요한 정보를 확인하고 있습니다'):'서버를 연결하면 위험 상태를 확인할 수 있습니다.'}</p>
    </section>
    <div className="demo-camera server-camera">
      {a.result?<><img src={a.result.frame.jpeg} alt="AI가 분석한 예인줄 CCTV"/>{r?.vision?.mask_base64&&<div className="server-mask" role="img" aria-label="예인줄 감지 영역" style={{maskImage:`url(data:image/png;base64,${r.vision.mask_base64})`}}/>}</>:<div className="camera-placeholder"><span>예인줄 감지 영상</span><small>분석 시작 후 감지 영역이 표시됩니다</small></div>}
      <span className="camera-caption">{observation}</span>
    </div>
    <div className="demo-fusion">{r?fusionLabel(r.fusion_mode):'영상 + 기울기 센서'}<span>{a.result?`${a.result.latency} ms`:'고정 CCTV 입력'}</span></div>
    <div className="demo-metrics"><div><span>줄 처짐 비율</span><b>{r?.sag_ratio==null?'—':r.sag_ratio.toFixed(3)}</b></div><div><span>처짐 변화 /초</span><b>{r?.sag_ratio_rate_per_s==null?'—':r.sag_ratio_rate_per_s.toFixed(3)}</b></div><div><span>배 기울기</span><b>{r?`${r.roll_deg.toFixed(1)}°`:'—'}</b></div></div>
    <section className="demo-controls" aria-label="시연 조절">
      <div className="demo-control-title"><h3>시연 조절</h3><button onClick={onReset} disabled={a.paused}>장면 초기화</button></div>
      <div className="demo-presets">{KOREAN_PRESETS.slice(0,2).map((preset,index)=><button key={preset.id} disabled={a.paused} onClick={()=>onChange({...preset.params,quickReleaseActive:false})}>{index===0?'기본 운항':'방향 크게 변경'}</button>)}</div>
      {controls.map(c=><label className="demo-control" key={c.key}><span>{c.label}<small>{SCENARIO_CONTROL_RANGES[c.key].unit}</small></span><input aria-label={c.label} type="number" min={SCENARIO_CONTROL_RANGES[c.key].min} max={SCENARIO_CONTROL_RANGES[c.key].max} step={SCENARIO_CONTROL_RANGES[c.key].step} value={params[c.key]} disabled={a.paused} onChange={e=>onChange({[c.key]:clampScenarioValue(c.key,Number(e.target.value))})}/><div>{c.values.map(v=><button key={v} type="button" disabled={a.paused} onClick={()=>onChange({[c.key]:v})}>{v}</button>)}</div></label>)}
    </section>
    <div className="demo-connection"><button className="demo-start" disabled={a.paused&&!active} onClick={active?a.stop:a.connect}>{active?'분석 중지':'분석 시작'}</button><button onClick={()=>setSettings(!settings)} aria-expanded={settings}>연결 설정</button><button onClick={onTools}>추가 도구</button></div>
    <p className="demo-status" role="status">{a.paused?'데이터 생성 중 / 분석 일시 중지':a.state==='error'?a.message:r&&!fresh?'마지막 결과 표시 중':a.state==='running'?'분석 중 / 녹색 영역은 AI가 감지한 줄입니다':'선수 기준 / 서버 연결 후 분석 시작'}</p>
    {settings&&<div className="demo-settings"><label>분석 서버 주소<input aria-label="분석 서버 주소" value={a.url} disabled={active} onChange={e=>a.setUrl(e.target.value)}/></label><button disabled={active||a.paused} onClick={a.reset}>분석 기록 초기화</button><button onClick={()=>setSettings(false)}>닫기</button></div>}
  </aside>;
}
