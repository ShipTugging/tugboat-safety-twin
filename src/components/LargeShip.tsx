import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface LargeShipProps {
  position: [number, number, number];
  shipSpeedKnots: number;
}

export const LargeShip: React.FC<LargeShipProps> = ({ position, shipSpeedKnots }) => {
  const radarMainRef = useRef<THREE.Group>(null);
  const radarSubRef = useRef<THREE.Group>(null);
  const propRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (radarMainRef.current) {
      radarMainRef.current.rotation.y += delta * 3.8;
    }
    if (radarSubRef.current) {
      radarSubRef.current.rotation.y += delta * 2.2;
    }
    if (propRef.current) {
      propRef.current.rotation.z += delta * (shipSpeedKnots * 2.4 + 1.2);
    }
  });

  // Generate authentic curved waterline hull shape
  const { hullGeometry, underwaterHullGeom } = useMemo(() => {
    // 2D Waterline profile of 66,000 DWT Container Ship
    const shape = new THREE.Shape();
    
    // Start at sharp stem knife-edge
    shape.moveTo(0, 36);
    // Sharp bow flare curving outward to forward shoulder
    shape.bezierCurveTo(3.2, 32, 6.8, 25, 7.1, 18);
    // Parallel midbody (midship section)
    shape.lineTo(7.1, -20);
    // Tapering run to stern quarter
    shape.bezierCurveTo(7.1, -26, 6.4, -31, 4.8, -34.5);
    // Transom stern centerline
    shape.lineTo(0, -35.2);
    
    // Port side (mirror)
    shape.lineTo(-4.8, -34.5);
    shape.bezierCurveTo(-6.4, -31, -7.1, -26, -7.1, -20);
    shape.lineTo(-7.1, 18);
    shape.bezierCurveTo(-6.8, 25, -3.2, 32, 0, 36);

    const extrudeSettings = {
      steps: 1,
      depth: 6.5,
      bevelEnabled: true,
      bevelThickness: 0.8,
      bevelSize: 0.6,
      bevelOffset: 0,
      bevelSegments: 3,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Rotate so extrusion is along vertical Y axis and centered
    geom.rotateX(Math.PI / 2);
    geom.translate(0, 6.8, 0);

    // Underwater hull (red antifouling section below waterline)
    const underExtrude = {
      steps: 1,
      depth: 4.2,
      bevelEnabled: true,
      bevelThickness: 1.2,
      bevelSize: 0.8,
      bevelOffset: 0,
      bevelSegments: 4,
    };
    const underGeom = new THREE.ExtrudeGeometry(shape, underExtrude);
    underGeom.rotateX(Math.PI / 2);
    underGeom.translate(0, 0.4, 0);

    return { hullGeometry: geom, underwaterHullGeom: underGeom };
  }, []);

  return (
    <group position={position}>
      {/* ================================================================= */}
      {/* 1. CURVED HYDRODYNAMIC HULL (STREAMLINED NAVAL PROFILE)          */}
      {/* ================================================================= */}

      {/* Underwater Curved Hull (Red Antifouling) */}
      <mesh geometry={underwaterHullGeom} castShadow receiveShadow>
        <meshStandardMaterial
          color="#881337"
          roughness={0.65}
          metalness={0.2}
        />
      </mesh>

      {/* Waterline White & Black Boot-Topping Stripe */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[14.4, 0.4, 71.5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>

      {/* Upper Freeboard Curved Hull (Dark Marine Charcoal/Navy) */}
      <mesh geometry={hullGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#1e293b"
          roughness={0.45}
          metalness={0.35}
        />
      </mesh>

      {/* Pronounced Bulbous Bow (Underwater forward sphere/cylinder) */}
      <group position={[0, -1.8, 38]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[2.2, 3.2, 6.5, 24]} />
          <meshStandardMaterial color="#881337" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0, 3.2]} castShadow>
          <sphereGeometry args={[2.2, 24, 24]} />
          <meshStandardMaterial color="#881337" roughness={0.65} />
        </mesh>
      </group>

      {/* Flared Bow Flare & Knife-Edge Stempost */}
      <group position={[0, 4.2, 35.5]}>
        <mesh rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[4.2, 6.2, 4]} />
          <meshStandardMaterial color="#1e293b" roughness={0.5} />
        </mesh>
      </group>

      {/* Port & Starboard Bow Anchor Pockets with Cast Iron Anchors */}
      {[-6.8, 6.8].map((x, i) => (
        <group key={`anchor-${i}`} position={[x, 4.2, 31]} rotation={[0, i === 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          {/* Hawse Hole Pocket Rim */}
          <mesh>
            <torusGeometry args={[0.7, 0.2, 8, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.9} />
          </mesh>
          {/* Fluke & Shank */}
          <mesh position={[0, -0.6, 0]}>
            <boxGeometry args={[0.4, 1.8, 0.8]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Forecastle Mooring Deck & Handrails */}
      <group position={[0, 6.8, 32]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10, 7]} />
          <meshStandardMaterial color="#14532d" roughness={0.8} />
        </mesh>
        {/* Twin Mooring Windlasses */}
        {[-2.8, 2.8].map((x, i) => (
          <mesh key={i} position={[x, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.55, 0.55, 1.4, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* ================================================================= */}
      {/* 2. REALISTIC STEPPED CONTAINER STACKS (AUTHENTIC CARGO PROFILE)   */}
      {/* ================================================================= */}
      <group position={[0, 7.2, 6]}>
        {[
          // Forward Bay (Lower for bridge line-of-sight visibility)
          { x: -3.6, z: 20, w: 5.4, h: 4.8, l: 12, color: '#00a3e0', label: 'MAERSK' },
          { x: 3.6, z: 20, w: 5.4, h: 4.2, l: 12, color: '#008751', label: 'EVERGREEN' },

          // Mid Bay 1 (Full 5-tier high stack)
          { x: -3.6, z: 6, w: 5.4, h: 6.8, l: 14, color: '#ea580c', label: 'HAPAG-LLOYD' },
          { x: 3.6, z: 6, w: 5.4, h: 6.4, l: 14, color: '#be185d', label: 'ONE' },

          // Mid Bay 2 (Full 5-tier stack)
          { x: -3.6, z: -8, w: 5.4, h: 6.6, l: 14, color: '#1e3a8a', label: 'CMA CGM' },
          { x: 3.6, z: -8, w: 5.4, h: 6.8, l: 14, color: '#ca8a04', label: 'MSC' },

          // Aft Bay (Stepped down in front of wheelhouse)
          { x: -3.6, z: -18, w: 5.4, h: 5.2, l: 10, color: '#475569', label: 'GEN' },
          { x: 3.6, z: -18, w: 5.4, h: 5.2, l: 10, color: '#dc2626', label: 'K-LINE' },

          // Top Tier High-Cube row
          { x: 0, z: 6, w: 12.6, h: 2.2, l: 26, color: '#e2e8f0', label: 'REEFER' },
        ].map((c, i) => (
          <group key={i} position={[c.x, c.h / 2, c.z]}>
            {/* Main Container Stack */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[c.w, c.h, c.l]} />
              <meshStandardMaterial color={c.color} roughness={0.65} metalness={0.25} />
            </mesh>
            {/* Corrugated Edge Line / Door Framing */}
            <mesh position={[0, 0, -c.l / 2 - 0.02]}>
              <planeGeometry args={[c.w * 0.9, c.h * 0.9]} />
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </mesh>
          </group>
        ))}

        {/* Lashing Bridges / Vertical Walkway Towers */}
        {[-1, 13].map((z, zi) => (
          <mesh key={`lashing-${zi}`} position={[0, 3.2, z]}>
            <boxGeometry args={[13.6, 6.8, 0.4]} />
            <meshStandardMaterial color="#334155" wireframe transparent opacity={0.35} />
          </mesh>
        ))}
      </group>

      {/* ================================================================= */}
      {/* 3. MULTI-TIER BRIDGE SUPERSTRUCTURE, RADARS & LIFEBOATS          */}
      {/* ================================================================= */}
      <group position={[0, 10.8, -26]}>
        {/* Main Accommodation Deckhouse (White with chamfered bridge wings) */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[13.4, 7.8, 8.5]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.25} metalness={0.15} />
        </mesh>

        {/* Rows of Cabin Portholes / Windows */}
        {[-1.5, 1.5].map((y, yi) => (
          <mesh key={yi} position={[0, y, 4.3]}>
            <planeGeometry args={[12.2, 0.6]} />
            <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.9} />
          </mesh>
        ))}

        {/* Navigating Bridge Wings (Aerodynamically flared over ship's beam) */}
        <group position={[0, 4.8, 0.6]}>
          <mesh castShadow>
            <boxGeometry args={[18.8, 2.2, 3.8]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.2} />
          </mesh>
          {/* Panoramic Tinted Anti-Glare Windows */}
          <mesh position={[0, 0.2, 1.95]}>
            <boxGeometry args={[18.4, 1.2, 0.2]} />
            <meshStandardMaterial
              color="#0284c7"
              roughness={0.05}
              metalness={0.95}
              transparent
              opacity={0.85}
            />
          </mesh>
          {/* Orange Lifebuoys on Bridge Wing Rails */}
          {[-9.2, 9.2].map((x, i) => (
            <mesh key={`lifebuoy-${i}`} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.32, 0.1, 8, 16]} />
              <meshStandardMaterial color="#ea580c" roughness={0.4} />
            </mesh>
          ))}
        </group>

        {/* Enclosed Orange Davit-Launched Capsule Lifeboats */}
        {[-7.2, 7.2].map((x, i) => (
          <group key={`lifeboat-${i}`} position={[x, 1.4, 0]} rotation={[0, i === 0 ? 0 : Math.PI, 0]}>
            <mesh position={[0, 0.8, 0]}>
              <boxGeometry args={[0.4, 2.2, 4.2]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} />
            </mesh>
            <mesh position={[0.6, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.7, 3.2, 8, 16]} />
              <meshStandardMaterial color="#ea580c" roughness={0.4} />
            </mesh>
          </group>
        ))}

        {/* Communication Radar Mast Tower */}
        <group position={[0, 7.8, 0.6]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.45, 4.8, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Spinning X-Band Scanner */}
          <group ref={radarMainRef} position={[0, 2.5, 0]}>
            <mesh>
              <boxGeometry args={[3.8, 0.35, 0.4]} />
              <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.8} />
            </mesh>
          </group>
          {/* Spinning S-Band Scanner */}
          <group ref={radarSubRef} position={[0, 1.2, 0.8]}>
            <mesh>
              <boxGeometry args={[4.4, 0.4, 0.4]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
          </group>
          {/* Satellite VSAT Radomes */}
          {[-1.2, 1.2].map((x, i) => (
            <mesh key={`vsat-${i}`} position={[x, 0.6, -0.6]}>
              <sphereGeometry args={[0.55, 16, 16]} />
              <meshStandardMaterial color="#ffffff" roughness={0.2} />
            </mesh>
          ))}
        </group>

        {/* Funnel Exhaust Casing */}
        <group position={[0, 5.0, -4.5]}>
          <mesh castShadow>
            <boxGeometry args={[3.8, 7.4, 3.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[3.85, 1.2, 3.25]} />
            <meshStandardMaterial color="#0284c7" roughness={0.3} />
          </mesh>
          {[-0.8, 0.8].map((x, i) => (
            <mesh key={i} position={[x, 3.9, 0]}>
              <cylinderGeometry args={[0.35, 0.35, 0.8, 12]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          ))}
        </group>
      </group>

      {/* ================================================================= */}
      {/* 4. STERN CHOCK, FAIRLEAD & SCULPTED PROPELLER                     */}
      {/* ================================================================= */}
      {/* Starboard Quarter Towing Chock */}
      <group position={[3.5, 2.7, -34.2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.55, 0.7, 1.3, 16]} />
          <meshStandardMaterial color="#facc15" metalness={0.8} roughness={0.2} />
        </mesh>
        <pointLight color="#facc15" intensity={2.0} distance={8} />
      </group>

      {/* 5-Blade Bronze Propeller & Rudder Horn */}
      <group position={[0, -1.8, -36.2]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.8, 0.8, 2.4, 16]} />
          <meshStandardMaterial color="#b45309" metalness={0.9} roughness={0.15} />
        </mesh>
        <group ref={propRef} position={[0, 0, -1.2]}>
          {[0, 72, 144, 216, 288].map((deg, i) => (
            <mesh key={i} rotation={[0, 0.35, (deg * Math.PI) / 180]} position={[0, 1.5, 0]}>
              <boxGeometry args={[0.55, 2.6, 0.18]} />
              <meshStandardMaterial color="#d97706" metalness={0.92} roughness={0.18} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0, -3.2]}>
          <boxGeometry args={[0.4, 4.5, 2.2]} />
          <meshStandardMaterial color="#881337" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
};
