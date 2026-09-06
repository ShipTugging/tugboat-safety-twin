import React, { useState } from 'react';
import { SimulationParams, TelemetryState } from '../types/maritime';
import { VisionAIFeed } from './VisionAIFeed';
import { TacticalRadar } from './TacticalRadar';
import { TelemetryChart } from './TelemetryChart';
import { SensorGauges } from './SensorGauges';
import { ControlPanel } from './ControlPanel';
import {
  Anchor,
  Shield,
  Activity,
  AlertTriangle,
  Radio,
  Clock,
  Zap,
  Volume2,
  VolumeX,
  Eye,
  TrendingUp,
} from 'lucide-react';

interface DashboardProps {
  params: SimulationParams;
  telemetry: TelemetryState;
  onChangeParams: (newParams: Partial<SimulationParams>) => void;
  onReset: () => void;
  onTriggerQuickRelease: () => void;
  onOpenVerificationModal: () => void;
  onToggleSound?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  params,
  telemetry,
  onChangeParams,
  onReset,
  onTriggerQuickRelease,
  onOpenVerificationModal,
  onToggleSound,
}) => {
  const [activeTab, setActiveTab] = useState<'vision' | 'radar' | 'chart'>('vision');
  const isGirtingCritical = telemetry.girtingStatus === 'CRITICAL';
  const isSuctionCritical = telemetry.suctionStatus === 'CRITICAL';
  const inWashZone = telemetry.inWashZone;

  return (
    <div className="w-full h-full bg-marine-950 border-l border-slate-700 flex flex-col overflow-y-auto p-4 gap-3.5 select-none font-sans shadow-2xl">
      {/* Top Header Status Bar */}
      <div className="flex items-center justify-between bg-marine-900/90 border border-slate-700/80 rounded-lg p-3 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-400">
            <Anchor size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-sm font-bold text-white tracking-wider">
                항만 예인선 안전 제어 시스템 // C2 실시간 관제
              </h1>
              <span className="px-2 py-0.5 text-[9px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 rounded font-bold">
                디지털 트윈 v3.0
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono flex items-center gap-2 mt-0.5">
              <span>본선: 66,000톤급 대형 컨테이너선</span>
              <span>&bull;</span>
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <Radio size={12} className="animate-pulse" /> 센서 퓨전 실시간 연동 중
              </span>
            </p>
          </div>
        </div>

        {/* Global Safety Threat Level Indicator & Sound Toggle */}
        <div className="flex items-center gap-2 font-mono">
          {onToggleSound && (
            <button
              onClick={onToggleSound}
              className={`p-2 rounded-lg border transition-all ${
                params.soundEnabled
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={params.soundEnabled ? '음향 활성화됨 (단축키: M)' : '음향 음소거됨 (단축키: M)'}
            >
              {params.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}

          <div
            className={`px-3.5 py-1.5 rounded-lg border flex items-center gap-2 text-xs font-bold transition-all shadow-md ${
              isGirtingCritical || isSuctionCritical
                ? 'bg-red-500/20 border-red-500 text-red-300 shadow-[0_0_15px_rgba(255,23,68,0.5)] animate-pulse'
                : inWashZone
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
            }`}
          >
            {isGirtingCritical || isSuctionCritical ? (
              <AlertTriangle size={16} />
            ) : inWashZone ? (
              <Activity size={16} />
            ) : (
              <Shield size={16} />
            )}
            <span>
              {isGirtingCritical
                ? '경보: 거팅(전복) 위험'
                : isSuctionCritical
                ? '경보: 선체 흡인 충돌 임박'
                : inWashZone
                ? '경보: 후류 난류 유입'
                : '상태: 정상 호위 운항'}
            </span>
          </div>
        </div>
      </div>

      {/* Tactical Monitor Mode Switcher Tabs */}
      <div className="flex items-center justify-between bg-marine-900/60 p-1 rounded-lg border border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-1 w-full">
          <button
            onClick={() => setActiveTab('vision')}
            className={`flex-1 py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition-all font-semibold ${
              activeTab === 'vision'
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Eye size={13} />
            <span>AI 비전 광학 추적</span>
          </button>

          <button
            onClick={() => setActiveTab('radar')}
            className={`flex-1 py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition-all font-semibold ${
              activeTab === 'radar'
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Radio size={13} />
            <span>2D 전술 레이더</span>
          </button>

          <button
            onClick={() => setActiveTab('chart')}
            className={`flex-1 py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition-all font-semibold ${
              activeTab === 'chart'
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <TrendingUp size={13} />
            <span>시계열 텔레메트리</span>
          </button>
        </div>
      </div>

      {/* 1. Tactical Monitor Deck: Active Screen */}
      {activeTab === 'vision' && <VisionAIFeed telemetry={telemetry} />}
      {activeTab === 'radar' && <TacticalRadar telemetry={telemetry} inWashZone={inWashZone} />}
      {activeTab === 'chart' && <TelemetryChart telemetry={telemetry} />}

      {/* 2. Sensor Fusion Gauge Grid (Line Angle, IMU Roll Horizon, Tension) */}
      <SensorGauges telemetry={telemetry} />

      {/* 3. Interactive Parameter Controllers & Audit Benchmark */}
      <ControlPanel
        params={params}
        onChangeParams={onChangeParams}
        onReset={onReset}
        onTriggerQuickRelease={onTriggerQuickRelease}
        onOpenVerificationModal={onOpenVerificationModal}
      />

      {/* Footer System Status Bar */}
      <div className="mt-auto pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-300">
            <Zap size={12} className="text-cyan-400" /> IMU 갱신주기: 100Hz
          </span>
          <span>&bull;</span>
          <span>LiDAR 주기: 20Hz</span>
          <span>&bull;</span>
          <span>비상 퀵 릴리즈: 즉시 분동 가능</span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-300">
          <Clock size={12} />
          <span>IMO 국제해사기구 호위 안전 규격 준수</span>
        </div>
      </div>
    </div>
  );
};
