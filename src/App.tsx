import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SimulationParams, CameraMode, TimeOfDay } from './types/maritime';
import { useMaritimePhysics } from './hooks/useMaritimePhysics';
import { Scene3D } from './components/Scene3D';
import { Dashboard } from './components/Dashboard';
import { VerificationModal } from './components/VerificationModal';
import { maritimeAudio } from './utils/audioSystem';
import { PanelRightClose, PanelRightOpen, Volume2, VolumeX, X, Unplug } from 'lucide-react';
import { AnalysisCamera } from './components/AnalysisCamera';
import { DemoPanel } from './components/DemoPanel';
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
  const [sceneControlsHidden,setSceneControlsHidden]=useState(false);
  const [displayMode,setDisplayMode]=useState<'twin'|'service'>('twin');
  const toolsDialog=useRef<HTMLDialogElement>(null);
  const [toolsOpen,setToolsOpen]=useState(false);
  useEffect(()=>{if(toolsOpen)toolsDialog.current?.showModal();else toolsDialog.current?.close();},[toolsOpen]);
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState<boolean>(false);
  const [is3DFullscreen, setIs3DFullscreen] = useState<boolean>(false);
  const dataset=useDatasetExporter(params.towPosition??BOW_BASELINE.towPosition);
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
      if (toolsOpen || isVerificationModalOpen || operationBusy) return;
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
      } else if (e.key.toLowerCase() === 'f' && displayMode==='twin') {
        setIs3DFullscreen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTriggerQuickRelease, handleSelectCamera, handleToggleSound, isVerificationModalOpen, operationBusy, toolsOpen, displayMode]);

  const shownTelemetry=activeSample?.telemetry??telemetry;
  const scene=<Scene3D controlsHidden={sceneControlsHidden} params={displayMode==='service'?{...(activeSample?.params??params),cameraMode:'orbit'}:(activeSample?.params??params)} telemetry={shownTelemetry} onUpdatePhysics={updatePhysics} onSelectCamera={handleSelectCamera} onSelectTimeOfDay={handleSelectTimeOfDay} captureSample={activeSample} captureBusy={operationBusy} datasetMode={dataset.enabled||!!riskRecorder.sample||serverAnalysis.state==='running'} liveCameraMode={displayMode==='service'?'orbit':params.cameraMode} onCaptureReady={dataset.setCaptureApi} sequencePlayback={!!riskRecorder.sample} serverAnalysis={serverAnalysis}/>;
  return (
    <div className={"app-shell demo-shell mode-"+displayMode}>
      <header className="app-header">
        <div className="brand" aria-label="TUG GUARD"><img className="brand-tension" src="/brand/tension-mark.svg?v=white" alt="" width="48" height="39"/><span className="brand-wordmark">TUG GUARD</span></div>
        <div className="header-divider"/>
        <fieldset className="mode-switch" aria-label="화면 모드" disabled={operationBusy}>{([{id:'twin',name:'디지털 트윈'},{id:'service',name:'서비스'}] as const).map(mode=><button key={mode.id} aria-pressed={displayMode===mode.id} onClick={()=>{setDisplayMode(mode.id);setIs3DFullscreen(false);}}>{mode.name}</button>)}</fieldset>
        <fieldset className="header-actions" disabled={operationBusy}>
          {displayMode==='twin'&&<button className="header-scene-toggle" aria-expanded={!sceneControlsHidden} onClick={()=>setSceneControlsHidden(!sceneControlsHidden)}>{sceneControlsHidden?'조작 표시':'조작 숨기기'}</button>}
          <button className="icon-button" onClick={handleToggleSound} aria-label={params.soundEnabled?'음향 끄기':'음향 켜기'} title="음향 (M)">{params.soundEnabled?<Volume2 size={17}/>:<VolumeX size={17}/>}</button>
          <button className="icon-button" disabled={displayMode==='service'} onClick={()=>setIs3DFullscreen(!is3DFullscreen)} aria-label={is3DFullscreen?'관제 패널 열기':'관제 패널 접기'} title="관제 패널 (F)">{is3DFullscreen?<PanelRightOpen size={17}/>:<PanelRightClose size={17}/>}</button>
          <button className={'emergency-button '+(params.quickReleaseActive?'released':'')} onClick={handleTriggerQuickRelease}><Unplug size={16}/><span>{params.quickReleaseActive?'예인줄 재연결':'예인줄 분리'}</span><kbd>SPACE</kbd></button>
        </fieldset>
      </header>
      <main className={'workspace '+(is3DFullscreen?'expanded':'')}>
        <section className="scene-column" aria-label="해양 디지털 트윈">
          {displayMode==='twin'?scene:<AnalysisCamera analysis={serverAnalysis} large/>}

        </section>
        {!is3DFullscreen && <DemoPanel overview={displayMode==='service'?scene:undefined} analysis={serverAnalysis} params={params} onChange={handleParamChange} onReset={handleReset} onTools={()=>setToolsOpen(true)}/>}

      </main>

      <dialog aria-label="추가 도구" ref={toolsDialog} className="tools-dialog" onCancel={()=>setToolsOpen(false)} onClose={()=>setToolsOpen(false)}>
        <header><div><h2>추가 도구</h2><p>고급 조절 / 데이터 생성 / 상세 센서</p></div><button autoFocus aria-label="추가 도구 닫기" onClick={()=>setToolsOpen(false)}><X size={20}/></button></header>
        <div className="tools-content">
          <ScenarioControlDock params={params} onChangeParams={handleParamChange} onReset={handleReset} onTriggerQuickRelease={handleTriggerQuickRelease} analysis={serverAnalysis}/>
          <Dashboard params={activeSample?.params??params} telemetry={shownTelemetry} onChangeParams={handleParamChange} onReset={handleReset} onTriggerQuickRelease={handleTriggerQuickRelease} onOpenVerificationModal={()=>{setToolsOpen(false);setIsVerificationModalOpen(true);}} onToggleSound={handleToggleSound} dataset={dataset} onRandomize={()=>handleParamChange(randomizeEnvironment())} riskRecorder={riskRecorder} serverAnalysis={serverAnalysis}/>
          {import.meta.env.DEV&&<a href="/scripts/video-capture.html" target="_blank" rel="noreferrer">영상 프레임 생성 도구 열기 (로컬 개발용)</a>}
        </div>
      </dialog>
      <VerificationModal isOpen={isVerificationModalOpen} onClose={()=>setIsVerificationModalOpen(false)} currentParams={params} currentTelemetry={telemetry} onChangeParams={handleParamChange}/>
    </div>
  );
}
export default App;
