import React from 'react';
import { Sky } from '@react-three/drei';
import { OceanWater } from './OceanWater';
import { TimeOfDay } from '../types/maritime';

interface HarborEnvironmentProps {
  showTacticalGrid?: boolean;
  timeOfDay?: TimeOfDay;
}

export const HarborEnvironment: React.FC<HarborEnvironmentProps> = ({
  showTacticalGrid = true,
  timeOfDay = 'day',
}) => {
  // Environmental atmospheric configurations per time-of-day
  const isNight = timeOfDay === 'night';
  const isSunset = timeOfDay === 'sunset';

  const skyProps = isSunset
    ? {
        sunPosition: [140, 6, 85] as [number, number, number],
        inclination: 0.49,
        azimuth: 0.28,
        turbidity: 7.5,
        rayleigh: 3.8,
        mieCoefficient: 0.009,
        mieDirectionalG: 0.88,
      }
    : isNight
    ? {
        sunPosition: [-40, -60, -30] as [number, number, number],
        inclination: 0.85,
        azimuth: 0.75,
        turbidity: 12,
        rayleigh: 0.3,
        mieCoefficient: 0.015,
        mieDirectionalG: 0.6,
      }
    : {
        sunPosition: [120, 55, 90] as [number, number, number],
        inclination: 0.55,
        azimuth: 0.25,
        turbidity: 4,
        rayleigh: 1.2,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.82,
      };

  const fogColor = isSunset ? '#9a3412' : isNight ? '#020617' : '#8ec5e6';
  const fogNear = isSunset ? 40 : isNight ? 25 : 50;
  const fogFar = isSunset ? 280 : isNight ? 200 : 320;

  return (
    <group>
      {/* 1. Dynamic Maritime Sky with Sun/Moon Azimuth */}
      <Sky
        distance={450000}
        sunPosition={skyProps.sunPosition}
        inclination={skyProps.inclination}
        azimuth={skyProps.azimuth}
        turbidity={skyProps.turbidity}
        rayleigh={skyProps.rayleigh}
        mieCoefficient={skyProps.mieCoefficient}
        mieDirectionalG={skyProps.mieDirectionalG}
      />

      {/* Atmospheric Horizon Light Scattering Fog */}
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />

      {/* 2. Realistic Ocean Water Surface with Gerstner Waves & Specular Shader */}
      <OceanWater showTacticalGrid={showTacticalGrid} timeOfDay={timeOfDay} />

      {/* 3. Time-of-Day Lighting Rig */}
      {isSunset && (
        <>
          {/* Warm Golden Hour Low-Angle Key Light */}
          <directionalLight
            position={[130, 25, 75]}
            intensity={2.8}
            color="#fb923c"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0004}
          />
          {/* Twilight Purple/Indigo Rim Fill */}
          <directionalLight position={[-80, 50, -60]} intensity={0.9} color="#a855f7" />
          {/* Burning Amber Sea Bounce */}
          <directionalLight position={[0, -20, 0]} intensity={0.6} color="#ea580c" />
          {/* Atmospheric Ambient */}
          <ambientLight intensity={0.55} color="#fdba74" />
        </>
      )}

      {isNight && (
        <>
          {/* Cold Moonlight Directional */}
          <directionalLight
            position={[-40, 80, -35]}
            intensity={0.7}
            color="#93c5fd"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0004}
          />
          {/* Deep Cyan Night Horizon Fill */}
          <directionalLight position={[50, 20, 50]} intensity={0.3} color="#0284c7" />
          {/* Dim Ambient Night Fill */}
          <ambientLight intensity={0.25} color="#0f172a" />
        </>
      )}

      {!isSunset && !isNight && (
        <>
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
          {/* Sky Blue Fill Light */}
          <directionalLight position={[-60, 45, -50]} intensity={0.9} color="#bae6fd" />
          {/* Under-deck Sea Bounce Light */}
          <directionalLight position={[0, -20, 0]} intensity={0.4} color="#38bdf8" />
          {/* Ambient Hemispheric Fill */}
          <ambientLight intensity={0.75} color="#e0f2fe" />
        </>
      )}

      {/* 4. Realistic Navigational Channel Buoys with Pulsing Navigation Lanterns */}
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
              emissiveIntensity={isNight ? 4.5 : 2.5}
            />
          </mesh>
          <pointLight
            position={[0, 3.4, 0]}
            color={i === 0 ? '#ef4444' : '#22c55e'}
            intensity={isNight ? 4.0 : 2.0}
            distance={isNight ? 45 : 25}
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
              emissiveIntensity={isNight ? 3.5 : 2}
            />
          </mesh>
          {isNight && (
            <pointLight
              position={[0, 2.3, 0]}
              color={i === 0 ? '#ef4444' : '#22c55e'}
              intensity={2.5}
              distance={30}
            />
          )}
        </group>
      ))}
    </group>
  );
};
