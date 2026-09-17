import { Activity, Camera, Gauge, RotateCcw, Server, Ship, Unplug } from 'lucide-react';
import type { ServerAnalysis } from '../hooks/useServerAnalysis';
import { fusionLabel, riskLabel } from '../server/protocol';
import type { SimulationParams, TowPosition } from '../types/maritime';
import { TOW_POSITION_LABELS } from '../simulation/towPosition';
import { BOW_BASELINE, clampScenarioValue, SCENARIO_CAMERA_MODES, SCENARIO_CONTROL_RANGES, type NumericScenarioControl } from './scenarioControlModel';

const POSITIONS: TowPosition[] = ['ahead', 'astern', 'port', 'starboard'];
const POSITION_HINTS: Record<TowPosition, string> = { ahead: '선수 기준', astern: '선미', port: '좌현', starboard: '우현' };
const CAMERA_LABELS: Record<SimulationParams['cameraMode'], string> = {
  TUG_SAG_CAM: 'CCTV 예인줄 감시', TUG_AFT_DECK: 'CCTV 선미 덱', TUG_BRIDGE: 'CCTV 조타실 80°',
  orbit: '자유 시점', tugChase: '예인선 추적', bridgeView: '선교 시점', topDown: '상공 시점', cinematic: '시네마틱',
};


function NumericControl({ control, label, value, quick, onChange, disabled }: { control: NumericScenarioControl; label: string; value: number; quick: readonly number[]; onChange: (value: number) => void; disabled: boolean }) {
  const range = SCENARIO_CONTROL_RANGES[control];
  return <div className="scenario-number-control">
    <label htmlFor={`scenario-${control}`}><span>{label}</span><b>{value}{range.unit}</b></label>
    <div className="scenario-number-row">
      <input id={`scenario-${control}`} aria-label={label} type="number" min={range.min} max={range.max} step={range.step} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}/>
      <div className="scenario-quick-values">{quick.map(option => <button key={option} type="button" disabled={disabled} aria-label={`${label} ${option}${range.unit}`} onClick={() => onChange(option)}>{option}</button>)}</div>
    </div>
  </div>;
}

export function ScenarioControlDock({ params, onChangeParams, onReset, onTriggerQuickRelease, analysis }: { params: SimulationParams; onChangeParams: (next: Partial<SimulationParams>) => void; onReset: () => void; onTriggerQuickRelease: () => void; analysis: ServerAnalysis }) {
  const locked = analysis.paused;
  const connected=analysis.state==='running'||analysis.state==='connecting';
  const result = analysis.result?.response;
  const statusLabel = analysis.state === 'running' ? '연결됨' : analysis.state === 'connecting' ? '연결 중' : analysis.state === 'error' ? '오류' : '대기';
  const setNumber = (control: NumericScenarioControl, value: number) => onChangeParams({ [control]: clampScenarioValue(control, value) } as Partial<SimulationParams>);
  const bow = params.towPosition === BOW_BASELINE.towPosition;
  return <section className="scenario-control-dock" aria-label="선수 기준 상세 설정">
    <div className="scenario-control-heading">
      <div><span className="eyebrow">SCENARIO / LIVE CONTROL</span><h3><Ship size={15} />선수 기준 상세 설정</h3></div>
      <div className="scenario-control-heading-actions"><span className={`bow-badge ${bow ? 'is-active' : ''}`}>{bow ? '선수 기준' : `현재 / ${TOW_POSITION_LABELS[params.towPosition ?? 'ahead']}`}</span><button type="button" onClick={onReset} disabled={locked}><RotateCcw size={13} />초기화</button></div>
    </div>
    <div className="scenario-control-grid">
      <div className="scenario-setting scenario-position-setting"><div className="scenario-setting-label"><span>예인 위치</span><small>선수 기준을 기본으로 유지</small></div><div className="scenario-segmented">{POSITIONS.map(position => <button key={position} type="button" disabled={locked} aria-pressed={(params.towPosition ?? 'ahead') === position} onClick={() => onChangeParams({ towPosition: position, quickReleaseActive: false })}><strong>{TOW_POSITION_LABELS[position]}</strong><small>{POSITION_HINTS[position]}</small></button>)}</div></div>
      <label className="scenario-setting scenario-camera-setting"><span className="scenario-setting-label"><span><Camera size={13} />카메라 시점</span><small>서버 입력 CCTV</small></span><select aria-label="선수 기준 카메라 시점" disabled={locked} value={params.cameraMode} onChange={event => onChangeParams({ cameraMode: event.target.value as SimulationParams['cameraMode'] })}>{SCENARIO_CAMERA_MODES.map(mode => <option key={mode} value={mode}>{CAMERA_LABELS[mode]}</option>)}</select></label>
      <NumericControl control="tugSteeringAngle" label="예인선 방향" value={params.tugSteeringAngle} quick={[-85, -68, 0, 68, 85]} disabled={locked} onChange={value => setNumber('tugSteeringAngle', value)} />
      <NumericControl control="towLineLength" label="예인줄" value={params.towLineLength} quick={[14, 20, 36, 55]} disabled={locked} onChange={value => setNumber('towLineLength', value)} />
      <NumericControl control="shipSpeed" label="큰 배 속도" value={params.shipSpeed} quick={[0, 6, 10, 14]} disabled={locked} onChange={value => setNumber('shipSpeed', value)} />
      <NumericControl control="propellerRpm" label="프로펠러 회전 속도" value={params.propellerRpm} quick={[0, 45, 80, 115]} disabled={locked} onChange={value => setNumber('propellerRpm', value)} />
    </div>
    <div className="scenario-server-glance">
      <div className="scenario-server-main"><span><Server size={14} />PYTHON / YOLO-Seg</span><strong className={`server-glance-status ${analysis.state}`}>{statusLabel}</strong><input aria-label="선수 기준 분석 서버 주소" value={analysis.url} disabled={locked||connected} onChange={event => analysis.setUrl(event.target.value)} /></div>
      <div className="scenario-server-metric"><span>{result&&(!connected||analysis.paused)?'마지막 서버 판정':'서버 판정'}</span><strong>{result ? riskLabel(result.risk_state) : '대기'}</strong></div>
      <div className="scenario-server-metric"><span>융합</span><strong>{result ? fusionLabel(result.fusion_mode) : '—'}</strong></div>
      <div className="scenario-server-metric"><span>신뢰도</span><strong>{result ? `${(result.confidence * 100).toFixed(0)}%` : '—'}</strong></div>
      <div className="scenario-server-metric"><span>Sag</span><strong>{result?.sag_ratio == null ? '—' : result.sag_ratio.toFixed(4)}</strong></div>
      <div className="scenario-server-metric"><span>롤</span><strong>{result ? `${result.roll_deg.toFixed(1)}°` : '—'}</strong></div>
      <div className="scenario-server-actions"><button type="button" disabled={analysis.paused&&!connected} onClick={connected ? analysis.stop : analysis.connect}>{connected ? '중지' : '연결'}</button><button type="button" disabled={connected || analysis.paused} onClick={analysis.reset}>초기화</button></div>
    </div>
    <div className="scenario-control-footer"><span><Gauge size={13} />현재 {params.towLineLength}m / {params.shipSpeed}kn / {params.propellerRpm}RPM</span><span><Activity size={13} />{analysis.paused ? '데이터 생성 중 / 서버 전송 일시 중지' : analysis.message}</span><button type="button" className="scenario-release-button" disabled={locked || analysis.paused} onClick={onTriggerQuickRelease}><Unplug size={13} />{params.quickReleaseActive ? '예인줄 재연결' : '비상 분리'}</button></div>
  </section>;
}
