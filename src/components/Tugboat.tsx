import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { TimeOfDay } from '../types/maritime';

interface TugboatProps {
  position: [number, number, number];
  rotation: [number, number, number]; // [pitch, yaw, roll]
  isGirtingCritical: boolean;
  isInWashTurbulence: boolean;
  timeOfDay?: TimeOfDay;
}

export const Tugboat: React.FC<TugboatProps> = ({
  position,
  rotation,
  isGirtingCritical,
  isInWashTurbulence,
  timeOfDay = 'day',
}) => {
  const isNight = timeOfDay === 'night';
  const radarRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (radarRef.current) {
      radarRef.current.rotation.y += delta * 6;
    }
  });

  // Procedural Curved Tugboat Hull (Spoon Bow & Tapered Stern)
  const { tugHullGeom, tugUnderGeom } = useMemo(() => {
    const shape = new THREE.Shape();
    
    // Rounded spoon bow tip
    shape.moveTo(0, 5.8);
    // Smooth elliptical curve around forward shoulder
    shape.bezierCurveTo(1.8, 5.8, 2.7, 4.8, 2.85, 3.2);
    // Midbody beam
    shape.lineTo(2.85, -1.0);
    // Tapering to rounded transom
    shape.bezierCurveTo(2.85, -3.2, 2.4, -4.8, 1.4, -5.4);
    shape.lineTo(0, -5.6);
    
    // Port side (mirror)
    shape.lineTo(-1.4, -5.4);
    shape.bezierCurveTo(-2.4, -4.8, -2.85, -3.2, -2.85, -1.0);
    shape.lineTo(-2.85, 3.2);
    shape.bezierCurveTo(-2.7, 4.8, -1.8, 5.8, 0, 5.8);

    const extrudeSettings = {
      steps: 1,
      depth: 1.6,
      bevelEnabled: true,
      bevelThickness: 0.4,
      bevelSize: 0.35,
      bevelSegments: 4,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.rotateX(Math.PI / 2);
    geom.translate(0, 1.2, 0);

    // Underwater curved hull
    const underSettings = {
      steps: 1,
      depth: 1.2,
      bevelEnabled: true,
      bevelThickness: 0.6,
      bevelSize: 0.45,
      bevelSegments: 4,
    };
    const underGeom = new THREE.ExtrudeGeometry(shape, underSettings);
    underGeom.rotateX(Math.PI / 2);
    underGeom.translate(0, -0.2, 0);

    return { tugHullGeom: geom, tugUnderGeom: underGeom };
  }, []);

  return (
    <group
      position={position}
      rotation={rotation}
    >
      {/* ================================================================= */}
      {/* 1. CURVED ASD ESCORT HULL & WRAP-AROUND RUBBER FENDERING         */}
      {/* ================================================================= */}

      {/* Underwater Curved Bilge (Red Antifouling) */}
      <mesh geometry={tugUnderGeom} castShadow receiveShadow>
        <meshStandardMaterial color="#881337" roughness={0.7} />
      </mesh>

      {/* Freeboard Curved Steel Hull (Deep Industrial Charcoal Navy) */}
      <mesh geometry={tugHullGeom} castShadow receiveShadow>
        <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.4} />
      </mesh>

      {/* Curved Heavy Rubber Pushover Bow Fender (Horseshoe wrap) */}
      <group position={[0, 0.9, 4.8]}>
        <mesh rotation={[0, 0, 0]} castShadow>
          <torusGeometry args={[2.4, 0.55, 12, 24, Math.PI]} />
          <meshStandardMaterial color="#020617" roughness={0.95} />
        </mesh>
      </group>

      {/* Port & Starboard D-Section Rubber Gunwale Strakes */}
      {[-2.85, 2.85].map((x, i) => (
        <mesh key={i} position={[x, 0.85, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 8.8, 12]} />
          <meshStandardMaterial color="#020617" roughness={0.98} />
        </mesh>
      ))}

      {/* Curved Working Deck: Non-skid Green Floor */}
      <mesh position={[0, 1.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.8, 9.8]} />
        <meshStandardMaterial color="#14532d" roughness={0.8} />
      </mesh>

      {/* ================================================================= */}
      {/* 2. FORWARD ESCORT TOWING WINCH & STAPLE (H-BITT)                  */}
      {/* ================================================================= */}
      <group position={[0, 1.65, 3.2]}>
        {/* Twin Heavy Escort Staple Posts (Cast steel H-bitt) */}
        {[-0.85, 0.85].map((x, i) => (
          <mesh key={i} position={[x, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.26, 1.4, 16]} />
            <meshStandardMaterial color="#eab308" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
        {/* Crossbar */}
        <mesh position={[0, 1.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 2.1, 16]} />
          <meshStandardMaterial color="#eab308" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* High-Capacity Escort Winch Drum with Coiled Towline */}
        <group position={[0, 0.45, -1.2]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.6, 0.6, 1.8, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.52, 0.52, 1.5, 16]} />
            <meshStandardMaterial color="#ea580c" roughness={0.9} />
          </mesh>
        </group>
      </group>

      {/* ================================================================= */}
      {/* 3. AERODYNAMIC ROUNDED WHEELHOUSE & RADAR MAST                    */}
      {/* ================================================================= */}
      <group position={[0, 2.3, -0.6]}>
        {/* Safety Day-Glow Orange Lower Deckhouse (Chamfered/Curved) */}
        <mesh position={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[2.0, 2.3, 1.6, 8]} />
          <meshStandardMaterial color="#ea580c" roughness={0.35} metalness={0.15} />
        </mesh>

        {/* Elevated 360° Faceted Wheelhouse (Inverted Slanted Windows) */}
        <group position={[0, 1.4, 0.2]}>
          <mesh castShadow>
            <cylinderGeometry args={[1.7, 1.5, 1.3, 12]} />
            <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.8} />
          </mesh>

          {/* Panoramic Blue-Tinted Anti-Glare Glass Canopy */}
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[1.75, 1.55, 0.85, 12]} />
            <meshStandardMaterial
              color="#0284c7"
              roughness={0.05}
              metalness={0.95}
              transparent
              opacity={0.8}
            />
          </mesh>

          {/* Cockpit Interior Console Glow */}
          <pointLight position={[0, -0.1, 0]} color="#00f0ff" intensity={0.8} distance={2.5} />
        </group>

        {/* FiFi 1 Water Monitors (Twin Firefighting Cannons on Roof) */}
        {[-0.8, 0.8].map((x, i) => (
          <group key={`fifi-${i}`} position={[x, 2.2, 1.1]}>
            <mesh rotation={[Math.PI / 6, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.1, 0.7, 8]} />
              <meshStandardMaterial color="#dc2626" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        ))}

        {/* Twin Sleek Angled Exhaust Stacks */}
        {[-1.1, 1.1].map((x, i) => (
          <group key={`exhaust-${i}`} position={[x, 1.6, -1.8]} rotation={[-0.1, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.24, 0.3, 2.4, 12]} />
              <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.25, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.2, 12]} />
              <meshStandardMaterial color="#020617" />
            </mesh>
          </group>
        ))}

        {/* Navigation Radar Mast */}
        <group position={[0, 2.4, 0.2]}>
          <mesh>
            <cylinderGeometry args={[0.08, 0.14, 2.0, 8]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.7} />
          </mesh>

          {/* Spinning Radar Scanner */}
          <group ref={radarRef} position={[0, 1.1, 0]}>
            <mesh>
              <boxGeometry args={[1.6, 0.16, 0.22]} />
              <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.6} />
            </mesh>
          </group>

          {/* Vision AI Stereoscopic Sensor Pod */}
          <group position={[0, 0.4, 1.5]}>
            <mesh castShadow>
              <boxGeometry args={[0.7, 0.4, 0.45]} />
              <meshStandardMaterial color="#0284c7" metalness={0.8} roughness={0.2} />
            </mesh>
            {[-0.2, 0.2].map((x, i) => (
              <mesh key={i} position={[x, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
                <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={1.2} />
              </mesh>
            ))}
            <pointLight color="#00f0ff" intensity={1.2} distance={4} />
          </group>

          {/* COLREGs Rule 24: Three Vertical Masthead Towing Lanterns */}
          {[1.2, 1.45, 1.7].map((yOffset, idx) => (
            <mesh key={`tow-light-${idx}`} position={[0, yOffset, 0]}>
              <sphereGeometry args={[0.11, 8, 8]} />
              <meshStandardMaterial
                color="#fbbf24"
                emissive="#fbbf24"
                emissiveIntensity={isNight ? 5.0 : 2.5}
              />
            </mesh>
          ))}

          {/* High-Intensity Marine Searchlight (Night Navigation) */}
          <group position={[0, 1.9, 0.4]}>
            <mesh rotation={[Math.PI / 8, 0, 0]}>
              <cylinderGeometry args={[0.2, 0.28, 0.4, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
            <mesh position={[0, 0, 0.2]}>
              <circleGeometry args={[0.25, 16]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            {isNight && (
              <spotLight
                position={[0, 0, 0.3]}
                target-position={[0, -2, 25]}
                color="#f8fafc"
                intensity={18}
                angle={0.4}
                penumbra={0.5}
                distance={70}
                castShadow
              />
            )}
          </group>
        </group>

        {/* Port & Starboard Navigation Lanterns (Red: Port / Green: Starboard) */}
        <mesh position={[1.65, 1.4, 0.2]}>
          <sphereGeometry args={[0.14, 8, 8]} />
          <meshStandardMaterial
            color="#22c55e"
            emissive="#22c55e"
            emissiveIntensity={isNight ? 5.0 : 2.5}
          />
        </mesh>
        <mesh position={[-1.65, 1.4, 0.2]}>
          <sphereGeometry args={[0.14, 8, 8]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={isNight ? 5.0 : 2.5}
          />
        </mesh>

        {/* Night Deck Floodlights */}
        {isNight && (
          <pointLight position={[0, 0.6, 2.5]} color="#fef08a" intensity={3.5} distance={12} />
        )}
      </group>

      {/* ================================================================= */}
      {/* 4. UNDERWATER AZIMUTH THRUSTER UNITS (ASD PODS)                   */}
      {/* ================================================================= */}
      {[-1.2, 1.2].map((x, i) => (
        <group key={`thruster-${i}`} position={[x, -0.9, -3.8]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>
          <mesh position={[0, -0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.6, 0.15, 8, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Critical Girting Alarm Strobe on Tug Deck */}
      {isGirtingCritical && (
        <group position={[0, 4.0, 0]}>
          <pointLight color="#ff1744" intensity={5.0} distance={18} />
          <mesh>
            <sphereGeometry args={[0.35, 12, 12]} />
            <meshBasicMaterial color="#ff1744" />
          </mesh>
        </group>
      )}

      {/* Propeller Wash Spray Particle Aura */}
      {isInWashTurbulence && (
        <group position={[0, 0.6, 0]}>
          <pointLight color="#00f0ff" intensity={2.5} distance={10} />
        </group>
      )}
    </group>
  );
};
