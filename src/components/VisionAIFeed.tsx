import React from 'react';
import { TelemetryState } from '../types/maritime';
import { Eye, Cpu, Radio, ShieldCheck, Spline } from 'lucide-react';
import { SAG_LEVEL_NAMES, SAG_LEVEL_THRESHOLDS, type SagMetrics } from '../simulation/towline';

interface VisionAIFeedProps {
  telemetry: TelemetryState;
  sag: SagMetrics;
  detached?: boolean;
}

/**
 * Towline sag pipeline preview. The values are simulator ground truth for the
 * rendered rope; a trained YOLO-Seg model would replace them with mask-derived
 * estimates (scripts/sag_from_mask.py implements that post-processing).
 */
export const VisionAIFeed: React.FC<VisionAIFeedProps> = ({ telemetry, sag, detached = false }) => {
  const tightening = telemetry.lineTensionKn >= 320 || telemetry.girtingStatus === 'CRITICAL';
  const tone = detached ? 'text-slate-400' : sag.level <= 1 && tightening ? 'text-red-400' : sag.level >= 4 ? 'text-amber-300' : 'text-cyan-300';
  const bounds = [0, ...SAG_LEVEL_THRESHOLDS];
  return (
    <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3.5 flex flex-col gap-2.5 relative overflow-hidden backdrop-blur-md shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-400">
            <Eye size={15} />
          </div>
          <span className="font-mono text-xs font-bold text-slate-100 tracking-wider">예인줄 Sag 파이프라인</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold"><ShieldCheck size={13} />정답 기준</span>
        </div>
      </div>

      <div className="sag-pipeline">
        <div className="sag-scale" role="list" aria-label="Sag 단계">
          {SAG_LEVEL_NAMES.map((name, level) => (
            <span key={name} role="listitem" className={!detached && sag.level === level ? 'active' : ''}>L{level}<br />{name}<br />{level < 4 ? `<${bounds[level + 1]}` : `≥${bounds[4]}`}</span>
          ))}
        </div>
        <div className="relative w-full h-20 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
          <div className="absolute inset-0 scanlines opacity-60 z-10 pointer-events-none" />
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <line x1="8" y1="12" x2="92" y2="12" stroke="#334155" strokeDasharray="2 2" />
            {!detached && <path d={`M8 12 Q50 ${12 + Math.min(26, sag.sagRatio * 260)} 92 12`} fill="none" stroke={sag.level >= 4 ? '#fbbf24' : sag.level <= 1 ? '#f87171' : '#22d3ee'} strokeWidth={1.6} />}
            <circle cx="8" cy="12" r="1.6" fill="#94a3b8" /><circle cx="92" cy="12" r="1.6" fill="#94a3b8" />
          </svg>
          <div className="absolute bottom-1.5 left-2 right-2 z-20 flex items-center justify-between font-mono text-[10px] text-slate-300">
            <span className="flex items-center gap-1.5"><Spline size={12} className="text-cyan-400" />SagRatio = 최대 처짐 / 양끝 거리</span>
            <span className={`font-bold ${tone}`}>{detached ? '예인줄 분리' : sag.sagRatio.toFixed(4)}</span>
          </div>
        </div>
        <dl>
          <div><dt>Sag 단계</dt><dd>{detached ? '-' : `L${sag.level} · ${SAG_LEVEL_NAMES[sag.level]}`}</dd></div>
          <div><dt>최대 처짐 / 현 길이</dt><dd>{detached ? '-' : `${sag.sagM.toFixed(2)} m / ${sag.spanM.toFixed(1)} m`}</dd></div>
          <div><dt>인장 하중</dt><dd className={tightening ? 'danger-text' : ''}>{telemetry.lineTensionKn} kN{tightening ? ' · 팽팽해짐' : ''}</dd></div>
          <div><dt>유효 여유 길이</dt><dd>{detached ? '-' : `${sag.excessM.toFixed(2)} m`}</dd></div>
        </dl>
      </div>

      <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5"><Radio size={12} className="text-cyan-400 animate-pulse" />거팅 경보 입력: Sag 감소 속도 + IMU 횡경사 {telemetry.imuRollDeg.toFixed(1)}°</span>
        <span className="flex items-center gap-1.5"><Cpu size={12} className="text-cyan-400" />모델 추론 미연결</span>
      </div>
    </div>
  );
};
