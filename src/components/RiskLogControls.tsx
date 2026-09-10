import type { RiskRecorder } from '../hooks/useRiskRecorder';
import type { RiskScenario } from '../simulation/riskSequence';
import { Activity, Download, Play, Square } from 'lucide-react';

export function RiskLogControls({recorder,datasetBusy}:{recorder:RiskRecorder;datasetBusy:boolean}) {
  const r=recorder,frame=r.result?.frames[r.cursor];
  return <details className="risk-log-controls"><summary><Activity size={15}/>연속 위험 전환 로그</summary>
    <div className="risk-log-body">
      <label>시나리오<select aria-label="연속 로그 시나리오" value={r.scenario} disabled={r.busy||datasetBusy} onChange={e=>r.setScenario(e.target.value as RiskScenario)}>
        <option value="normal_steady">정상 유지</option><option value="normal_to_girting_slow">정상 → 위험 · 느리게</option><option value="normal_to_girting_fast">정상 → 위험 · 빠르게</option>
      </select></label>
      <p>같은 장면 · 20초 · 100Hz<br/>조향 {r.scenario==='normal_steady'?'12° 유지':'12°→72°'} · 6kn · 줄 32m · 45RPM</p>
      <div className="risk-log-actions">{r.busy?<button onClick={r.stop}><Square size={13}/>중지</button>:<button disabled={datasetBusy} onClick={r.start}><Play size={13}/>실행·로그 생성</button>}
        <button disabled={r.busy||datasetBusy} onClick={r.compare}><Download size={13}/>3종 비교 ZIP</button></div>
      {r.status&&<p role="status">{r.status}</p>}
      {r.error&&<p role="alert" className="dataset-error">{r.error}</p>}
      {r.result&&<><div className="risk-log-values"><span>{r.result.label} · {frame?.timeSec.toFixed(2)}s</span><span>Sag {frame?.sagRatio.toFixed(4)}</span><span>변화율 {frame?.sagRatioRatePerSec.toFixed(4)}/s</span><span>실제 각도 {frame?.angleDeg.toFixed(1)}°</span></div>
        <img src={r.graph} alt={`${r.result.label} Sag·변화율·각도·롤 시계열 그래프`}/>
        <button className="dataset-download" disabled={r.busy} onClick={r.download}><Download size={14}/>CSV 다운로드 · {r.result.frames.length.toLocaleString()}행</button></>}
      <p className="risk-log-note">모델 기반 임계값 후보 분석용. 정상 판정·위험 상태는 현재 시뮬레이터 규칙입니다.</p>
    </div>
  </details>;
}
