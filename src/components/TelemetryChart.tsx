import React, { useRef, useEffect } from 'react';
import { TelemetryState } from '../types/maritime';
import { Activity, TrendingUp } from 'lucide-react';

interface TelemetryPoint {
  time: number;
  lineAngle: number;
  imuRoll: number;
  tensionKn: number;
  girtingRisk: number;
}

interface TelemetryChartProps {
  telemetry: TelemetryState;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ telemetry }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<TelemetryPoint[]>([]);
  const lastSampleTime = useRef<number>(0);

  // Sample telemetry history
  useEffect(() => {
    const now = performance.now();
    if (now - lastSampleTime.current > 150) { // sample every 150ms (~6.6Hz)
      lastSampleTime.current = now;
      historyRef.current.push({
        time: now,
        lineAngle: telemetry.lineAngleDeg,
        imuRoll: telemetry.imuRollDeg,
        tensionKn: telemetry.lineTensionKn,
        girtingRisk: telemetry.girtingRiskPct,
      });

      // Keep maximum 80 points (~12-15 seconds rolling window)
      if (historyRef.current.length > 80) {
        historyRef.current.shift();
      }
    }
  }, [telemetry]);

  // Render waveform loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const pts = historyRef.current;

      // Dark background with faint sweep
      ctx.fillStyle = '#060d17';
      ctx.fillRect(0, 0, w, h);

      // Draw Grid Ticks
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;

      // Horizontal lines
      const gridRows = 4;
      for (let r = 1; r < gridRows; r++) {
        const y = (h / gridRows) * r;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Vertical lines
      const gridCols = 6;
      for (let c = 1; c < gridCols; c++) {
        const x = (w / gridCols) * c;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Zero-center line
      const centerY = h / 2;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Warning Limit Lines (+/- 45deg equivalent on upper/lower bounds)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.18);
      ctx.lineTo(w, h * 0.18);
      ctx.moveTo(0, h * 0.82);
      ctx.lineTo(w, h * 0.82);
      ctx.stroke();
      ctx.setLineDash([]);

      if (pts.length < 2) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dx = w / 80;

      // Helper function to plot a curve
      const drawChannel = (
        getValue: (p: TelemetryPoint) => number,
        min: number,
        max: number,
        color: string,
        glowColor: string,
        lineWidth: number = 2
      ) => {
        ctx.save();
        ctx.beginPath();
        pts.forEach((p, idx) => {
          const val = getValue(p);
          const norm = (val - min) / (max - min); // 0 to 1
          const y = h - Math.max(0, Math.min(1, norm)) * h;
          const x = idx * dx;

          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 6;
        ctx.stroke();

        // Pulsing head point
        const lastP = pts[pts.length - 1];
        const lastNorm = (getValue(lastP) - min) / (max - min);
        const headY = h - Math.max(0, Math.min(1, lastNorm)) * h;
        const headX = (pts.length - 1) * dx;

        ctx.beginPath();
        ctx.arc(headX, headY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
      };

      // Channel 1: Cable Tension kN (0 to 600 kN)
      drawChannel((p) => p.tensionKn, 0, 600, '#00e676', '#00e676', 1.8);

      // Channel 2: Line Angle (-90 to +90 deg)
      drawChannel((p) => p.lineAngle, -90, 90, '#f59e0b', '#f59e0b', 2.0);

      // Channel 3: IMU Roll (-25 to +25 deg)
      drawChannel((p) => p.imuRoll, -25, 25, '#ec4899', '#ec4899', 2.0);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3 flex flex-col gap-2 backdrop-blur-md shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-mono text-[11px]">
        <span className="flex items-center gap-1.5 font-bold text-slate-200">
          <Activity size={13} className="text-emerald-400 animate-pulse" />
          실시간 시계열 텔레메트리 파형 (Oscilloscope Strip Chart)
        </span>
        <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
          <TrendingUp size={11} /> 6.6Hz SAMPLING &bull; 15s BUFFER
        </span>
      </div>

      <div className="relative w-full h-48 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={280}
          height={190}
          className="w-full h-full object-contain"
        />

        {/* Live Channel Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 text-[9px] font-mono bg-black/80 px-2 py-1 rounded border border-slate-800 shadow">
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2 h-0.5 bg-amber-400 rounded-full" />
            <span>예인각:</span>
            <span className="font-bold">{telemetry.lineAngleDeg > 0 ? `+${telemetry.lineAngleDeg}°` : `${telemetry.lineAngleDeg}°`}</span>
          </div>
          <div className="flex items-center gap-1.5 text-pink-400">
            <span className="w-2 h-0.5 bg-pink-400 rounded-full" />
            <span>IMU 롤:</span>
            <span className="font-bold">{telemetry.imuRollDeg > 0 ? `+${telemetry.imuRollDeg}°` : `${telemetry.imuRollDeg}°`}</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-0.5 bg-emerald-400 rounded-full" />
            <span>장력:</span>
            <span className="font-bold">{telemetry.lineTensionKn} kN</span>
          </div>
        </div>

        {/* Limit Marker Legend */}
        <div className="absolute top-2 right-2 text-[8px] font-mono text-red-400 bg-red-950/70 border border-red-800/80 px-1.5 py-0.5 rounded">
          임계 위험선 (&ge;85%)
        </div>
      </div>
    </div>
  );
};
