import React from 'react';
import { Sky } from '@react-three/drei';
import { OceanWater } from './OceanWater';

interface HarborEnvironmentProps {
  showTacticalGrid?: boolean;
}

export const HarborEnvironment: React.FC<HarborEnvironmentProps> = ({ showTacticalGrid = true }) => {
  return (
    <group>
      {/* 1. Realistic Maritime Daylight Sky with Sun Position */}
      <Sky
        distance={450000}
        sunPosition={[120, 55, 90]}
        inclination={0.55}
        azimuth={0.25}
        turbidity={4}
        rayleigh={1.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.82}
      />

      {/* Atmospheric Horizon Light Scattering Fog */}
      <fog attach="fog" args={['#8ec5e6', 50, 320]} />

      {/* 2. Realistic Ocean Water Surface with Gerstner Waves & Sun Specular */}
      <OceanWater showTacticalGrid={showTacticalGrid} />

      {/* 3. High-Quality Daylight Lighting Setup */}
      {/* Primary Key Sunlight */}
      <directionalLight
        position={[80, 100, 70]}
        intensity={2.2}
        color="#fffbeb"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.0004}
      />

      {/* Sky Blue Fill Light (Brightens vessel sides & shadows) */}
      <directionalLight
        position={[-60, 45, -50]}
        intensity={0.9}
        color="#bae6fd"
      />

      {/* Under-deck Sea Bounce Light (Simulates realistic sea water upward reflection) */}
      <directionalLight
        position={[0, -20, 0]}
        intensity={0.4}
        color="#38bdf8"
      />

      {/* Ambient Hemispheric Fill */}
      <ambientLight intensity={0.75} color="#e0f2fe" />

      {/* 4. Realistic Navigational Channel Buoys (Port & Starboard) */}
      {[-38, 38].map((x, i) => (
        <group key={i} position={[x, 0.2, -35]}>
          {/* Buoy Hull (Red/Green Maritime Standard) */}
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.9, 1.3, 2.4, 16]} />
            <meshStandardMaterial
              color={i === 0 ? '#dc2626' : '#16a34a'}
              metalness={0.3}
              roughness={0.4}
            />
          </mesh>
          {/* Daymark Top Shape (Pillar / Can) */}
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 1.0, 12]} />
            <meshStandardMaterial color={i === 0 ? '#dc2626' : '#16a34a'} />
          </mesh>
          {/* Flashing Navigation Lantern */}
          <mesh position={[0, 3.2, 0]}>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial
              color={i === 0 ? '#ef4444' : '#22c55e'}
              emissive={i === 0 ? '#ef4444' : '#22c55e'}
              emissiveIntensity={2.5}
            />
          </mesh>
          <pointLight
            position={[0, 3.4, 0]}
            color={i === 0 ? '#ef4444' : '#22c55e'}
            intensity={2.0}
            distance={25}
          />
        </group>
      ))}

      {/* Additional Distant Harbor Fairway Buoys */}
      {[-48, 48].map((x, i) => (
        <group key={`fairway-${i}`} position={[x, 0.2, 25]}>
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.8, 1.2, 2.0, 12]} />
            <meshStandardMaterial color={i === 0 ? '#dc2626' : '#16a34a'} />
          </mesh>
          <mesh position={[0, 2.2, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial
              color={i === 0 ? '#ef4444' : '#22c55e'}
              emissive={i === 0 ? '#ef4444' : '#22c55e'}
              emissiveIntensity={2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};
