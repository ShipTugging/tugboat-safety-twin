import React, { useRef, useEffect } from 'react';
import { TelemetryState } from '../types/maritime';
import { Radio } from 'lucide-react';
import { worldToRadarPoint } from '../simulation/radar';

interface TacticalRadarProps {
  telemetry: TelemetryState;
  inWashZone: boolean;
}

export const TacticalRadar: React.FC<TacticalRadarProps> = ({ telemetry, inWashZone }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ telemetry, inWashZone });
  latest.current = { telemetry, inWashZone };
  const sweepAngleRef = useRef<number>(0);

  useEffect(() => {
    let animId: number;

    const render = () => {
      const { telemetry, inWashZone } = latest.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h * .35; // offset slightly for aft view
      const scale = 1; // pixels per meter

      // Fade clear for persistence phosphor trail
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0d212b';
      ctx.fillRect(0, 0, w, h);

      // Advance radar sweep angle
      sweepAngleRef.current += 0.035;
      const sweep = sweepAngleRef.current;

      // 1. Concentric Range Rings (20m, 40m, 60m)
      [20, 40, 60].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(116, 185, 177, 0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ring label
        ctx.fillStyle = 'rgba(116, 185, 177, 0.5)';
        ctx.font = '9px monospace';
        ctx.fillText(`${r}m`, cx + r * scale - 18, cy - 3);
      });

      // Crosshair Axes
      ctx.beginPath();
      ctx.moveTo(cx, 10);
      ctx.lineTo(cx, h - 10);
      ctx.moveTo(10, cy);
      ctx.lineTo(w - 10, cy);
      ctx.strokeStyle = 'rgba(116, 185, 177, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 2. Propeller Wash Hazard Sector (Aft of ship)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy + 34 * scale); // Stern location
      ctx.lineTo(cx - 15 * scale, cy + 70 * scale);
      ctx.lineTo(cx + 15 * scale, cy + 70 * scale);
      ctx.closePath();
      ctx.fillStyle = inWashZone ? 'rgba(255, 23, 68, 0.25)' : 'rgba(245, 158, 11, 0.12)';
      ctx.fill();
      ctx.strokeStyle = inWashZone ? 'rgba(255, 23, 68, 0.6)' : 'rgba(245, 158, 11, 0.35)';
      ctx.stroke();
      ctx.restore();

      // 3. Large Ship Blip (Post-Panamax Hull)
      ctx.save();
      ctx.fillStyle = '#85b5b6';
      ctx.shadowColor = '#85b5b6';
      ctx.shadowBlur = 0;
      // Hull centered at (cx, cy)
      const shipW = 14 * scale;
      const shipL = 68 * scale;
      ctx.fillRect(cx - shipW / 2, cy - shipL / 2, shipW, shipL);
      
      // Ship centerline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - shipL / 2);
      ctx.lineTo(cx, cy + shipL / 2);
      ctx.stroke();
      ctx.restore();

      // 4. Towing Line Vector
      const [shipChockX,shipChockY]=worldToRadarPoint(telemetry.lineStartPoint,cx,cy,scale);
      const [tugX,tugY]=worldToRadarPoint(telemetry.tugPosition,cx,cy,scale);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(shipChockX, shipChockY);
      ctx.lineTo(tugX, tugY);
      ctx.strokeStyle = telemetry.girtingStatus === 'CRITICAL' ? '#ff1744' : '#bdccb4';
      ctx.lineWidth = 2;
      ctx.shadowColor = telemetry.girtingStatus === 'CRITICAL' ? '#ff1744' : '#bdccb4';
      ctx.shadowBlur = 0;
      if (!telemetry.emergencyReleaseTriggered) ctx.stroke();
      ctx.restore();

      // 5. Tugboat Blip
      ctx.save();
      ctx.translate(tugX, tugY);
      ctx.rotate(-telemetry.tugRotation[1]); // tug heading
      ctx.fillStyle = telemetry.girtingStatus === 'CRITICAL' ? '#ff1744' : '#d3a079';
      ctx.shadowColor = telemetry.girtingStatus === 'CRITICAL' ? '#ff1744' : '#d3a079';
      ctx.shadowBlur = 2;
      // Draw tugboat contour
      ctx.beginPath();
      ctx.arc(0, -5 * scale, 2.5 * scale, Math.PI, 0, false); // rounded bow
      ctx.lineTo(2.5 * scale, 5 * scale);
      ctx.lineTo(-2.5 * scale, 5 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 6. Rotating Radar Sweep Beam
      ctx.save();
      const sweepX = cx + Math.cos(sweep) * 90 * scale;
      const sweepY = cy + Math.sin(sweep) * 90 * scale;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90 * scale);
      grad.addColorStop(0, 'rgba(116, 185, 177, 0.4)');
      grad.addColorStop(1, 'rgba(116, 185, 177, 0.0)');
      
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 90 * scale, sweep - 0.4, sweep);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Leading beam line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sweepX, sweepY);
      ctx.strokeStyle = 'rgba(116, 185, 177, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3 flex flex-col gap-2 backdrop-blur-md shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-mono text-[11px]">
        <span className="flex items-center gap-1.5 font-bold text-slate-200">
          <Radio size={13} className="text-cyan-400 animate-pulse" />
          항만 전술 레이더
        </span>
        <span className="text-cyan-400 text-[10px] font-semibold">RANGE: 90m &bull; 360° SWEEP</span>
      </div>

      <div className="relative w-full h-56 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={280}
          height={220}
          className="w-full h-full object-contain"
        />

        {/* Legend overlays */}
        <div className="absolute bottom-1.5 left-2 flex items-center gap-3 text-[9px] font-mono bg-black/75 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-sky-400" /> 본선
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500" /> 예인선
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500" /> 후류위험구역
          </span>
        </div>
      </div>
    </div>
  );
};
