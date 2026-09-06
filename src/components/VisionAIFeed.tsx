import React from 'react';
import { TelemetryState } from '../types/maritime';
import { Eye, Crosshair, Cpu, Radio, ShieldCheck } from 'lucide-react';

interface VisionAIFeedProps {
  telemetry: TelemetryState;
}

export const VisionAIFeed: React.FC<VisionAIFeedProps> = ({ telemetry }) => {
  const isTargetClose = telemetry.hullDistanceM < 8;
  const isCritical = telemetry.suctionStatus === 'CRITICAL';

  return (
    <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3.5 flex flex-col gap-2.5 relative overflow-hidden backdrop-blur-md shadow-lg">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-400">
            <Eye size={15} />
          </div>
          <span className="font-mono text-xs font-bold text-slate-100 tracking-wider">
            VISION AI 광학 & LiDAR 모니터링 피드
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <ShieldCheck size={13} />
            YOLOv9-해양특화모델
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-cyan-300 font-bold">인식 신뢰도: {telemetry.aiDetectionConfidence.toFixed(1)}%</span>
        </div>
      </div>

      {/* Simulated Synthetic Camera Canvas */}
      <div className="relative w-full h-44 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden shadow-inner">
        {/* CRT Scanline Overlay */}
        <div className="absolute inset-0 scanlines opacity-60 z-10 pointer-events-none" />

        {/* Tactical Crosshair Grid */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
          <div className="w-full h-[1px] bg-cyan-400" />
          <div className="h-full w-[1px] bg-cyan-400 absolute" />
        </div>

        {/* Optical Sensor Background Silhouette */}
        <div className="absolute inset-4 border border-dashed border-slate-700/70 rounded flex items-center justify-center">
          {/* Simulated 3D Vessel Silhouette */}
          <div className="relative w-3/4 h-24 bg-gradient-to-r from-slate-800/60 via-slate-700/40 to-slate-900/60 rounded border border-slate-700 flex items-center justify-center">
            {/* AI Bounding Box Tracking Large Hull */}
            <div
              className={`absolute inset-1 rounded transition-colors duration-200 border-2 ${
                isCritical
                  ? 'border-red-500 shadow-[0_0_20px_rgba(255,23,68,0.8)]'
                  : isTargetClose
                  ? 'border-amber-400 shadow-[0_0_12px_rgba(255,176,32,0.6)]'
                  : 'border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.5)]'
              }`}
            >
              {/* Corner Targeting Brackets */}
              <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-white" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-white" />
              <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-white" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-white" />

              {/* Tag Label */}
              <div
                className={`absolute -top-5 left-1 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  isCritical
                    ? 'bg-red-600 text-white'
                    : isTargetClose
                    ? 'bg-amber-400 text-black'
                    : 'bg-cyan-400 text-black'
                }`}
              >
                선체 타겟 고정 [우현 선미 구역 / 66,000 DWT]
              </div>

              {/* Center Lock Reticle */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Crosshair
                  size={26}
                  className={`animate-pulse ${
                    isCritical ? 'text-red-500' : isTargetClose ? 'text-amber-400' : 'text-cyan-400'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Vision AI Telemetry Overlay (Requested Format: [Hull Distance: XX.X m] [Closing Rate: X.X m/s]) */}
        <div className="absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between bg-black/85 backdrop-blur-md px-3 py-1.5 rounded border border-slate-700 font-mono text-xs">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-cyan-400 animate-pulse" />
            <span
              className={`font-bold ${
                isCritical
                  ? 'text-red-400 text-glow-red animate-pulse'
                  : isTargetClose
                  ? 'text-amber-300 text-glow-amber'
                  : 'text-cyan-300 text-glow-cyan'
              }`}
            >
              [선체 거리: {telemetry.hullDistanceM.toFixed(1)} m]
            </span>
            <span className="text-slate-300">
              [접근 속도: {telemetry.closingRateMs >= 0 ? `+${telemetry.closingRateMs.toFixed(1)}` : telemetry.closingRateMs.toFixed(1)} m/s]
            </span>
          </div>

          <div className="text-[11px] text-slate-400 hidden sm:block">
            <span>방위각: {telemetry.lineAngleDeg}°</span>
          </div>
        </div>

        {/* Top-right Status Pill */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-black/80 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-700 text-slate-300">
          <Cpu size={12} className="text-cyan-400" />
          <span>FPS: 60 &bull; 처리지연: 8ms</span>
        </div>
      </div>
    </div>
  );
};
