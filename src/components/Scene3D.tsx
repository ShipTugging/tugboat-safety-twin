import React, { useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { SimulationParams, TelemetryState, CameraMode, TimeOfDay } from '../types/maritime';
import { HarborEnvironment } from './HarborEnvironment';
import { LargeShip } from './LargeShip';
import { Tugboat } from './Tugboat';
import { TowingLine } from './TowingLine';
import { HazardZones } from './HazardZones';
import { DatasetCaptureBridge } from './DatasetCaptureBridge';
import { ServerCaptureBridge } from './ServerCaptureBridge';
import type { ServerAnalysis } from '../hooks/useServerAnalysis';
import { MarineFloodlights } from './MarineFloodlights';
import { applyDatasetCamera, isOnboardCamera } from '../dataset/camera';
import { SAG_LEVEL_NAMES, computeSagMetrics, getTowlineAnchors } from '../simulation/towline';
import { TOW_POSITION_LABELS } from '../simulation/towPosition';
import type { CaptureSample, SceneCaptureApi } from '../dataset/types';
import type { V2CaptureHandler } from '../dataset/v2/capture';
import { Camera, Layers, Sun, Sunset, Moon, Compass, AlertTriangle, SlidersHorizontal, Spline } from 'lucide-react';

interface Scene3DProps {
  params: SimulationParams; telemetry: TelemetryState;
  onUpdatePhysics: (delta: number) => void;
  onSelectCamera: (mode: CameraMode) => void;
  onSelectTimeOfDay: (time: TimeOfDay) => void;
  captureSample:CaptureSample|null;
  captureBusy:boolean;
  datasetMode:boolean;
  liveCameraMode:CameraMode;
  onCaptureReady:(api:SceneCaptureApi|null)=>void;
  onV2Capture?:V2CaptureHandler;
  sequencePlayback?:boolean;
  /** Explicit seconds for the local recording renderer only. */
  recordingTime?:number;
  serverAnalysis?:ServerAnalysis;
}
function CameraController({ params, telemetry, onUpdatePhysics, captureBusy, captureSample,sequencePlayback }: Pick<Scene3DProps, 'params'|'telemetry'|'onUpdatePhysics'|'captureBusy'|'captureSample'|'sequencePlayback'>) {
  const { camera, size } = useThree();
  const lastMode = useRef<CameraMode | null>(null);
  const previousWidth = useRef(0);
  const lastTowPosition=useRef<SimulationParams['towPosition']>();
  const target = useRef(new THREE.Vector3());
  useFrame((state, delta) => {
    // Export renders with its own camera. Leave the operator's live camera,
    // orbit target and controller history untouched for exact resume/cancel.
    if(captureBusy&&!sequencePlayback)return;
    if(!captureBusy)onUpdatePhysics(delta);
    const mode = params.cameraMode;
    if(camera instanceof THREE.PerspectiveCamera && isOnboardCamera(mode)) {
      applyDatasetCamera(camera,params,telemetry,size.width/size.height);
      lastMode.current=mode;
      return;
    }
    if(camera instanceof THREE.PerspectiveCamera && camera.fov!==(params.cameraFov??43)) {
      camera.fov=params.cameraFov??43;camera.updateProjectionMatrix();
    }
    // Top-down needs a horizontal up-vector; the default +Y is parallel to
    // the viewing direction and makes the heading unstable near the pole.
    camera.up.set(0, mode === 'topDown' ? 0 : 1, mode === 'topDown' ? 1 : 0);
    const [x,y,z] = telemetry.tugPosition;
    const yaw = telemetry.tugRotation[1];
    const blend = 1-Math.exp(-delta*3);
    if (mode === 'orbit') {
      if (lastMode.current !== mode || Math.abs(previousWidth.current-size.width)>80 || lastTowPosition.current!==params.towPosition) {
        const scale = size.width / size.height < 1 ? 1.45 : 1;
        const center=new THREE.Vector3((telemetry.shipPosition[0]+x)/2,3,(telemetry.shipPosition[2]+z)/2);
        const offsets={astern:[76,48,-75],port:[-75,48,-76],starboard:[75,48,76],ahead:[-76,48,75]} as const;
        const offset=offsets[params.towPosition??'astern'];
        camera.position.set(center.x+offset[0]*scale,center.y+offset[1]*scale,center.z+offset[2]*scale);
        camera.lookAt(center);
        previousWidth.current=size.width;
      }
    } else if (mode === 'tugChase') {
      target.current.set(x-Math.sin(yaw)*26, y+13, z-Math.cos(yaw)*26);
      camera.position.lerp(target.current, blend);
      camera.lookAt(x+Math.sin(yaw)*9,y+2,z+Math.cos(yaw)*9);
    } else if (mode === 'bridgeView') {
      target.current.set(x, y+7.5, z+1);
      camera.position.lerp(target.current, blend);
      camera.lookAt(...telemetry.lineStartPoint);
    } else if (mode === 'topDown') {
      target.current.set(4, 180, -15);
      camera.position.lerp(target.current, blend);
      camera.lookAt(4,0,-15);
    } else {
      const angle = state.clock.elapsedTime*.045;
      target.current.set(Math.cos(angle)*120, 48+Math.sin(angle*.7)*9, -24+Math.sin(angle)*125);
      camera.position.lerp(target.current, blend);
      camera.lookAt(5,2,-18);
    }
    lastMode.current = mode;
    lastTowPosition.current=params.towPosition;
  });
  return null;
}
export function Scene3D({ params, telemetry, onUpdatePhysics, onSelectCamera, onSelectTimeOfDay, captureSample, captureBusy, datasetMode, liveCameraMode, onCaptureReady,onV2Capture,sequencePlayback,serverAnalysis,recordingTime }: Scene3DProps) {
  const [analysis, setAnalysis] = useState(false);
  const [quality, setQuality] = useState<'standard'|'high'>('high');
  const girting = telemetry.girtingStatus === 'CRITICAL';
  const suction = telemetry.suctionStatus === 'CRITICAL';
  const hasAlert = girting || suction || telemetry.inWashZone;
  const tugRef=useRef<THREE.Group>(null), shipRef=useRef<THREE.Group>(null), ropeRef=useRef<THREE.Mesh>(null);
  const anchors=getTowlineAnchors(telemetry);
  const sag=computeSagMetrics(anchors.start,anchors.end,params.towLineLength,telemetry.lineTensionKn,telemetry.girtingStatus,params.ropeSlackM,params.ropeSagOverrideM);
  return <div className="scene-viewport">
    <Canvas shadows={quality === 'high'} dpr={quality === 'high' ? [1, 1.5] : 1} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance',toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.1}}>
      <PerspectiveCamera makeDefault position={[76,48,-100]} fov={43} near={.3} far={1800}/>
      {liveCameraMode === 'orbit' && <OrbitControls enabled={!captureBusy} makeDefault enableDamping dampingFactor={.06} minDistance={25} maxDistance={260} maxPolarAngle={Math.PI/2-.08} target={[(telemetry.shipPosition[0]+telemetry.tugPosition[0])/2,3,(telemetry.shipPosition[2]+telemetry.tugPosition[2])/2]}/>}
      <CameraController params={params} telemetry={telemetry} onUpdatePhysics={onUpdatePhysics} captureBusy={captureBusy} captureSample={captureSample} sequencePlayback={sequencePlayback}/>
      <HarborEnvironment showTacticalGrid={analysis&&!datasetMode} timeOfDay={params.timeOfDay} telemetry={telemetry} shipSpeed={params.shipSpeed} propellerRpm={params.propellerRpm} highQuality={quality === 'high'} fogDensity={params.fogDensity} sunIntensity={params.sunIntensity} waveStrength={params.waveStrength} simulationTime={recordingTime??captureSample?.time}/>
      <group ref={shipRef}><LargeShip position={telemetry.shipPosition} shipSpeedKnots={params.shipSpeed} timeOfDay={params.timeOfDay} hullColor={params.hullColor} simulationTime={recordingTime??(captureSample?.v2?captureSample.time:undefined)}/></group>
      <group ref={tugRef}><Tugboat position={telemetry.tugPosition} rotation={telemetry.tugRotation} isGirtingCritical={girting&&!datasetMode} isInWashTurbulence={telemetry.inWashZone&&!datasetMode} timeOfDay={params.timeOfDay} simulationTime={recordingTime??(captureSample?.v2?captureSample.time:undefined)}/></group>
      {params.timeOfDay==='night'&&<MarineFloodlights telemetry={telemetry} shadows={quality==='high'}/>}
      <TowingLine meshRef={ropeRef} start={anchors.start.toArray()} end={anchors.end.toArray()} tensionKn={telemetry.lineTensionKn} girtingStatus={telemetry.girtingStatus} quickReleaseActive={params.quickReleaseActive} lineLength={params.towLineLength} ropeSlackM={params.ropeSlackM} ropeSagOverrideM={params.ropeSagOverrideM} ropeColor={params.ropeColor} ropeRadius={params.ropeRadius} datasetMode={datasetMode}/>
      <HazardZones enabled={analysis&&!datasetMode} inWashZone={telemetry.inWashZone} hullDistanceM={telemetry.hullDistanceM} lineAngleDeg={telemetry.lineAngleDeg} tugPosition={telemetry.tugPosition} shipSpeed={params.shipSpeed} propellerRpm={params.propellerRpm}/>
      <DatasetCaptureBridge sample={captureSample} tug={tugRef} ship={shipRef} rope={ropeRef} onReady={onCaptureReady} onV2Capture={onV2Capture}/>
      {serverAnalysis&&<ServerCaptureBridge params={params} telemetry={telemetry} analysis={serverAnalysis}/>}
    </Canvas>
    <div className="scene-top">
      <div className="scene-title"><span className="eyebrow">{captureBusy?'DATASET CAPTURE':'TUG GUARD'}</span></div>
      <fieldset disabled={captureBusy} className="time-switch" aria-label="시간대">{([{id:'day',label:'주간',icon:Sun},{id:'sunset',label:'황혼',icon:Sunset},{id:'night',label:'야간',icon:Moon}] as const).map(item=><button key={item.id} onClick={()=>onSelectTimeOfDay(item.id)} aria-pressed={params.timeOfDay===item.id} aria-label={item.label} title={item.label}><item.icon size={16}/></button>)}</fieldset>
    </div>
    <div className="scene-bottom">
      {hasAlert && <div className={girting || suction ? 'scene-alert critical' : 'scene-alert'} role="status"><AlertTriangle size={16}/><span>{[girting && '거팅 위험 · 예인줄 분리 필요', suction && `흡인 위험 · 이격 ${telemetry.hullDistanceM.toFixed(1)}m`, telemetry.inWashZone && `후류 진입 · 난류 ${telemetry.washTurbulencePct}%`].filter(Boolean).join(' / ')}</span></div>}
      {analysis && <div className="analysis-legend"><span>분석 레이어</span><span>주황 5m · 청록 9m 이격선</span><span>점선: 후류 범위</span></div>}
      {!params.quickReleaseActive && <div className={'sag-chip level-'+sag.level} role="status" aria-label="예인줄 처짐"><Spline size={14}/><span>예인줄 Sag L{sag.level} · {SAG_LEVEL_NAMES[sag.level]}</span><b>{sag.sagRatio.toFixed(3)}</b><small>{sag.sagM.toFixed(2)} m / {sag.spanM.toFixed(1)} m</small></div>}
      <div className="scene-caption"><span><i/>ASD TUG · {TOW_POSITION_LABELS[params.towPosition??'astern']} 호위</span><span>선박 · 해양 운동 시뮬레이션</span></div>
      <fieldset disabled={captureBusy} className="view-toolbar">
        <div className="camera-select"><Camera size={15}/><select aria-label="카메라 시점" value={params.cameraMode} onChange={e=>onSelectCamera(e.target.value as CameraMode)}><option value="orbit">자유 시점</option><option value="tugChase">예인선 추적</option><option value="bridgeView">선교 시점</option><option value="topDown">상공 시점</option><option value="cinematic">시네마틱</option><option value="TUG_AFT_DECK">CCTV · 선미 덱</option><option value="TUG_BRIDGE">CCTV · 조타실 80°</option><option value="TUG_SAG_CAM">CCTV · 예인줄 감시(Sag)</option></select></div>
        <button className="layer-button" aria-pressed={analysis} onClick={()=>setAnalysis(!analysis)}><Layers size={15}/><span>위험 분석</span></button>
        <button className="quality-button" onClick={()=>setQuality(quality === 'high' ? 'standard':'high')} aria-label={`화질: ${quality === 'high' ? '고품질':'기본'}`}><SlidersHorizontal size={14}/><span>{quality === 'high' ? '고품질':'기본 화질'}</span></button>
        <div className="compass-mark" title="월드 기준 북쪽 +Z"><Compass size={19}/><span>N</span></div>
      </fieldset>
    </div>
  </div>;
}
