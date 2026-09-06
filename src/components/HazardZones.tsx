import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

interface HazardZonesProps {
  enabled: boolean;
  inWashZone: boolean;
  hullDistanceM: number;
  lineAngleDeg: number;
  tugPosition: [number, number, number];
  shipSpeed: number;
  propellerRpm: number;
}

export const HazardZones: React.FC<HazardZonesProps> = ({
  enabled,
  inWashZone,
  hullDistanceM,
  lineAngleDeg,
  tugPosition,
}) => {
  const pulseRef = useRef<number>(0);
  const fenceMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    pulseRef.current += delta * 4.0;
    if (fenceMatRef.current) {
      fenceMatRef.current.opacity = 0.35 + Math.sin(pulseRef.current) * 0.2;
    }
  });

  if (!enabled) return null;

  const isSuctionCritical = hullDistanceM <= 5.0;
  const isGirtingCritical = lineAngleDeg >= 60;
  const washColor = inWashZone ? '#ff1744' : '#f59e0b';

  return (
    <group renderOrder={999}>
      {/* ================================================================= */}
      {/* 1. PROPELLER WASH HAZARD ZONE: VERTICAL LASER CONE & RINGS        */}
      {/* ================================================================= */}
      <group position={[0, 0, -36]}>
        {/* Floating Elevated Hazard Ground Grid */}
        <mesh position={[0, 1.2, -28]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[30, 56]} />
          <meshBasicMaterial
            color={washColor}
            transparent
            opacity={inWashZone ? 0.35 : 0.15}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Vertical Holographic Perimeter Walls (H=4m, Y=2.5m) */}
        {[-1, 1].map((side, i) => (
          <mesh
            key={`wash-wall-${i}`}
            position={[side * 7.5, 2.5, -28]}
            rotation={[0, side * 0.18, 0]}
          >
            <planeGeometry args={[56, 5.0]} />
            <meshBasicMaterial
              color={washColor}
              transparent
              opacity={inWashZone ? 0.45 : 0.2}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* 3 Heavy Floating Volumetric Torus Rings with High Floating Text */}
        {[
          { dist: 15, radius: 6.8, label: '15m 후류 코어 (치명적 난류/타효 상실)', color: '#ef4444', pulse: true, textH: 20.0 },
          { dist: 30, radius: 10.5, label: '30m 중등도 난류 구역 (조타 불안정)', color: '#f59e0b', pulse: false, textH: 24.0 },
          { dist: 45, radius: 14.2, label: '45m 후류 경계선 (안전 이격 거리)', color: '#06b6d4', pulse: false, textH: 28.0 },
        ].map((ring, idx) => (
          <group key={idx} position={[0, 1.6, -ring.dist]}>
            {/* Thick 3D Torus Pipe */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[ring.radius, 0.32, 12, 48]} />
              <meshStandardMaterial
                color={ring.color}
                emissive={ring.color}
                emissiveIntensity={inWashZone && ring.pulse ? 3.5 : 1.8}
                roughness={0.2}
              />
            </mesh>

            {/* Pulsing Beacon Light */}
            <pointLight
              position={[0, 1.0, 0]}
              color={ring.color}
              intensity={ring.pulse ? 3.0 : 1.5}
              distance={25}
            />

            {/* Marker Pylons */}
            {[-ring.radius, ring.radius].map((x, xi) => (
              <group key={xi} position={[x, 0, 0]}>
                <mesh position={[0, 2.5, 0]}>
                  <cylinderGeometry args={[0.2, 0.3, 5.0, 8]} />
                  <meshStandardMaterial color={ring.color} emissive={ring.color} emissiveIntensity={1.5} />
                </mesh>
                <mesh position={[0, 5.2, 0]}>
                  <sphereGeometry args={[0.45, 12, 12]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            ))}

            {/* Vertical Guide Laser Line reaching high up to floating text */}
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={2}
                  array={new Float32Array([0, 0, 0, 0, ring.textH, 0])}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color={ring.color} transparent opacity={0.65} />
            </line>

            {/* High-Altitude Floating Billboard Label (Never blocked by ships!) */}
            <Billboard position={[0, ring.textH, 0]}>
              <Text
                fontSize={2.3}
                color={ring.color}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.25}
                outlineColor="#000000"
                fontWeight="bold"
                renderOrder={9999}
                material-depthTest={false}
              >
                {`[ ${ring.label} ]`}
              </Text>
            </Billboard>
          </group>
        ))}

        {/* High Altitude Floating Overhead Banner (Elevated to Y=32m, always clear above everything!) */}
        <Billboard position={[0, 32.0, -20]}>
          <Text
            fontSize={3.2}
            color={inWashZone ? '#ff1744' : '#fbbf24'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.32}
            outlineColor="#000000"
            fontWeight="bold"
            renderOrder={9999}
            material-depthTest={false}
          >
            {inWashZone
              ? '⚠ [경고] 프로펠러 후류 구역 진입: 100% 난류 발생!'
              : '▼ 프로펠러 후류 난류 위험 구역 (PROPELLER WASH CONE)'}
          </Text>
        </Billboard>
      </group>

      {/* ================================================================= */}
      {/* 2. SUCTION DANGER ZONE: VERTICAL LASER FENCE (5m & 9m LIMITS)     */}
      {/* ================================================================= */}
      <group position={[7.1, 0, 0]}>
        {/* 5m Critical Suction Vertical Laser Wall */}
        <group position={[5.0, 2.75, 0]}>
          <mesh>
            <boxGeometry args={[0.15, 5.5, 68]} />
            <meshBasicMaterial
              color="#ef4444"
              transparent
              opacity={isSuctionCritical ? 0.65 : 0.35}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 2.75, 0]}>
            <boxGeometry args={[0.3, 0.25, 68]} />
            <meshStandardMaterial color="#ff1744" emissive="#ff1744" emissiveIntensity={3.0} />
          </mesh>
          <mesh position={[0, -1.2, 0]}>
            <boxGeometry args={[0.3, 0.25, 68]} />
            <meshStandardMaterial color="#ff1744" emissive="#ff1744" emissiveIntensity={2.0} />
          </mesh>

          {/* Vertical Guide Line up to floating text */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([0, 2.5, 10, 0, 24.0, 10])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ff1744" transparent opacity={0.7} />
          </line>

          {/* 3D Billboard Floating Sign at 5m (Elevated to Y=24m, far above all containers!) */}
          <Billboard position={[0, 24.0, 10]}>
            <Text
              fontSize={2.5}
              color="#ff1744"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.25}
              outlineColor="#000000"
              fontWeight="bold"
              renderOrder={9999}
              material-depthTest={false}
            >
              {'◀ 5m 충돌 한계선: 베르누이 흡인력 위험 구역 (CRITICAL SUCTION)'}
            </Text>
          </Billboard>
        </group>

        {/* 9m Caution Buffer Laser Fence */}
        <group position={[9.0, 2.0, 0]}>
          <mesh>
            <boxGeometry args={[0.1, 4.0, 68]} />
            <meshBasicMaterial
              color="#f59e0b"
              transparent
              opacity={0.2}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 2.0, 0]}>
            <boxGeometry args={[0.2, 0.15, 68]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.8} />
          </mesh>

          {/* Vertical Guide Line up to floating text */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([0, 2.0, -6, 0, 20.0, -6])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#f59e0b" transparent opacity={0.6} />
          </line>

          {/* 3D Billboard Floating Sign at 9m (Elevated to Y=20m) */}
          <Billboard position={[0, 20.0, -6]}>
            <Text
              fontSize={2.2}
              color="#f59e0b"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.22}
              outlineColor="#000000"
              fontWeight="bold"
              renderOrder={9999}
              material-depthTest={false}
            >
              {'◀ 9m 안전 이격 한계선 (SAFE APPROACH DISTANCE)'}
            </Text>
          </Billboard>
        </group>
      </group>

      {/* ================================================================= */}
      {/* 3. TUGBOAT HEELING SECTOR & REAL-TIME PROXIMITY LASER BEAM        */}
      {/* ================================================================= */}
      <group position={[tugPosition[0], 1.8, tugPosition[2]]}>
        {/* Safety Horizon Ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[6.8, 0.18, 8, 36]} />
          <meshStandardMaterial
            color={isGirtingCritical ? '#ff1744' : '#00f0ff'}
            emissive={isGirtingCritical ? '#ff1744' : '#00f0ff'}
            emissiveIntensity={isGirtingCritical ? 3.0 : 1.5}
          />
        </mesh>

        {/* Left & Right Heeling Danger Fans */}
        {[-1, 1].map((dir, i) => (
          <group key={i} rotation={[0, dir > 0 ? 0 : Math.PI, 0]}>
            <mesh position={[4.5, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[4.2, 6.8, 16, 1, Math.PI * 0.15, Math.PI * 0.35]} />
              <meshBasicMaterial
                color="#ff1744"
                transparent
                opacity={isGirtingCritical ? 0.6 : 0.25}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        ))}

        {/* Intense Neon Proximity Laser Beam to Ship Hull */}
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([
                0, 0.5, 0,
                7.1 - tugPosition[0], 0.5, 0
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={isSuctionCritical ? '#ff1744' : '#00f0ff'}
            linewidth={3}
          />
        </line>

        {/* Vertical Guide Line up to Tug Floating Text */}
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([
                (7.1 - tugPosition[0]) / 2, 0.5, 0,
                (7.1 - tugPosition[0]) / 2, 14.0, 0
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={isSuctionCritical ? '#ff1744' : '#00f0ff'} transparent opacity={0.65} />
        </line>

        {/* Live Distance Floating Billboard Tag (Elevated to Y=14m, high in sky above tug!) */}
        <Billboard position={[(7.1 - tugPosition[0]) / 2, 14.0, 0]}>
          <Text
            fontSize={2.3}
            color={isSuctionCritical ? '#ff1744' : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.24}
            outlineColor="#000000"
            fontWeight="bold"
            renderOrder={9999}
            material-depthTest={false}
          >
            {`선체 간격: ${hullDistanceM.toFixed(1)}m ${isSuctionCritical ? '⚠ 충돌 위험!' : ''}`}
          </Text>
        </Billboard>
      </group>
    </group>
  );
};
