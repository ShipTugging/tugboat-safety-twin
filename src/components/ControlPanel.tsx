import React from 'react';
import { SimulationParams, ScenarioPreset, TowPosition } from '../types/maritime';
import { TOW_POSITION_LABELS } from '../simulation/towPosition';
import { maritimeAudio } from '../utils/audioSynthesizer';
import { BOW_BASELINE } from './scenarioControlModel';
import {
  Sliders,
  Volume2,
  VolumeX,
  RotateCcw,
  Zap,
  Flame,
  Wind,
  Compass,
  AlertOctagon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface ControlPanelProps {
  params: SimulationParams;
  onChangeParams: (newParams: Partial<SimulationParams>) => void;
  onReset: () => void;
  onTriggerQuickRelease: () => void;
  onOpenVerificationModal: () => void;
}

export const KOREAN_PRESETS: ScenarioPreset[] = [
  {
    id: 'NORMAL_ESCORT',
    name: '정상 호위 모드',
    badge: '정상 안전',
    description: '대형선 선수에서 18° 안정 결속 상태로 표준 예인 호위를 수행 중인 상태입니다.',
    params: {
      tugSteeringAngle: 18,
      towLineLength: 32,
      shipSpeed: 6,
      propellerRpm: 45,
      towPosition: BOW_BASELINE.towPosition,
    },
  },
  {
    id: 'GIRTING_CRISIS',
    name: '거팅(전복) 위기',
    badge: '전복 위험',
    description: '68° 조향으로 횡인장과 선체 기울기 변화를 관찰합니다.',
    params: {
      tugSteeringAngle: 68,
      towLineLength: 26,
      shipSpeed: 8.5,
      propellerRpm: 60,
      towPosition: 'astern',
    },
  },
  {
    id: 'PROP_WASH_TRAP',
    name: '프로펠러 후류 유입',
    badge: '난류 위험',
    description: '선미 115 RPM 스크루 후류에 진입하여 타효가 상실되고 심한 선체 진동이 발생합니다.',
    params: {
      tugSteeringAngle: 4,
      towLineLength: 28,
      shipSpeed: 9,
      propellerRpm: 115,
      towPosition: 'astern',
    },
  },
  {
    id: 'SUCTION_NEAR_MISS',
    name: '선체 유체 흡인력',
    badge: '근접 관찰',
    description: '예인줄을 14m로 줄여 이격 거리와 흡인력 변화를 관찰합니다.',
    params: {
      tugSteeringAngle: -22,
      towLineLength: 14,
      shipSpeed: 10,
      propellerRpm: 50,
      towPosition: 'astern',
    },
  },
];

export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  onChangeParams,
  onReset,
  onTriggerQuickRelease,
  onOpenVerificationModal,
}) => {
  return (
    <div className="bg-marine-900/90 border border-slate-700/80 rounded-lg p-3.5 flex flex-col gap-3.5 backdrop-blur-md shadow-lg">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/15 border border-amber-400/40 text-amber-400">
            <Sliders size={15} />
          </div>
          <span className="font-mono text-xs font-bold text-slate-100 tracking-wider">
            세부 조작
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            onClick={() => onChangeParams({ soundEnabled: !params.soundEnabled })}
            className={`p-1.5 rounded transition-colors text-xs font-mono flex items-center gap-1 border ${
              params.soundEnabled
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 font-semibold'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="경보 음향 켜기/끄기"
          >
            {params.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span className="hidden sm:inline">{params.soundEnabled ? '음향 켜짐' : '음소거'}</span>
          </button>

          {/* Reset button */}
          <button
            onClick={onReset}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 text-xs font-mono flex items-center gap-1 transition-colors"
            title="기본값 복원"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">초기화</span>
          </button>
        </div>
      </div>

      {/* Preset Scenario Quick Selectors */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] text-slate-300 font-semibold uppercase tracking-wider">
          운항 시나리오
        </span>
        <div className="grid grid-cols-2 grid-cols-1 gap-2">
          {KOREAN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                onChangeParams({
                  ...preset.params,
                  quickReleaseActive: false,
                });
              }}
              className="p-2.5 rounded-lg bg-marine-850 hover:bg-slate-800 border border-slate-750 hover:border-cyan-400/60 text-left transition-all group relative overflow-hidden shadow"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold text-slate-100 group-hover:text-cyan-300">
                  {preset.name}
                </span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                    preset.badge === '전복 위험'
                      ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                      : preset.badge === '난류 위험'
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                      : preset.badge === '충돌 위험'
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                      : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                  }`}
                >
                  {preset.badge}
                </span>
              </div>
              <p className="text-[10px] text-slate-300 line-clamp-2 leading-tight">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="flex items-center gap-1.5 text-slate-200 font-medium">
            <Compass size={14} className="text-cyan-400" /> 예인 위치
          </span>
          <span className="text-cyan-300">{TOW_POSITION_LABELS[params.towPosition??'astern']}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="예인선 위치">
          {(['astern','port','starboard','ahead'] as TowPosition[]).map(position=><button
            key={position}
            type="button"
            aria-pressed={(params.towPosition??'astern')===position}
            onClick={()=>onChangeParams({towPosition:position,quickReleaseActive:false})}
            className={`py-2 rounded border text-[10px] font-mono ${(params.towPosition??'astern')===position?'bg-cyan-500/20 text-cyan-200 border-cyan-400/60':'bg-slate-800/70 text-slate-400 border-slate-700 hover:text-slate-200'}`}
          >{TOW_POSITION_LABELS[position]}</button>)}
        </div>
      </div>

      {/* Interactive Sliders Grid with Quick-Action Buttons */}
      <div className="grid grid-cols-1 grid-cols-1 gap-3.5 pt-1">
        {/* Slider 1: Tugboat Steering Angle (-90° to +90°) */}
        <div className="flex flex-col gap-1.5 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-200 font-medium">
              <Compass size={14} className="text-cyan-400" />
              예인선 조향각
            </span>
            <span className="font-bold text-cyan-300 bg-cyan-500/15 px-2 py-0.5 rounded border border-cyan-400/30">
              {params.tugSteeringAngle > 0 ? `+${params.tugSteeringAngle}° (우현)` : `${params.tugSteeringAngle}° (좌현)`}
            </span>
          </div>
          <input
            type="range"
            aria-label="예인선 조향각"
            min="-90"
            max="90"
            step="1"
            value={params.tugSteeringAngle}
            onChange={(e) => onChangeParams({ tugSteeringAngle: Number(e.target.value) })}
            className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
          {/* Quick Click Shortcut Buttons for Ease of Use */}
          <div className="flex items-center justify-between gap-1 pt-1">
            <button
              onClick={() => onChangeParams({ tugSteeringAngle: Math.max(-90, params.tugSteeringAngle - 10) })}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded flex items-center"
              title="좌현 10도씩 회전"
            >
              <ChevronLeft size={11} /> -10°
            </button>
            <button
              onClick={() => onChangeParams({ tugSteeringAngle: 0 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              0° 정렬
            </button>
            <button
              onClick={() => onChangeParams({ tugSteeringAngle: 18 })}
              className="px-2 py-0.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono rounded"
            >
              18° 정상
            </button>
            <button
              onClick={() => onChangeParams({ tugSteeringAngle: 68 })}
              className="px-2 py-0.5 bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-300 text-[10px] font-mono rounded font-bold"
            >
              68° 거팅
            </button>
            <button
              onClick={() => onChangeParams({ tugSteeringAngle: Math.min(90, params.tugSteeringAngle + 10) })}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded flex items-center"
              title="우현 10도씩 회전"
            >
              +10° <ChevronRight size={11} />
            </button>
          </div>
        </div>

        {/* Slider 2: Towing Line Length (10m to 60m) */}
        <div className="flex flex-col gap-1.5 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-200 font-medium">
              <Zap size={14} className="text-amber-400" />
              예인줄 길이
            </span>
            <span className="font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-400/30">
              {params.towLineLength} m
            </span>
          </div>
          <input
            type="range"
            aria-label="예인줄 길이"
            min="10"
            max="60"
            step="1"
            value={params.towLineLength}
            onChange={(e) => onChangeParams({ towLineLength: Number(e.target.value) })}
            className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
          {/* Quick Presets */}
          <div className="flex items-center justify-between gap-1 pt-1">
            <button
              onClick={() => onChangeParams({ towLineLength: 14 })}
              className="px-2 py-0.5 bg-red-950/50 hover:bg-red-900/60 border border-red-500/30 text-red-300 text-[10px] font-mono rounded"
            >
              14m (근접)
            </button>
            <button
              onClick={() => onChangeParams({ towLineLength: 32 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              32m (표준)
            </button>
            <button
              onClick={() => onChangeParams({ towLineLength: 55 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              55m (장거리)
            </button>
          </div>
        </div>

        {/* Slider 3: Large Ship Speed (0 to 14 knots) */}
        <div className="flex flex-col gap-1.5 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-200 font-medium">
              <Flame size={14} className="text-rose-400" />
              본선 속력
            </span>
            <span className="font-bold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded border border-rose-400/30">
              {params.shipSpeed} 노트 (kts)
            </span>
          </div>
          <input
            type="range"
            min="0"
            aria-label="본선 속력"
            max="14"
            step="0.5"
            value={params.shipSpeed}
            onChange={(e) => onChangeParams({ shipSpeed: Number(e.target.value) })}
            className="w-full accent-rose-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
          {/* Quick Presets */}
          <div className="flex items-center justify-between gap-1 pt-1">
            <button
              onClick={() => onChangeParams({ shipSpeed: 0 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              0 kts 정지
            </button>
            <button
              onClick={() => onChangeParams({ shipSpeed: 6 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              6 kts 항만
            </button>
            <button
              onClick={() => onChangeParams({ shipSpeed: 10 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              10 kts 고속
            </button>
          </div>
        </div>

        {/* Slider 4: Propeller RPM (0 to 120 RPM) */}
        <div className="flex flex-col gap-1.5 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-200 font-medium">
              <Wind size={14} className="text-teal-400" />
              추진기 회전수
            </span>
            <span className="font-bold text-teal-300 bg-teal-500/15 px-2 py-0.5 rounded border border-teal-400/30">
              {params.propellerRpm} RPM
            </span>
          </div>
          <input
            type="range"
            min="0"
            aria-label="추진기 회전수"
            max="120"
            step="5"
            value={params.propellerRpm}
            onChange={(e) => onChangeParams({ propellerRpm: Number(e.target.value) })}
            className="w-full accent-teal-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
          {/* Quick Presets */}
          <div className="flex items-center justify-between gap-1 pt-1">
            <button
              onClick={() => onChangeParams({ propellerRpm: 0 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              0 RPM 정지
            </button>
            <button
              onClick={() => onChangeParams({ propellerRpm: 45 })}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded"
            >
              45 RPM 저속
            </button>
            <button
              onClick={() => onChangeParams({ propellerRpm: 115 })}
              className="px-2 py-0.5 bg-teal-950/60 hover:bg-teal-900 border border-teal-400/40 text-teal-300 text-[10px] font-mono rounded font-bold"
            >
              115 RPM 최대난류
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="grid grid-cols-1 grid-cols-1 gap-3 pt-1 border-t border-slate-800">
        {/* Emergency Quick Release Button */}
        <button
          onClick={() => {
            onTriggerQuickRelease();
          }}
          className={`py-2.5 px-4 rounded-lg font-mono text-xs font-black tracking-wider flex items-center justify-center gap-2 transition-all border shadow-lg ${
            params.quickReleaseActive
              ? 'bg-emerald-950 text-emerald-300 border-emerald-400 shadow-emerald-500/30'
              : 'bg-red-600/30 hover:bg-red-600/45 text-red-300 border-red-500 hover:border-red-400 shadow-red-500/40 animate-pulse'
          }`}
        >
          <AlertOctagon size={16} />
          {params.quickReleaseActive ? '예인줄 재연결 (현재 분리됨)' : '비상 예인줄 즉시 분리 (QUICK RELEASE)'}
        </button>

        {/* Self-Verification Test Suite Runner */}
        <button
          onClick={onOpenVerificationModal}
          className="py-2.5 px-4 rounded-lg font-mono text-xs font-bold tracking-wider flex items-center justify-center gap-2 bg-marine-800 hover:bg-marine-700 text-cyan-300 border border-cyan-400/50 hover:border-cyan-400 transition-all shadow-md"
        >
          <CheckCircle2 size={16} />
          시나리오 점검
        </button>
      </div>
    </div>
  );
};
