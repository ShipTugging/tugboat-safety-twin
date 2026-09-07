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
import { Camera, Layers, Sun, Sunset, Moon, Compass, AlertTriangle, SlidersHorizontal } from 'lucide-react';

interface Scene3DProps {
  params: SimulationParams; telemetry: TelemetryState;
  onUpdatePhysics: (delta: number) => void;
  onSelectCamera: (mode: CameraMode) => void;
  onSelectTimeOfDay: (time: TimeOfDay) => void;
}
function CameraController({ params, telemetry, onUpdatePhysics }: Pick<Scene3DProps, 'params'|'telemetry'|'onUpdatePhysics'>) {
  const { camera, size } = useThree();
  const lastMode = useRef<CameraMode | null>(null);
  const previousWidth = useRef(0);
  const target = useRef(new THREE.Vector3());
  useFrame((state, delta) => {
    onUpdatePhysics(delta);
    const mode = params.cameraMode;
    // Top-down needs a horizontal up-vector; the default +Y is parallel to
    // the viewing direction and makes the heading unstable near the pole.
    camera.up.set(0, mode === 'topDown' ? 0 : 1, mode === 'topDown' ? 1 : 0);
    const [x,y,z] = telemetry.tugPosition;
    const yaw = telemetry.tugRotation[1];
    const blend = 1-Math.exp(-delta*3);
    if (mode === 'orbit') {
      if (lastMode.current !== mode || Math.abs(previousWidth.current-size.width)>80) {
        const scale = size.width / size.height < 1 ? 1.45 : 1;
        camera.position.set(76*scale, 48*scale, -100*scale);
        previousWidth.current=size.width;
      }
    } else if (mode === 'tugChase') {
      target.current.set(x-Math.sin(yaw)*26, y+13, z-Math.cos(yaw)*26);
      camera.position.lerp(target.current, blend);
      camera.lookAt(x, y+2, z+9);
    } else if (mode === 'bridgeView') {
      target.current.set(x, y+7.5, z+1);
      camera.position.lerp(target.current, blend);
      camera.lookAt(3.5, 4, -30);
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
  });
  return null;
}
export function Scene3D({ params, telemetry, onUpdatePhysics, onSelectCamera, onSelectTimeOfDay }: Scene3DProps) {
  const [analysis, setAnalysis] = useState(false);
  const [quality, setQuality] = useState<'standard'|'high'>('high');
  const girting = telemetry.girtingStatus === 'CRITICAL';
  const suction = telemetry.suctionStatus === 'CRITICAL';
  const hasAlert = girting || suction || telemetry.inWashZone;
  return <div className="scene-viewport">
    <Canvas shadows={quality === 'high'} dpr={quality === 'high' ? [1, 1.5] : 1} gl={{antialias:true,alpha:false,powerPreference:'high-performance',toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.1}}>
      <PerspectiveCamera makeDefault position={[76,48,-100]} fov={43} near={.3} far={1800}/>
      {params.cameraMode === 'orbit' && <OrbitControls makeDefault enableDamping dampingFactor={.06} minDistance={25} maxDistance={260} maxPolarAngle={Math.PI/2-.08} target={[4,2,-17]}/>}
      <CameraController params={params} telemetry={telemetry} onUpdatePhysics={onUpdatePhysics}/>
      <HarborEnvironment showTacticalGrid={analysis} timeOfDay={params.timeOfDay} telemetry={telemetry} shipSpeed={params.shipSpeed} propellerRpm={params.propellerRpm} highQuality={quality === 'high'}/>
      <LargeShip position={telemetry.shipPosition} shipSpeedKnots={params.shipSpeed} timeOfDay={params.timeOfDay}/>
      <Tugboat position={telemetry.tugPosition} rotation={telemetry.tugRotation} isGirtingCritical={girting} isInWashTurbulence={telemetry.inWashZone} timeOfDay={params.timeOfDay}/>
      <TowingLine start={telemetry.lineStartPoint} end={telemetry.lineEndPoint} tensionKn={telemetry.lineTensionKn} girtingStatus={telemetry.girtingStatus} quickReleaseActive={params.quickReleaseActive}/>
      <HazardZones enabled={analysis} inWashZone={telemetry.inWashZone} hullDistanceM={telemetry.hullDistanceM} lineAngleDeg={telemetry.lineAngleDeg} tugPosition={telemetry.tugPosition} shipSpeed={params.shipSpeed} propellerRpm={params.propellerRpm}/>
    </Canvas>
    <div className="scene-top">
      <div className={params.cameraMode === 'orbit' ? 'scene-title' : 'scene-title compact'}><span className="eyebrow">LIVE DIGITAL TWIN</span><h1>바다 위의 모든 순간,<br/><span>더 안전하게.</span></h1><p>항만 예인 안전 관제 <span>/</span> HARBOR ESCORT</p></div>
      <div className="time-switch" aria-label="시간대">{([{id:'day',label:'주간',icon:Sun},{id:'sunset',label:'황혼',icon:Sunset},{id:'night',label:'야간',icon:Moon}] as const).map(item=><button key={item.id} onClick={()=>onSelectTimeOfDay(item.id)} aria-pressed={params.timeOfDay===item.id} aria-label={item.label} title={item.label}><item.icon size={16}/></button>)}</div>
    </div>
    <div className="scene-bottom">
      {hasAlert && <div className={girting || suction ? 'scene-alert critical' : 'scene-alert'} role="status"><AlertTriangle size={16}/><span>{[girting && '거팅 위험 · 예인줄 분리 필요', suction && `흡인 위험 · 이격 ${telemetry.hullDistanceM.toFixed(1)}m`, telemetry.inWashZone && `후류 진입 · 난류 ${telemetry.washTurbulencePct}%`].filter(Boolean).join(' / ')}</span></div>}
      {analysis && <div className="analysis-legend"><span>분석 레이어</span><span>주황 5m · 청록 9m 이격선</span><span>점선: 후류 범위</span></div>}
      <div className="scene-caption"><span><i/>ASD TUG · 예인선 추적 중</span><span>선박 · 해양 운동 시뮬레이션</span></div>
      <div className="view-toolbar">
        <div className="camera-select"><Camera size={15}/><select aria-label="카메라 시점" value={params.cameraMode} onChange={e=>onSelectCamera(e.target.value as CameraMode)}><option value="orbit">자유 시점</option><option value="tugChase">예인선 추적</option><option value="bridgeView">선교 시점</option><option value="topDown">상공 시점</option><option value="cinematic">시네마틱</option></select></div>
        <button className="layer-button" aria-pressed={analysis} onClick={()=>setAnalysis(!analysis)}><Layers size={15}/><span>위험 분석</span></button>
        <button className="quality-button" onClick={()=>setQuality(quality === 'high' ? 'standard':'high')} aria-label={`화질: ${quality === 'high' ? '고품질':'기본'}`}><SlidersHorizontal size={14}/><span>{quality === 'high' ? '고품질':'기본 화질'}</span></button>
        <div className="compass-mark" title="월드 기준 북쪽 +Z"><Compass size={19}/><span>N</span></div>
      </div>
    </div>
  </div>;
}
