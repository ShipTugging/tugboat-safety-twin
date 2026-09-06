import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PropellerWashProps {
  shipSpeedKnots: number;
  propellerRpm: number;
}

const PARTICLE_COUNT = 950;

export const PropellerWash: React.FC<PropellerWashProps> = ({
  shipSpeedKnots,
  propellerRpm,
}) => {
  const pointsRef = useRef<THREE.Points>(null);

  // Initial particle attributes
  const { positions, velocities, lifetimes, colors } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    const life = new Float32Array(PARTICLE_COUNT);
    const cols = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Spawn at propeller nozzle (Z = -36)
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.4;

      pos[i * 3 + 0] = Math.cos(angle) * r;
      pos[i * 3 + 1] = -1.8 + Math.sin(angle) * r * 0.7;
      pos[i * 3 + 2] = -36 - Math.random() * 45; // Distribute along wake

      // Velocity: backward along -Z, outward radially
      vel[i * 3 + 0] = (Math.cos(angle) * 0.4 + (Math.random() - 0.5) * 0.5);
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      vel[i * 3 + 2] = -(0.5 + Math.random() * 1.5); // backward speed

      life[i] = Math.random(); // 0 to 1 lifetime progression

      // Cyan / White cavitation bubbles
      const isCore = Math.random() > 0.4;
      cols[i * 3 + 0] = isCore ? 0.9 : 0.0;
      cols[i * 3 + 1] = 0.95;
      cols[i * 3 + 2] = 1.0;
    }

    return {
      positions: pos,
      velocities: vel,
      lifetimes: life,
      colors: cols,
    };
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const geom = pointsRef.current.geometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;

    const speedScale = (propellerRpm / 60) * 1.5 + (shipSpeedKnots * 0.4) + 0.5;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      lifetimes[i] += delta * (0.35 * speedScale);
      
      // Update Z position (moving backwards)
      posArray[i * 3 + 2] -= delta * 18 * speedScale;
      
      // Swirl rotation around Z axis
      const x = posArray[i * 3 + 0];
      const y = posArray[i * 3 + 1] + 1.8;
      const swirlAngle = delta * 4.5 * (propellerRpm / 100);
      const cosA = Math.cos(swirlAngle);
      const sinA = Math.sin(swirlAngle);
      posArray[i * 3 + 0] = x * cosA - y * sinA;
      posArray[i * 3 + 1] = (x * sinA + y * cosA) - 1.8;

      // Radial expansion as wake diffuses
      posArray[i * 3 + 0] *= 1 + delta * 0.25;

      // Respawn particle if it travels too far back or expires
      if (posArray[i * 3 + 2] < -88 || lifetimes[i] > 1.0) {
        lifetimes[i] = 0;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.4;
        posArray[i * 3 + 0] = Math.cos(angle) * r;
        posArray[i * 3 + 1] = -1.8 + Math.sin(angle) * r * 0.7;
        posArray[i * 3 + 2] = -36 - Math.random() * 2;
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <group>
      {/* 1. Propeller Wash Particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={PARTICLE_COUNT}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={PARTICLE_COUNT}
            array={colors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.65}
          vertexColors
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* 2. Visual Wash Hazard Cone Guide Rings */}
      {[-45, -60, -75].map((z, i) => {
        const radius = 3.5 + (i + 1) * 2.6;
        return (
          <group key={i} position={[0, -0.6, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[radius - 0.15, radius, 32]} />
              <meshBasicMaterial
                color="#00f0ff"
                transparent
                opacity={0.25 - i * 0.05}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      {/* Subsurface Wash Glow */}
      <pointLight position={[0, -1.2, -45]} color="#00e5ff" intensity={2.0} distance={28} />
    </group>
  );
};
