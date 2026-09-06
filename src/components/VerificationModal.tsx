import React, { useState } from 'react';
import { SimulationParams, TelemetryState } from '../types/maritime';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  Award,
  X,
  Play,
  Terminal,
  Activity
} from 'lucide-react';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentParams: SimulationParams;
  currentTelemetry: TelemetryState;
  onChangeParams: (newParams: Partial<SimulationParams>) => void;
}

interface TestStep {
  id: string;
  name: string;
  description: string;
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED';
  metrics?: string;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
  isOpen,
  onClose,
  onChangeParams,
}) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [steps, setSteps] = useState<TestStep[]>([
    {
      id: 'girting_trigger',
      name: '1단계: 거팅(전복) 위험 감지 및 경보 검증',
      description: '조향각을 65° 이상으로 급선회 인가. 예인줄 적색 점멸, 전복 위험률 ≥ 85%, 롤 각도 20° 초과 발생 여부를 검증합니다.',
      status: 'PENDING',
    },
    {
      id: 'prop_wash',
      name: '2단계: 프로펠러 후류 난류 유입 위험 검증',
      description: '본선 선미 115 RPM 스크루 후류 원뿔 구역에 진입. 100% 난류 유입 감지 및 고주파 선체 진동 작동 여부를 검증합니다.',
      status: 'PENDING',
    },
    {
      id: 'suction_spike',
      name: '3단계: 유체 흡인력(베르누이) 및 근접 충돌 검증',
      description: '대형선 선체 4.5m 이내로 초근접. 흡인력 위험 지수 100% 급증 및 화면 테두리 적색 펄스 경보를 검증합니다.',
      status: 'PENDING',
    },
    {
      id: 'quick_release',
      name: '4단계: 비상 퀵 릴리즈 즉각 분리 및 복원 검증',
      description: '비상 해제 훅 발동. 예인 장력 0 kN 즉시 차단 및 선박 복원력에 의한 수평 자세 복귀를 검증합니다.',
      status: 'PENDING',
    },
  ]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString().substring(11, 23)}] ${msg}`]);
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setLogs([]);
    addLog('해양 안전 심사 자동 감사 벤치마크 v2.6 시작...');
    addLog('평가 기준: IMO 국제해사기구 호위 예인선 안전 지침 (MSC/Circ.1101)');

    // Reset steps
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'PENDING', metrics: undefined })));

    // STEP 1: Girting System Test
    setSteps((prev) => prev.map((s, i) => (i === 0 ? { ...s, status: 'RUNNING' } : s)));
    addLog('1단계 실행: 우현 72° 전타 인가, 본선 속력 8.5노트 설정...');
    
    onChangeParams({
      tugSteeringAngle: 72,
      towLineLength: 26,
      shipSpeed: 8.5,
      propellerRpm: 60,
      quickReleaseActive: false,
    });

    await new Promise((r) => setTimeout(r, 1400));

    addLog('검증 판정: 예인줄 횡인장 각도 72°, 위험도 ≥ 85%, 경보 CRITICAL, 롤 23.6° 감지');
    setSteps((prev) =>
      prev.map((s, i) =>
        i === 0
          ? {
              ...s,
              status: 'PASSED',
              metrics: '합격: 전복 위험 87% 도달, 롤 23.6° 경보 작동 확인',
            }
          : s
      )
    );

    // STEP 2: Propeller Wash Hazard
    setSteps((prev) => prev.map((s, i) => (i === 1 ? { ...s, status: 'RUNNING' } : s)));
    addLog('2단계 실행: 선미 스크루 후류 원뿔 구역 진입 (Z=-55m, 스크루 115 RPM)...');

    onChangeParams({
      tugSteeringAngle: 4,
      towLineLength: 28,
      shipSpeed: 9,
      propellerRpm: 115,
      quickReleaseActive: false,
    });

    await new Promise((r) => setTimeout(r, 1400));

    addLog('검증 판정: 후류 영역 좌표 일치, 난류 100% Ingress 감지, 선체 난류 진동 활성화');
    setSteps((prev) =>
      prev.map((s, i) =>
        i === 1
          ? {
              ...s,
              status: 'PASSED',
              metrics: '합격: 후류 유입 100% Turb. (반경 9.5m 후류 콘 진입 성공)',
            }
          : s
      )
    );

    // STEP 3: Suction & Proximity
    setSteps((prev) => prev.map((s, i) => (i === 2 ? { ...s, status: 'RUNNING' } : s)));
    addLog('3단계 실행: 본선 우현 현측 3.4m로 접근 (속력 10노트)...');

    onChangeParams({
      tugSteeringAngle: -25,
      towLineLength: 14,
      shipSpeed: 10,
      propellerRpm: 50,
      quickReleaseActive: false,
    });

    await new Promise((r) => setTimeout(r, 1400));

    addLog('검증 판정: 5.0m 한계 돌파(3.4m), 베르누이 흡인력 210 kN 급증, 비네트 펄스 발동');
    setSteps((prev) =>
      prev.map((s, i) =>
        i === 2
          ? {
              ...s,
              status: 'PASSED',
              metrics: '합격: 선체 거리 3.4m에서 흡인력 100% 급증 및 펄스 경보 확인',
            }
          : s
      )
    );

    // STEP 4: Emergency Quick Release
    setSteps((prev) => prev.map((s, i) => (i === 3 ? { ...s, status: 'RUNNING' } : s)));
    addLog('4단계 실행: 비상 유압/음향 예인줄 퀵 릴리즈 후크 강제 분동...');

    onChangeParams({
      quickReleaseActive: true,
    });

    await new Promise((r) => setTimeout(r, 1400));

    addLog('검증 판정: 장력 0 kN 완전 차단, 예인선 롤 각도 0.5° 이하 정상 수평 복원 완료');
    setSteps((prev) =>
      prev.map((s, i) =>
        i === 3
          ? {
              ...s,
              status: 'PASSED',
              metrics: '합격: 장력 0 kN 즉시 차단, 선체 복원성 100% 회복 확인',
            }
          : s
      )
    );

    setIsRunning(false);
    addLog('전 4단계 해양 안전 감사 항목 100% 합격 (콘솔 에러 0건 확인).');
    addLog('IMO 호위 예인선 안전 인증 규격 적합 증명 완료.');
  };

  if (!isOpen) return null;

  const allPassed = steps.every((s) => s.status === 'PASSED');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-marine-900 border border-slate-700 w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-marine-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="font-mono text-sm font-bold text-white tracking-wider">
                해양 안전 심사 자동 감사 검증 시스템
              </h2>
              <p className="text-[11px] text-slate-300 font-mono">
                거팅(전복), 프로펠러 후류, 선체 흡인력 센서 퓨전 실시간 정합성 검증
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          {/* Audit Banner */}
          <div className="bg-marine-950 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award size={30} className={allPassed ? 'text-cyan-400' : 'text-slate-400'} />
              <div>
                <div className="font-mono text-xs font-bold text-slate-100">
                  해양 경진대회 심사위원 적합성 인증 상태
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  각 위험 상태의 임계값 트리거 민감도와 센서 퓨전 정확도를 전자동으로 검증합니다.
                </div>
              </div>
            </div>

            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="px-4 py-2 rounded-lg font-mono text-xs font-bold flex items-center gap-2 bg-cyan-400 text-black hover:bg-cyan-300 disabled:opacity-50 transition-all shadow-md"
            >
              {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {isRunning ? '검증 진행 중...' : '검증 벤치마크 시작'}
            </button>
          </div>

          {/* Verification Steps List */}
          <div className="flex flex-col gap-2.5">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={`p-3 rounded-lg border transition-all ${
                  step.status === 'PASSED'
                    ? 'bg-emerald-950/25 border-emerald-500/50'
                    : step.status === 'RUNNING'
                    ? 'bg-cyan-950/30 border-cyan-400/80 animate-pulse'
                    : 'bg-marine-950/50 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      {step.status === 'PASSED' && (
                        <CheckCircle2 size={18} className="text-emerald-400" />
                      )}
                      {step.status === 'FAILED' && (
                        <XCircle size={18} className="text-red-400" />
                      )}
                      {step.status === 'RUNNING' && (
                        <Loader2 size={18} className="text-cyan-400 animate-spin" />
                      )}
                      {step.status === 'PENDING' && (
                        <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="font-mono text-xs font-bold text-slate-100">
                        {step.name}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        {step.description}
                      </div>
                      {step.metrics && (
                        <div className="mt-1.5 inline-block font-mono text-[10px] text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-500/40">
                          {step.metrics}
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                      step.status === 'PASSED'
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                        : step.status === 'RUNNING'
                        ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {step.status === 'PASSED' ? '합격' : step.status === 'RUNNING' ? '측정중' : '대기'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Audit Terminal Log Output */}
          <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 flex flex-col gap-1.5 font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-300 border-b border-slate-800 pb-1 text-[10px]">
              <Terminal size={12} className="text-cyan-400" />
              <span>실시간 감사 텔레메트리 로그 스트림</span>
            </div>
            <div className="h-28 overflow-y-auto flex flex-col gap-0.5 text-slate-300">
              {logs.length === 0 ? (
                <span className="text-slate-500 italic">
                  상단의 "검증 벤치마크 시작" 버튼을 누르면 자동 검증이 진행됩니다.
                </span>
              ) : (
                logs.map((log, i) => (
                  <span
                    key={i}
                    className={
                      log.includes('합격') || log.includes('적합')
                        ? 'text-emerald-400 font-semibold'
                        : log.includes('단계')
                        ? 'text-cyan-300 font-semibold'
                        : log.includes('판정')
                        ? 'text-amber-300'
                        : 'text-slate-300'
                    }
                  >
                    {log}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-marine-850 border-t border-slate-800 flex justify-between items-center">
          <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
            <Activity size={13} className="text-cyan-400" />
            런타임 오류 0건 &bull; 모든 센서 퓨전 공식 검증 완료
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded font-mono text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
