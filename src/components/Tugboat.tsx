import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { TimeOfDay } from '../types/maritime';

interface TugboatProps {
  position: [number, number, number];
  rotation: [number, number, number]; // [pitch, yaw, roll]
  isGirtingCritical: boolean;
  isInWashTurbulence: boolean;
  timeOfDay?: TimeOfDay;
  simulationTime?: number;
}

export const Tugboat: React.FC<TugboatProps> = ({
  position,
  rotation,
  isGirtingCritical,
  isInWashTurbulence,
  timeOfDay = 'day',
  simulationTime,
}) => {
  const isNight = timeOfDay === 'night';
  const radarRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (radarRef.current) {
      radarRef.current.rotation.y = simulationTime===undefined?radarRef.current.rotation.y+delta*6:simulationTime*6;
    }
  });

  // Procedural Curved Tugboat Hull (Spoon Bow & Tapered Stern)
  const { tugHullGeom, tugUnderGeom, fenderGeom, deckGeom } = useMemo(() => {
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

    const fenderPath = new THREE.CatmullRomCurve3(shape.getSpacedPoints(56).map(p => new THREE.Vector3(p.x * 1.055, 0.92, p.y * 1.035)), true);
    const fender = new THREE.TubeGeometry(fenderPath, 72, 0.23, 8, true);
    const deck = new THREE.ShapeGeometry(shape, 20);
    deck.rotateX(Math.PI / 2);
    deck.translate(0, 1.61, 0);
    return { tugHullGeom: geom, tugUnderGeom: underGeom, fenderGeom: fender, deckGeom: deck };
  }, []);

  useEffect(() => () => {
    [tugHullGeom, tugUnderGeom, fenderGeom, deckGeom].forEach(geometry => geometry.dispose());
  }, [tugHullGeom, tugUnderGeom, fenderGeom, deckGeom]);

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
        <meshStandardMaterial color="#793f35" roughness={0.7} />
      </mesh>

      {/* Freeboard Curved Steel Hull (Deep Industrial Charcoal Navy) */}
      <mesh geometry={tugHullGeom} castShadow receiveShadow>
        <meshStandardMaterial color="#364a57" roughness={0.8} metalness={0.16} />
      </mesh>

      {/* Continuous rubber belt follows the spoon bow and rounded transom. */}
      <mesh geometry={fenderGeom} castShadow>
        <meshStandardMaterial color="#232a2b" roughness={0.96} />
      </mesh>
      <mesh geometry={deckGeom} receiveShadow>
        <meshStandardMaterial color="#68746a" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].flatMap(side => [-3.2, -1.5, 0.2, 1.9, 3.4].map((z, index) => (
        <group key={`${side}-${z}`} position={[side * (index === 0 ? 2.7 : 3), 0.72, z]}>
          <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
            <torusGeometry args={[0.4, 0.16, 8, 14]} />
            <meshStandardMaterial color="#222728" roughness={0.98} />
          </mesh>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.04, 0.5, 0.05]} />
            <meshStandardMaterial color="#7b8079" metalness={0.5} roughness={0.8} />
          </mesh>
        </group>
      )))}
      {/* Heavy bow pushing pad sits horizontally against the hull. */}
      <mesh position={[0, 1, 5.7]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 2.5, 12]} />
        <meshStandardMaterial color="#242829" roughness={0.98} />
      </mesh>
      {[-1, 1].map(side => (
        <group key={`aft-rail-${side}`} position={[side * 1.85, 1.7, -3.4]}>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[0.05, 0.05, 2.2]} />
            <meshStandardMaterial color="#c6c6b9" roughness={0.65} />
          </mesh>
          {[-1, 0, 1].map(z => (
            <mesh key={z} position={[0, 0.35, z]}>
              <cylinderGeometry args={[0.035, 0.035, 0.7, 6]} />
              <meshStandardMaterial color="#c6c6b9" roughness={0.65} />
            </mesh>
          ))}
        </group>
      ))}

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
            <meshStandardMaterial color="#ba5133" roughness={0.9} />
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
          <meshStandardMaterial color="#ba5133" roughness={0.35} metalness={0.15} />
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
              color="#344e56"
              roughness={0.05}
              metalness={0.95}
              transparent
              opacity={0.8}
            />
          </mesh>

          {Array.from({ length: 12 }, (_, i) => {
            const angle = i * Math.PI / 6;
            return (
              <mesh key={`window-frame-${i}`} position={[Math.sin(angle) * 1.67, 0.05, Math.cos(angle) * 1.67]} rotation={[0, angle, -0.14 * Math.sin(angle)]}>
                <boxGeometry args={[0.055, 0.98, 0.07]} />
                <meshStandardMaterial color="#d8d7c9" roughness={0.6} />
              </mesh>
            );
          })}
          <mesh position={[0, 0.76, 0]} castShadow>
            <cylinderGeometry args={[1.86, 1.86, 0.16, 12]} />
            <meshStandardMaterial color="#d9d7c8" roughness={0.75} />
          </mesh>
          {/* Cockpit Interior Console Glow */}
          {isNight && <pointLight position={[0, -0.1, 0]} color="#e7caa1" intensity={0.3} distance={2.5} />}
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
              <meshStandardMaterial color="#d8dbce" roughness={0.6} />
            </mesh>
          </group>

          {/* Vision AI Stereoscopic Sensor Pod */}
          <group position={[0, 0.4, 1.5]}>
            <mesh castShadow>
              <boxGeometry args={[0.7, 0.4, 0.45]} />
              <meshStandardMaterial color="#344e56" metalness={0.8} roughness={0.2} />
            </mesh>
            {[-0.2, 0.2].map((x, i) => (
              <mesh key={i} position={[x, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
                <meshStandardMaterial color="#1d343b" roughness={0.15} metalness={0.5} />
              </mesh>
            ))}

          </group>

          {/* COLREGs Rule 24: Three Vertical Masthead Towing Lanterns */}
          {[1.2, 1.45, 1.7].map((yOffset, idx) => (
            <mesh key={`tow-light-${idx}`} position={[0, yOffset, 0]}>
              <sphereGeometry args={[0.11, 8, 8]} />
              <meshStandardMaterial
                color="#fbbf24"
                emissive="#fbbf24"
                emissiveIntensity={isNight ? 2 : 0.3}
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
            emissiveIntensity={isNight ? 2 : 0.3}
          />
        </mesh>
        <mesh position={[-1.65, 1.4, 0.2]}>
          <sphereGeometry args={[0.14, 8, 8]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={isNight ? 2 : 0.3}
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
          <pointLight color="#b2d0cb" intensity={0.5} distance={7} />
        </group>
      )}
    </group>
  );
};
