import React, { useState, useCallback, useEffect } from 'react';
import { SimulationParams, CameraMode, TimeOfDay } from './types/maritime';
import { useMaritimePhysics } from './hooks/useMaritimePhysics';
import { Scene3D } from './components/Scene3D';
import { Dashboard } from './components/Dashboard';
import { VerificationModal } from './components/VerificationModal';
import { maritimeAudio } from './utils/audioSystem';
import { Maximize2, Minimize2 } from 'lucide-react';

const DEFAULT_PARAMS: SimulationParams = {
  tugSteeringAngle: 18,
  towLineLength: 32,
  shipSpeed: 6,
  propellerRpm: 45,
  cameraMode: 'orbit',
  timeOfDay: 'day',
  quickReleaseActive: false,
  soundEnabled: true,
  fogDensity: 0.008,
};

export function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState<boolean>(false);
  const [is3DFullscreen, setIs3DFullscreen] = useState<boolean>(false);

  // Hydrodynamics & Sensor Fusion Hook
  const { telemetry, updatePhysics } = useMaritimePhysics(params);

  // Update parameters partially
  const handleParamChange = useCallback((newParams: Partial<SimulationParams>) => {
    setParams((prev) => ({ ...prev, ...newParams }));
  }, []);

  // Reset to default baseline
  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
  }, []);

  // Actuate Emergency Quick Release
  const handleTriggerQuickRelease = useCallback(() => {
    setParams((prev) => {
      const next = !prev.quickReleaseActive;
      if (next) {
        maritimeAudio.playQuickRelease();
      }
      return { ...prev, quickReleaseActive: next };
    });
  }, []);

  // Change camera mode
  const handleSelectCamera = useCallback((mode: CameraMode) => {
    setParams((prev) => ({ ...prev, cameraMode: mode }));
  }, []);

  // Change time-of-day lighting
  const handleSelectTimeOfDay = useCallback((time: TimeOfDay) => {
    setParams((prev) => ({ ...prev, timeOfDay: time }));
  }, []);

  // Toggle audio mute
  const handleToggleSound = useCallback(() => {
    setParams((prev) => {
      const next = !prev.soundEnabled;
      maritimeAudio.setMuted(!next);
      return { ...prev, soundEnabled: next };
    });
  }, []);

  // Audio system sync
  useEffect(() => {
    maritimeAudio.setMuted(!params.soundEnabled);
  }, [params.soundEnabled]);

  // Critical alarm sound trigger
  useEffect(() => {
    if (!params.soundEnabled) {
      maritimeAudio.stopAlarm();
      return;
    }
    const isCritical = telemetry.girtingStatus === 'CRITICAL' || telemetry.suctionStatus === 'CRITICAL';
    if (isCritical) {
      maritimeAudio.startAlarm();
    } else {
      maritimeAudio.stopAlarm();
    }
  }, [telemetry.girtingStatus, telemetry.suctionStatus, params.soundEnabled]);

  // High tension creak sound
  useEffect(() => {
    if (params.soundEnabled && telemetry.lineTensionKn > 380) {
      maritimeAudio.playTensionCreak();
    }
  }, [telemetry.lineTensionKn, params.soundEnabled]);

  // Periodic sonar ping during safe escort
  useEffect(() => {
    if (!params.soundEnabled) return;
    const interval = setInterval(() => {
      if (telemetry.girtingStatus !== 'CRITICAL' && telemetry.suctionStatus !== 'CRITICAL') {
        maritimeAudio.playSonarPing();
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [params.soundEnabled, telemetry.girtingStatus, telemetry.suctionStatus]);

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTriggerQuickRelease();
      } else if (e.key === '1') {
        handleSelectCamera('orbit');
      } else if (e.key === '2') {
        handleSelectCamera('tugChase');
      } else if (e.key === '3') {
        handleSelectCamera('bridgeView');
      } else if (e.key === '4') {
        handleSelectCamera('topDown');
      } else if (e.key === '5') {
        handleSelectCamera('cinematic');
      } else if (e.key.toLowerCase() === 't') {
        setParams((prev) => {
          const nextTime: TimeOfDay =
            prev.timeOfDay === 'day' ? 'sunset' : prev.timeOfDay === 'sunset' ? 'night' : 'day';
          return { ...prev, timeOfDay: nextTime };
        });
      } else if (e.key.toLowerCase() === 'm') {
        handleToggleSound();
      } else if (e.key.toLowerCase() === 'f') {
        setIs3DFullscreen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTriggerQuickRelease, handleSelectCamera, handleToggleSound]);

  return (
    <div className="flex flex-col lg:flex-row w-screen h-screen bg-marine-950 overflow-hidden select-none relative font-sans">
      {/* LEFT WINDOW: 3D Digital Twin Simulation Canvas */}
      <div
        className={`transition-all duration-300 relative ${
          is3DFullscreen
            ? 'w-full h-full'
            : 'w-full h-1/2 lg:h-full lg:w-[54%]'
        }`}
      >
        <Scene3D
          params={params}
          telemetry={telemetry}
          onUpdatePhysics={updatePhysics}
          onSelectCamera={handleSelectCamera}
          onSelectTimeOfDay={handleSelectTimeOfDay}
        />

        {/* Fullscreen / Split Toggle Floating Button */}
        <button
          onClick={() => setIs3DFullscreen(!is3DFullscreen)}
          className="absolute bottom-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-marine-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-400/40 text-xs font-mono flex items-center gap-1.5 shadow-xl backdrop-blur-md transition-all"
          title="3D 전체화면 / 분할화면 전환 (단축키: F)"
        >
          {is3DFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          <span>{is3DFullscreen ? '분할 관제 뷰 복귀' : '3D 전체화면 확대'}</span>
        </button>
      </div>

      {/* RIGHT WINDOW: Telemetry & AI Analytics Dashboard */}
      {!is3DFullscreen && (
        <div className="w-full h-1/2 lg:h-full lg:w-[46%] relative">
          <Dashboard
            params={params}
            telemetry={telemetry}
            onChangeParams={handleParamChange}
            onReset={handleReset}
            onTriggerQuickRelease={handleTriggerQuickRelease}
            onOpenVerificationModal={() => setIsVerificationModalOpen(true)}
            onToggleSound={handleToggleSound}
          />
        </div>
      )}

      {/* Automated Maritime Safety Audit Modal */}
      <VerificationModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        currentParams={params}
        currentTelemetry={telemetry}
        onChangeParams={handleParamChange}
      />
    </div>
  );
}

export default App;
