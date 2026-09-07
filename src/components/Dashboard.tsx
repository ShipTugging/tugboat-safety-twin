import React, { useState } from 'react';
import { SimulationParams, TelemetryState } from '../types/maritime';
import { TacticalRadar } from './TacticalRadar';
import { TelemetryChart } from './TelemetryChart';
import { SensorGauges } from './SensorGauges';
import { VisionAIFeed } from './VisionAIFeed';
import { DatasetControls } from './DatasetControls';
import type { DatasetController } from '../hooks/useDatasetExporter';
import { ControlPanel } from './ControlPanel';
import { ArrowUpRight, Crosshair, Activity, Radio, ChevronRight } from 'lucide-react';

interface DashboardProps {
  params: SimulationParams; telemetry: TelemetryState;
  onChangeParams: (params: Partial<SimulationParams>) => void;
  onReset: () => void; onTriggerQuickRelease: () => void;
  onOpenVerificationModal: () => void; onToggleSound?: () => void;
  dataset:DatasetController;
  onRandomize:()=>void;
}
export function Dashboard(props: DashboardProps) {
  const { telemetry: t, params } = props;
  const [tab, setTab] = useState<'overview' | 'radar' | 'chart' | 'sensors'>('overview');
  const critical = t.girtingStatus === 'CRITICAL' || t.suctionStatus === 'CRITICAL';
  const risks = [
    { name: '거팅 · 전복', value: t.girtingRiskPct, note: `횡경사 ${t.imuRollDeg.toFixed(1)}°`, danger: t.girtingStatus === 'CRITICAL' },
    { name: '선체 흡인', value: t.suctionRiskPct, note: `흡인력 ${t.suctionForceKn} kN`, danger: t.suctionStatus === 'CRITICAL' },
    { name: '프로펠러 후류', value: t.washTurbulencePct, note: t.inWashZone ? '후류 구역 진입' : '후류 구역 외부', danger: t.washStatus === 'SEVERE_INGRESS' },
  ];
  return (
    <aside className="operations-panel" aria-label="관제 정보">
      <div className="panel-heading"><div><span className="eyebrow">OPERATIONS / 01</span><h2>운항 모니터</h2></div><span className="live-dot"><i />시뮬레이션</span></div>
      <nav className="panel-tabs" aria-label="관제 정보 탭">
        {([{ id: 'overview', label: '운항 개요', icon: Crosshair }, { id: 'radar', label: '레이더', icon: Radio }, { id: 'chart', label: '추이', icon: Activity }, { id: 'sensors', label: '센서', icon: Crosshair }] as const).map(item => <button key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}><item.icon size={14} />{item.label}</button>)}
      </nav>
      <div className="panel-scroll">
        <DatasetControls dataset={props.dataset} onRandomize={props.onRandomize}/>
        {tab === 'overview' && <>
          <section className="vessel-card">
            <div className="section-label"><span>현재 호위 선박</span><ArrowUpRight size={15} /></div>
            <h3>OCEAN MERIDIAN</h3><p>컨테이너선 <span>·</span> ASD 예인선 호위</p>
            <div className="vessel-profile" aria-hidden="true"><svg viewBox="0 0 320 65"><path d="M15 43h275l-17 17H39L15 43Z" fill="#425f6c"/><path d="M15 43h275" stroke="#f2ad75" strokeWidth="2"/><path d="M36 42V17h25v25M40 17V11h16v6M45 11V3" stroke="#a0b8c2" fill="#7c959f"/>{[0,1,2,3,4,5,6,7].map(x=><g key={x}><rect x={72+x*24} y="30" width="22" height="11" rx="1" fill={x%3===0?'#bd7955':'#547887'}/><rect x={72+x*24} y="17" width="22" height="11" rx="1" fill={x%2===0?'#668f98':'#d0b793'}/></g>)}</svg></div>
            <div className="vessel-meta"><span>본선 속력<strong>{params.shipSpeed.toFixed(1)} <small>kn</small></strong></span><span>예인줄 길이<strong>{params.towLineLength} <small>m</small></strong></span><span>추진기<strong>{params.propellerRpm} <small>RPM</small></strong></span></div>
          </section>
          <section className="distance-card"><div className="section-label"><span>선체 이격 거리</span><Crosshair size={15}/></div><div className={t.suctionStatus === 'CRITICAL' ? 'distance-value danger-text' : 'distance-value'}>{t.hullDistanceM.toFixed(1)}<span>m</span></div><div className="distance-foot"><span className={t.suctionStatus === 'SAFE' ? 'safe-text' : 'danger-text'}>{t.suctionStatus === 'SAFE' ? '안전 이격 유지' : '이격 거리 주의'}</span><span>접근 속도 {t.closingRateMs.toFixed(1)} m/s</span></div></section>
          <section className="risk-section"><div className="section-label"><span>위험 분석</span><span className={critical ? 'danger-text' : 'safe-text'}>{critical ? '즉시 확인' : '모니터링'}</span></div>{risks.map(risk => <div className="risk-row" key={risk.name}><div><span>{risk.name}</span><b className={risk.danger ? 'danger-text' : ''}>{risk.value}<small>%</small></b></div><div className="risk-track"><i style={{ width: `${Math.min(100, Math.max(0, risk.value))}%`, background: risk.danger ? '#f57b73' : risk.value > 35 ? '#e8bc79' : '#70c9bb' }} /></div><small>{risk.note}</small></div>)}</section>
          <div className="instrument-pair"><div><span>예인줄 각도</span><strong>{t.lineAngleDeg.toFixed(1)}<small>°</small></strong></div><div><span>인장 하중</span><strong>{t.lineTensionKn}<small>kN</small></strong></div></div>
        </>}
        {tab === 'radar' && <div className="legacy-monitor"><TacticalRadar telemetry={t} inWashZone={t.inWashZone}/><p className="monitor-note">시뮬레이션 좌표 기반 전술 레이더</p></div>}
        {tab === 'chart' && <div className="legacy-monitor"><TelemetryChart telemetry={t}/><p className="monitor-note">이 탭을 연 이후의 시뮬레이션 추이</p></div>}
        {tab === 'sensors' && <div className="sensor-details"><SensorGauges telemetry={t}/><VisionAIFeed telemetry={t}/></div>}
        <details className="control-details"><summary>운항 파라미터 <ChevronRight size={15}/></summary><fieldset disabled={props.dataset.busy}><ControlPanel {...props}/></fieldset></details>
      </div>
    </aside>
  );
}
