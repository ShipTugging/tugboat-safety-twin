import React, { useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { SimulationParams, TelemetryState, CameraMode, TimeOfDay } from '../types/maritime';
import { HarborEnvironment } from './HarborEnvironment';
import { LargeShip } from './LargeShip';
import { Tugboat } from './Tugboat';
import { TowingLine } from './TowingLine';
import { CameraFrustum } from './CameraFrustum';
import { PropellerWash } from './PropellerWash';
import { ShipWake } from './ShipWake';
import { HazardZones } from './HazardZones';
import { Camera, AlertTriangle, ShieldAlert, Wind, Zap, Waves, Grid as GridIcon, Crosshair, Sun, Sunset, Moon } from 'lucide-react';

interface Scene3DProps {
  params: SimulationParams;
  telemetry: TelemetryState;
  onUpdatePhysics: (delta: number) => void;
  onSelectCamera: (mode: CameraMode) => void;
  onSelectTimeOfDay: (time: TimeOfDay) => void;
}

// Internal camera controller tracking tugboat with smooth interpolation
const CameraController: React.FC<{
  cameraMode: CameraMode;
  tugPosition: [number, number, number];
  tugRotation: [number, number, number];
  onUpdatePhysics: (delta: number) => void;
}> = ({ cameraMode, tugPosition, tugRotation, onUpdatePhysics }) => {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    // 1. Advance physics simulation
    onUpdatePhysics(delta);

    // 2. Camera perspective logic
    const [tx, ty, tz] = tugPosition;
    const yaw = tugRotation[1];

    if (cameraMode === 'tugChase') {
      const behindDist = 20;
      const height = 9;
      const camX = tx - Math.sin(yaw) * behindDist;
      const camY = ty + height;
      const camZ = tz - Math.cos(yaw) * behindDist;

      targetPos.current.set(camX, camY, camZ);
      lookTarget.current.set(tx + Math.sin(yaw) * 15, ty + 4, tz + Math.cos(yaw) * 15);

      camera.position.lerp(targetPos.current, 0.08);
      camera.lookAt(lookTarget.current);
    } else if (cameraMode === 'bridgeView') {
      const camX = tx;
      const camY = ty + 3.2;
      const camZ = tz + 0.4;

      camera.position.set(camX, camY, camZ);
      lookTarget.current.set(3.5, 3.0, -34);
      camera.lookAt(lookTarget.current);
    } else if (cameraMode === 'topDown') {
      targetPos.current.set(0, 85, -30);
      camera.position.lerp(targetPos.current, 0.06);
      camera.lookAt(0, 0, -30);
    } else if (cameraMode === 'cinematic') {
      const time = state.clock.getElapsedTime() * 0.25;
      const radius = 42;
      const camX = tx + Math.cos(time) * radius;
      const camY = ty + 16 + Math.sin(time * 0.8) * 3;
      const camZ = tz + Math.sin(time) * radius;

      targetPos.current.set(camX, camY, camZ);
      lookTarget.current.set(tx * 0.4 + 2, ty + 4, tz * 0.4 - 15);

      camera.position.lerp(targetPos.current, 0.05);
      camera.lookAt(lookTarget.current);
    }
  });

  return null;
};

export const Scene3D: React.FC<Scene3DProps> = ({
  params,
  telemetry,
  onUpdatePhysics,
  onSelectCamera,
  onSelectTimeOfDay,
}) => {
  const [showTacticalGrid, setShowTacticalGrid] = useState<boolean>(true);
  const [showHazardZones, setShowHazardZones] = useState<boolean>(true);
  const isGirtingCritical = telemetry.girtingStatus === 'CRITICAL';
  const isSuctionCritical = telemetry.suctionStatus === 'CRITICAL';
  const inWashZone = telemetry.inWashZone;

  return (
    <div className="relative w-full h-full bg-sky-950 overflow-hidden select-none">
      {/* 3D R3F Canvas */}
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        className="w-full h-full"
      >
        <PerspectiveCamera makeDefault position={[36, 24, -60]} fov={45} />
        
        {params.cameraMode === 'orbit' && (
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            maxPolarAngle={Math.PI / 2 - 0.03}
            minDistance={8}
            maxDistance={240}
            target={[5, 4, -32]}
          />
        )}

        <CameraController
          cameraMode={params.cameraMode}
          tugPosition={telemetry.tugPosition}
          tugRotation={telemetry.tugRotation}
          onUpdatePhysics={onUpdatePhysics}
        />

        {/* Realistic Harbor & Ocean Environment */}
        <HarborEnvironment showTacticalGrid={showTacticalGrid} timeOfDay={params.timeOfDay} />

        {/* 66,000 DWT Container Ship */}
        <LargeShip
          position={telemetry.shipPosition}
          shipSpeedKnots={params.shipSpeed}
          timeOfDay={params.timeOfDay}
        />

        {/* ASD Escort Tugboat */}
        <Tugboat
          position={telemetry.tugPosition}
          rotation={telemetry.tugRotation}
          isGirtingCritical={isGirtingCritical}
          isInWashTurbulence={inWashZone}
          timeOfDay={params.timeOfDay}
        />

        {/* Dynamic Towing Line */}
        <TowingLine
          start={telemetry.lineStartPoint}
          end={telemetry.lineEndPoint}
          tensionKn={telemetry.lineTensionKn}
          girtingStatus={telemetry.girtingStatus}
          quickReleaseActive={params.quickReleaseActive}
        />

        {/* Vision AI Camera Field-of-View Frustum */}
        <CameraFrustum
          tugPosition={telemetry.tugPosition}
          tugRotation={telemetry.tugRotation}
          hullDistanceM={telemetry.hullDistanceM}
          suctionRiskPct={telemetry.suctionRiskPct}
        />

        {/* Propeller Wash Particle Stream */}
        <PropellerWash
          shipSpeedKnots={params.shipSpeed}
          propellerRpm={params.propellerRpm}
        />

        {/* Dynamic Ship Wake Foam Trails */}
        <ShipWake
          shipSpeed={params.shipSpeed}
          tugPosition={telemetry.tugPosition}
          shipPosition={telemetry.shipPosition}
        />

        {/* Real-World Safety Hazard Zones & Radii (Prop Wash Cone, Suction Limit, Girting Arc) */}
        <HazardZones
          enabled={showHazardZones}
          inWashZone={inWashZone}
          hullDistanceM={telemetry.hullDistanceM}
          lineAngleDeg={telemetry.lineAngleDeg}
          tugPosition={telemetry.tugPosition}
          shipSpeed={params.shipSpeed}
          propellerRpm={params.propellerRpm}
        />
      </Canvas>

      {/* Screen Edge Red Pulse Vignette for Suction Hazard */}
      {isSuctionCritical && (
        <div className="absolute inset-0 pointer-events-none z-20 border-[10px] border-cyber-red/80 animate-pulse bg-cyber-red/15 shadow-[inset_0_0_100px_rgba(255,23,68,0.85)]" />
      )}

      {/* Top Left Viewport Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-2 bg-marine-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-cyan-400/40 text-xs font-mono shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-cyan-300 font-bold tracking-wider">실시간 3D 디지털 트윈 관제</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-200">66,000톤급 컨테이너선 & ASD 호위 예인선</span>
        </div>
        <div className="bg-marine-950/80 backdrop-blur-sm px-3 py-1 rounded-md text-[11px] font-mono text-slate-300 border border-slate-700/80 flex gap-3 shadow">
          <span>예인선 위치 [X: {telemetry.tugPosition[0].toFixed(1)}m, Z: {telemetry.tugPosition[2].toFixed(1)}m]</span>
          <span>IMU 롤(Roll): {telemetry.imuRollDeg > 0 ? `+${telemetry.imuRollDeg}°` : `${telemetry.imuRollDeg}°`}</span>
        </div>
      </div>

      {/* Top Right Viewport: Time-of-Day, Camera Controls & Ocean Grid Toggle */}
      <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-2 bg-marine-900/90 backdrop-blur-md p-1.5 rounded-lg border border-slate-700 shadow-lg max-w-[90vw]">
        {/* Time of Day Lighting Mode Switcher */}
        <div className="flex items-center gap-1 border-r border-slate-700/80 pr-2">
          {(
            [
              { id: 'day', label: '주간', icon: Sun, color: 'text-amber-300' },
              { id: 'sunset', label: '황혼', icon: Sunset, color: 'text-orange-400' },
              { id: 'night', label: '야간', icon: Moon, color: 'text-cyan-300' },
            ] as { id: TimeOfDay; label: string; icon: React.FC<{ size?: number; className?: string }>; color: string }[]
          ).map((tod) => {
            const Icon = tod.icon;
            const isSelected = params.timeOfDay === tod.id;
            return (
              <button
                key={tod.id}
                onClick={() => onSelectTimeOfDay(tod.id)}
                className={`px-2 py-1 text-xs font-mono rounded flex items-center gap-1 transition-all border ${
                  isSelected
                    ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/60 font-bold shadow'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
                }`}
                title={`${tod.label} 환경 조명 전환`}
              >
                <Icon size={12} className={isSelected ? tod.color : 'text-slate-400'} />
                <span>{tod.label}</span>
              </button>
            );
          })}
        </div>

        {/* Ocean Grid Overlay Toggle */}
        <button
          onClick={() => setShowTacticalGrid(!showTacticalGrid)}
          className={`px-2.5 py-1 text-xs font-mono rounded flex items-center gap-1 transition-all border ${
            showTacticalGrid
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 font-semibold'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="바다 전술 격자선 켜기/끄기"
        >
          {showTacticalGrid ? <GridIcon size={12} /> : <Waves size={12} />}
          <span>{showTacticalGrid ? '전술 격자' : '자연 바다'}</span>
        </button>

        {/* Hazard Radius / Danger Zones Toggle */}
        <button
          onClick={() => setShowHazardZones(!showHazardZones)}
          className={`px-2.5 py-1 text-xs font-mono rounded flex items-center gap-1 transition-all border ${
            showHazardZones
              ? 'bg-amber-500/25 text-amber-300 border-amber-400/60 font-semibold'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="후류 및 흡인력 위험 반경 표시 켜기/끄기"
        >
          <Crosshair size={12} className={showHazardZones ? 'text-amber-400' : 'text-slate-400'} />
          <span>{showHazardZones ? '위험 반경 ON' : '위험 반경 OFF'}</span>
        </button>

        <span className="text-slate-600">|</span>

        {/* Camera Angles */}
        <span className="text-[11px] font-mono text-slate-300 px-1 flex items-center gap-1">
          <Camera size={13} className="text-cyan-400" /> 시점:
        </span>
        {(
          [
            { id: 'orbit', label: '자유 궤도' },
            { id: 'tugChase', label: '예인선 추적' },
            { id: 'bridgeView', label: '선교 내부' },
            { id: 'topDown', label: '상공 부감' },
            { id: 'cinematic', label: '시네마틱' },
          ] as { id: CameraMode; label: string }[]
        ).map((cam) => (
          <button
            key={cam.id}
            onClick={() => onSelectCamera(cam.id)}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${
              params.cameraMode === cam.id
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/70 font-bold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            {cam.label}
          </button>
        ))}
      </div>

      {/* HUD Active Alerts Banner Overlay */}
      {/* 1. Girting Critical Alert */}
      {isGirtingCritical && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 pointer-events-none">
          <div className="flex items-center gap-3 px-6 py-2.5 bg-red-600/95 text-white font-mono text-sm md:text-base font-black tracking-widest rounded-lg border-2 border-white shadow-[0_0_40px_rgba(255,23,68,0.95)] animate-pulse">
            <ShieldAlert size={22} className="animate-bounce" />
            <span>위험: 비상 예인줄 분리(퀵 릴리즈) 활성화</span>
            <span className="text-xs bg-white text-red-600 px-2 py-0.5 rounded font-black">
              전복 한계율 &ge; 85%
            </span>
          </div>
          <div className="text-[11px] font-mono text-red-200 bg-black/85 px-3 py-0.5 rounded border border-red-500/50 shadow">
            횡방향 예인 장력이 전복 한계를 초과함 &bull; 자동 비상 분리 시스템 대기
          </div>
        </div>
      )}

      {/* 2. Propeller Wash Ingress HUD Notification */}
      {inWashZone && (
        <div className="absolute bottom-16 left-6 z-20 flex items-center gap-2.5 bg-marine-900/95 border border-amber-500/70 text-amber-300 px-4 py-2.5 rounded-lg font-mono text-xs md:text-sm shadow-xl backdrop-blur-md">
          <Wind size={18} className="animate-spin text-amber-400" />
          <div>
            <div className="font-bold tracking-wide text-amber-300">
              프로펠러 후류 난류 유입: {telemetry.washTurbulencePct}% 난류 발생
            </div>
            <div className="text-[11px] text-amber-200/90">
              선미 캐비테이션 와류 구역 진입 &bull; 타효 상실(조타 불가) 및 격렬한 진동
            </div>
          </div>
        </div>
      )}

      {/* 3. Suction Hazard Near-Miss HUD Notification */}
      {isSuctionCritical && (
        <div className="absolute bottom-16 right-6 z-20 flex items-center gap-2.5 bg-marine-900/95 border border-red-500/70 text-red-300 px-4 py-2.5 rounded-lg font-mono text-xs md:text-sm shadow-xl backdrop-blur-md">
          <AlertTriangle size={18} className="animate-bounce text-red-400" />
          <div>
            <div className="font-bold tracking-wide text-red-300">
              유체 흡인력 충돌 경보: 선체 거리 {telemetry.hullDistanceM.toFixed(1)}m
            </div>
            <div className="text-[11px] text-red-200/90">
              베르누이 흡인력: {telemetry.suctionForceKn} kN &bull; 선미/현측 충돌 임박
            </div>
          </div>
        </div>
      )}

      {/* Bottom Center 3D Compass & Scale */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 text-[11px] font-mono text-slate-300 bg-marine-950/85 px-4 py-1.5 rounded-full border border-slate-700 shadow-md">
        <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
          <Zap size={12} className="text-cyan-400" /> 센서 퓨전 엔진 가동 중
        </span>
        <span className="text-slate-600">|</span>
        <span>예인줄 각도: {telemetry.lineAngleDeg}°</span>
        <span className="text-slate-600">|</span>
        <span>인장 하중: {telemetry.lineTensionKn} kN</span>
      </div>
    </div>
  );
};
