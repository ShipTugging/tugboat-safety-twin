import React, { useState, useCallback, useEffect } from 'react';
import { SimulationParams, CameraMode, TimeOfDay } from './types/maritime';
import { useMaritimePhysics } from './hooks/useMaritimePhysics';
import { Scene3D } from './components/Scene3D';
import { Dashboard } from './components/Dashboard';
import { VerificationModal } from './components/VerificationModal';
import { maritimeAudio } from './utils/audioSystem';
import { Anchor, PanelRightClose, PanelRightOpen, Volume2, VolumeX, ArrowUpRight, RotateCcw, Unplug } from 'lucide-react';
import { KOREAN_PRESETS } from './components/ControlPanel';
import { useDatasetExporter } from './hooks/useDatasetExporter';
import { randomizeEnvironment } from './dataset/environment';
import { useRiskRecorder } from './hooks/useRiskRecorder';
import { useServerAnalysis } from './hooks/useServerAnalysis';
import { ScenarioControlDock } from './components/ScenarioControlDock';
import { BOW_BASELINE } from './components/scenarioControlModel';

const DEFAULT_PARAMS: SimulationParams = {
  tugSteeringAngle: 18,
  towLineLength: 32,
  shipSpeed: 6,
  propellerRpm: 45,
  cameraMode: BOW_BASELINE.cameraMode,
  timeOfDay: 'day',
  quickReleaseActive: false,
  soundEnabled: false,
  fogDensity: 0.0014,
  towPosition: BOW_BASELINE.towPosition,
};

export function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState<boolean>(false);
  const [is3DFullscreen, setIs3DFullscreen] = useState<boolean>(false);
  const dataset=useDatasetExporter(params.towPosition??'astern');
  const riskRecorder=useRiskRecorder(params,dataset.busy);
  const operationBusy=dataset.busy||riskRecorder.busy;
  const serverAnalysis=useServerAnalysis(operationBusy);
  const activeSample=dataset.sample??riskRecorder.sample;

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
    if (!params.soundEnabled || operationBusy) {
      maritimeAudio.stopAlarm();
      return;
    }
    const isCritical = telemetry.girtingStatus === 'CRITICAL' || telemetry.suctionStatus === 'CRITICAL';
    if (isCritical) {
      maritimeAudio.startAlarm();
    } else {
      maritimeAudio.stopAlarm();
    }
  }, [telemetry.girtingStatus, telemetry.suctionStatus, params.soundEnabled, operationBusy]);

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
      if (isVerificationModalOpen || operationBusy) return;
      if (e.repeat || (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input, textarea, select, button, summary')))) return;

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
  }, [handleTriggerQuickRelease, handleSelectCamera, handleToggleSound, isVerificationModalOpen, operationBusy]);

  const shownTelemetry=activeSample?.telemetry??telemetry;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="TUG GUARD"><span className="brand-symbol"><Anchor size={22}/></span><span>TUG<span className="brand-light">GUARD</span><small>MARITIME INTELLIGENCE</small></span></div>
        <div className="header-divider"/>
        <div className="header-context"><span>해양 안전 디지털 트윈</span><small>항만 호위 운항 시뮬레이션</small></div>
        <fieldset className="header-actions" disabled={operationBusy}>
          <button className="icon-button" onClick={handleToggleSound} aria-label={params.soundEnabled?'음향 끄기':'음향 켜기'} title="음향 (M)">{params.soundEnabled?<Volume2 size={17}/>:<VolumeX size={17}/>}</button>
          <button className="icon-button" onClick={()=>setIs3DFullscreen(!is3DFullscreen)} aria-label={is3DFullscreen?'관제 패널 열기':'관제 패널 접기'} title="관제 패널 (F)">{is3DFullscreen?<PanelRightOpen size={17}/>:<PanelRightClose size={17}/>}</button>
          <button className={'emergency-button '+(params.quickReleaseActive?'released':'')} onClick={handleTriggerQuickRelease}><Unplug size={16}/><span>{params.quickReleaseActive?'예인줄 재연결':'비상 분리'}</span><kbd>SPACE</kbd></button>
        </fieldset>
      </header>
      <main className={'workspace '+(is3DFullscreen?'expanded':'')}>
        <section className="scene-column" aria-label="해양 디지털 트윈">
          <Scene3D params={activeSample?.params??params} telemetry={shownTelemetry} onUpdatePhysics={updatePhysics} onSelectCamera={handleSelectCamera} onSelectTimeOfDay={handleSelectTimeOfDay} captureSample={activeSample} captureBusy={operationBusy} datasetMode={dataset.enabled||!!riskRecorder.sample||serverAnalysis.state==='running'} liveCameraMode={params.cameraMode} onCaptureReady={dataset.setCaptureApi} sequencePlayback={!!riskRecorder.sample} serverAnalysis={serverAnalysis}/>
          <section className="scenario-dock" aria-label="시나리오 선택">
            <div className="scenario-heading"><span className="eyebrow">SCENARIOS · BOW FIRST</span><button disabled={operationBusy} onClick={handleReset} title="기본값 복원"><RotateCcw size={13}/>초기화</button></div>
            <fieldset disabled={operationBusy} className="scenario-grid">{KOREAN_PRESETS.map((preset,index)=>{
              const active = Object.entries(preset.params).every(([key,value])=>params[key as keyof SimulationParams] === value) && !params.quickReleaseActive;
              return <button key={preset.id} className={'scenario-card '+(active?'active':'')} aria-pressed={active} onClick={()=>handleParamChange({...preset.params,quickReleaseActive:false})}><span className="scenario-number">0{index+1}</span><span className="scenario-name">{['정상 호위','거팅 위험','후류 진입','선체 근접'][index]}<small>{['SAFE ESCORT','GIRTING RISK','PROPELLER WASH','HULL SUCTION'][index]}</small></span><ArrowUpRight size={15}/></button>;
              })}</fieldset>
            <ScenarioControlDock params={params} onChangeParams={handleParamChange} onReset={handleReset} onTriggerQuickRelease={handleTriggerQuickRelease} analysis={serverAnalysis}/>
          </section>
        </section>
        {!is3DFullscreen && <Dashboard params={activeSample?.params??params} telemetry={shownTelemetry} onChangeParams={handleParamChange} onReset={handleReset} onTriggerQuickRelease={handleTriggerQuickRelease} onOpenVerificationModal={()=>setIsVerificationModalOpen(true)} onToggleSound={handleToggleSound} dataset={dataset} onRandomize={()=>handleParamChange(randomizeEnvironment())} riskRecorder={riskRecorder} serverAnalysis={serverAnalysis}/>}
      </main>
      <footer className="app-footer"><span><i/>SIMULATION ACTIVE</span><span>실제 운항 판단용이 아닌 시나리오 시뮬레이터</span><span>TUG GUARD / 2026</span></footer>
      <VerificationModal isOpen={isVerificationModalOpen} onClose={()=>setIsVerificationModalOpen(false)} currentParams={params} currentTelemetry={telemetry} onChangeParams={handleParamChange}/>
    </div>
  );
}
export default App;
