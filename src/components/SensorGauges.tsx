import React from 'react';
import { TelemetryState } from '../types/maritime';
import { Gauge, Compass, Activity, Waves } from 'lucide-react';

interface SensorGaugesProps {
  telemetry: TelemetryState;
}

export const SensorGauges: React.FC<SensorGaugesProps> = ({ telemetry }) => {
  const isGirtingCritical = telemetry.girtingStatus === 'CRITICAL';
  const isGirtingWarning = telemetry.girtingStatus === 'WARNING';
  const isSuctionCritical = telemetry.suctionStatus === 'CRITICAL';

  // Towing Line Angle visualization
  const angleNormalized = Math.min(100, (telemetry.lineAngleDeg / 90) * 100);

  // Artificial Horizon Roll rotation
  const rollClamped = Math.max(-35, Math.min(35, telemetry.imuRollDeg));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* 1. Towing Line Angle Gauge */}
      <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3 flex flex-col justify-between backdrop-blur-md relative overflow-hidden shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-200">
            <Compass size={14} className="text-cyan-400" />
            예인줄 상대 각도 (Line Angle)
          </span>
          <span
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
              isGirtingCritical
                ? 'bg-red-500/25 text-red-300 border border-red-500/60 animate-pulse'
                : isGirtingWarning
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60'
                : 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/60'
            }`}
          >
            {isGirtingCritical ? '전복 위험' : isGirtingWarning ? '주의' : '안전'}
          </span>
        </div>

        {/* Circular Dial / Gauge UI */}
        <div className="flex items-center justify-center my-2 relative">
          <div className="relative w-28 h-28 rounded-full border border-slate-700 flex items-center justify-center bg-slate-950 shadow-inner">
            {/* Sector rings */}
            <div className="absolute inset-1 rounded-full border border-dashed border-slate-800" />

            {/* Needle indicator */}
            <div
              className="absolute w-1.5 h-12 origin-bottom transition-transform duration-100 rounded-full"
              style={{
                transform: `rotate(${telemetry.lineAngleDeg - 45}deg)`,
                bottom: '50%',
                backgroundColor: isGirtingCritical ? '#ff1744' : isGirtingWarning ? '#ffb020' : '#00f0ff',
                boxShadow: isGirtingCritical ? '0 0 10px #ff1744' : '0 0 6px #00f0ff',
              }}
            />

            {/* Center Pivot */}
            <div className="w-3.5 h-3.5 rounded-full bg-slate-200 border-2 border-slate-900 z-10 shadow" />

            {/* Angle Numeric Display inside dial */}
            <div className="absolute bottom-2 text-center font-mono">
              <span className="text-xs font-bold text-white tracking-wider">
                {telemetry.lineAngleDeg.toFixed(1)}°
              </span>
            </div>
          </div>
        </div>

        {/* Safety Margin Indicator */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between font-mono text-[10px] text-slate-300">
            <span>거팅(전복) 위험율</span>
            <span className={isGirtingCritical ? 'text-red-400 font-bold animate-pulse' : 'text-slate-200'}>
              {telemetry.girtingRiskPct}%
            </span>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-150 ${
                isGirtingCritical ? 'bg-red-500' : isGirtingWarning ? 'bg-amber-400' : 'bg-cyan-400'
              }`}
              style={{ width: `${angleNormalized}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. IMU Roll Angle & Artificial Horizon */}
      <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3 flex flex-col justify-between backdrop-blur-md relative overflow-hidden shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-200">
            <Gauge size={14} className="text-cyan-400" />
            IMU 롤 & 인공수평선 (Gyro)
          </span>
          <span className="font-mono text-[10px] text-slate-300">
            속도: {telemetry.imuRollRateDegS > 0 ? `+${telemetry.imuRollRateDegS}` : telemetry.imuRollRateDegS}°/s
          </span>
        </div>

        {/* Artificial Horizon Display */}
        <div className="flex items-center justify-center my-2 relative">
          <div className="relative w-28 h-28 rounded-full border-2 border-slate-600 bg-slate-950 overflow-hidden shadow-inner flex items-center justify-center">
            {/* Rotating Horizon Line (Sky / Sea partition) */}
            <div
              className="absolute w-44 h-44 origin-center transition-transform duration-75 flex flex-col"
              style={{
                transform: `rotate(${rollClamped}deg)`,
              }}
            >
              {/* Sky Half */}
              <div className="w-full h-1/2 bg-sky-900/80 border-b-2 border-cyan-300 relative">
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-[1px] bg-cyan-200/60" />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-4 h-[1px] bg-cyan-200/40" />
              </div>
              {/* Sea Half */}
              <div className="w-full h-1/2 bg-emerald-950/90">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-[1px] bg-emerald-400/50" />
              </div>
            </div>

            {/* Static Aircraft / Vessel Crosshair Datum */}
            <div className="absolute z-10 flex items-center gap-1 pointer-events-none">
              <div className="w-4 h-[2px] bg-amber-400 shadow" />
              <div className="w-2 h-2 rounded-full border-2 border-amber-400 bg-transparent" />
              <div className="w-4 h-[2px] bg-amber-400 shadow" />
            </div>

            {/* Critical 25° Limit Marks */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-1.5 text-[9px] font-mono text-red-400 font-bold">
              <span>-25°</span>
              <span>+25°</span>
            </div>

            {/* Roll angle digital readout */}
            <div className="absolute top-1 text-center font-mono text-[11px] font-bold text-white z-10 bg-black/70 px-1.5 py-0.2 rounded shadow">
              {telemetry.imuRollDeg > 0 ? `+${telemetry.imuRollDeg.toFixed(1)}°` : `${telemetry.imuRollDeg.toFixed(1)}°`}
            </div>
          </div>
        </div>

        {/* Heeling Capsize Danger Bar */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between font-mono text-[10px] text-slate-300">
            <span>전복 한계 도달률 (&plusmn;25°)</span>
            <span className={Math.abs(telemetry.imuRollDeg) >= 20 ? 'text-red-400 font-bold' : 'text-slate-200'}>
              {Math.min(100, Math.round((Math.abs(telemetry.imuRollDeg) / 25) * 100))}%
            </span>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-150 ${
                Math.abs(telemetry.imuRollDeg) >= 20
                  ? 'bg-red-500'
                  : Math.abs(telemetry.imuRollDeg) >= 10
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(100, (Math.abs(telemetry.imuRollDeg) / 25) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Torsional Load / Tension & Hydrodynamics */}
      <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3 flex flex-col justify-between backdrop-blur-md relative overflow-hidden shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-200">
            <Activity size={14} className="text-cyan-400" />
            예인줄 인장 하중 (Tension)
          </span>
          <span className="font-mono text-[10px] text-slate-300">
            파단 한계: 320 kN
          </span>
        </div>

        {/* Digital Load Metric */}
        <div className="my-2 flex flex-col items-center justify-center">
          <div className="flex items-baseline gap-1">
            <span
              className={`font-mono text-2xl font-black ${
                telemetry.lineTensionKn > 220
                  ? 'text-red-400 text-glow-red'
                  : telemetry.lineTensionKn > 150
                  ? 'text-amber-300 text-glow-amber'
                  : 'text-cyan-300 text-glow-cyan'
              }`}
            >
              {telemetry.lineTensionKn}
            </span>
            <span className="font-mono text-xs text-slate-300">kN</span>
          </div>
          <span className="text-[10px] font-mono text-slate-300">
            {telemetry.emergencyReleaseTriggered ? '상태: 비상 분리 완료(장력 해제)' : '실시간 예인 장력 가동 중'}
          </span>
        </div>

        {/* Load Strain Progress Bar */}
        <div className="flex flex-col gap-2">
          <div>
            <div className="flex justify-between font-mono text-[10px] text-slate-300 mb-1">
              <span>장력 부하율</span>
              <span>{Math.min(100, Math.round((telemetry.lineTensionKn / 320) * 100))}%</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-150 ${
                  telemetry.lineTensionKn > 220
                    ? 'bg-red-500'
                    : telemetry.lineTensionKn > 150
                    ? 'bg-amber-400'
                    : 'bg-cyan-400'
                }`}
                style={{ width: `${Math.min(100, (telemetry.lineTensionKn / 320) * 100)}%` }}
              />
            </div>
          </div>

          {/* Hydrodynamic Bernoulli Suction readout */}
          <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-300 flex items-center gap-1">
              <Waves size={12} className="text-cyan-400" /> 베르누이 흡인력:
            </span>
            <span className={isSuctionCritical ? 'text-red-400 font-bold animate-pulse' : 'text-slate-100 font-semibold'}>
              {telemetry.suctionForceKn} kN ({telemetry.suctionRiskPct}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
