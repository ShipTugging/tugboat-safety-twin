import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { TimeOfDay } from '../types/maritime';

interface LargeShipProps {
  position: [number, number, number];
  shipSpeedKnots: number;
  timeOfDay?: TimeOfDay;
  hullColor?: string;
  simulationTime?: number;
}

export const LargeShip: React.FC<LargeShipProps> = ({ position, shipSpeedKnots, timeOfDay = 'day', hullColor = '#3d5261', simulationTime }) => {
  const isNight = timeOfDay === 'night';
  const radarMainRef = useRef<THREE.Group>(null);
  const radarSubRef = useRef<THREE.Group>(null);
  const propRef = useRef<THREE.Group>(null);
  // One small, deterministic texture is shared by every cargo unit.
  const corrugation = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 256, 128);
    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = '#dedede';
      ctx.fillRect(x, 0, 3, 128);
      ctx.fillStyle = '#868686';
      ctx.fillRect(x + 10, 0, 3, 128);
    }
    ctx.fillStyle = '#a0a0a0';
    ctx.fillRect(0, 0, 256, 4);
    ctx.fillRect(0, 124, 256, 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  }, []);
  useEffect(() => () => corrugation.dispose(), [corrugation]);
  const markings = useMemo(() => {
    const makeWindows = (rows: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = rows * 96;
      const ctx = canvas.getContext('2d')!;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < 8; col++) {
          const x = 16 + col * 62;
          const y = 24 + row * 96;
          ctx.fillStyle = '#919d9c';
          ctx.fillRect(x - 3, y - 3, 39, 36);
          ctx.fillStyle = '#2e4852';
          ctx.fillRect(x, y, 33, 30);
          ctx.fillStyle = '#66848b';
          ctx.fillRect(x + 2, y + 2, 29, 6);
          ctx.fillStyle = '#c5c9c0';
          ctx.fillRect(x - 4, y + 34, 42, 3);
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dadbd0';
    ctx.font = '600 76px Arial, sans-serif';
    ctx.fillText('OCEAN MERIDIAN', 512, 120);
    ctx.font = '32px Arial, sans-serif';
    ctx.fillText('BUSAN', 512, 181);
    const name = new THREE.CanvasTexture(canvas);
    name.colorSpace = THREE.SRGBColorSpace;
    name.anisotropy = 4;
    return { cabins: makeWindows(3), bridge: makeWindows(1), name };
  }, []);
  useEffect(() => () => Object.values(markings).forEach(texture => texture.dispose()), [markings]);

  useFrame((_, delta) => {
    if (radarMainRef.current) {
      radarMainRef.current.rotation.y = simulationTime===undefined?radarMainRef.current.rotation.y+delta*3.8:simulationTime*3.8;
    }
    if (radarSubRef.current) {
      radarSubRef.current.rotation.y = simulationTime===undefined?radarSubRef.current.rotation.y+delta*2.2:simulationTime*2.2;
    }
    if (propRef.current) {
      propRef.current.rotation.z = simulationTime===undefined?propRef.current.rotation.z+delta*(shipSpeedKnots*2.4+1.2):simulationTime*(shipSpeedKnots*2.4+1.2);
    }
  });

  // Generate authentic curved waterline hull shape
  const { hullGeometry, underwaterHullGeom, stripeGeometry, deckGeometry, railGeometry } = useMemo(() => {
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

    const stripe = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false, curveSegments: 20 });
    stripe.rotateX(Math.PI / 2);
    stripe.scale(1.09, 1, 1.02);
    stripe.translate(0, 0.8, 0);
    const deck = new THREE.ShapeGeometry(shape, 20);
    deck.rotateX(Math.PI / 2);
    deck.translate(0, 7.61, 0);
    const railPath = new THREE.CatmullRomCurve3(shape.getSpacedPoints(80).map(p => new THREE.Vector3(p.x, 8.3, p.y)), true);
    const rail = new THREE.TubeGeometry(railPath, 100, 0.045, 4, true);
    return { hullGeometry: geom, underwaterHullGeom: underGeom, stripeGeometry: stripe, deckGeometry: deck, railGeometry: rail };
  }, []);

  useEffect(() => () => {
    [hullGeometry, underwaterHullGeom, stripeGeometry, deckGeometry, railGeometry].forEach(geometry => geometry.dispose());
  }, [hullGeometry, underwaterHullGeom, stripeGeometry, deckGeometry, railGeometry]);

  return (
    <group position={position}>
      {/* ================================================================= */}
      {/* 1. CURVED HYDRODYNAMIC HULL (STREAMLINED NAVAL PROFILE)          */}
      {/* ================================================================= */}

      {/* Underwater Curved Hull (Red Antifouling) */}
      <mesh geometry={underwaterHullGeom} castShadow receiveShadow>
        <meshStandardMaterial
          color="#733e37"
          roughness={0.65}
          metalness={0.2}
        />
      </mesh>

      {/* Waterline White & Black Boot-Topping Stripe */}
      <mesh geometry={stripeGeometry}>
        <meshStandardMaterial color="#aca999" roughness={0.7} />
      </mesh>
      <mesh geometry={deckGeometry} receiveShadow>
        <meshStandardMaterial color="#606b64" roughness={0.94} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={railGeometry}>
        <meshStandardMaterial color="#b3b9b5" roughness={0.65} />
      </mesh>

      {/* Upper Freeboard Curved Hull (Dark Marine Charcoal/Navy) */}
      <mesh geometry={hullGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={hullColor}
          roughness={0.76}
          metalness={0.16}
        />
      </mesh>

      <mesh position={[0, 3.6, -35.86]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[5.8, 1.45]} />
        <meshStandardMaterial map={markings.name} transparent alphaTest={0.1} depthWrite={false} roughness={0.85} />
      </mesh>

      {/* Pronounced Bulbous Bow (Underwater forward sphere/cylinder) */}
      <group position={[0, -1.8, 38]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[2.2, 3.2, 6.5, 24]} />
          <meshStandardMaterial color="#733e37" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0, 3.2]} castShadow>
          <sphereGeometry args={[2.2, 24, 24]} />
          <meshStandardMaterial color="#733e37" roughness={0.65} />
        </mesh>
      </group>

      {/* Port & Starboard Bow Anchor Pockets with Cast Iron Anchors */}
      {[-3.25, 3.25].map((x, i) => (
        <group key={`anchor-${i}`} position={[x, 4.2, 30]} rotation={[0, i === 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
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
      <group position={[0, 7.7, 27]}>
        {[-2.2, 2.2].map((x, i) => (
          <mesh key={i} position={[x, 0.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 1.2, 12]} />
            <meshStandardMaterial color="#87918d" metalness={0.6} roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* ================================================================= */}
      {/* 2. REALISTIC STEPPED CONTAINER STACKS (AUTHENTIC CARGO PROFILE)   */}
      {/* ================================================================= */}
      <group position={[0, 7.8, 0]}>
        {[-14, -2, 10, 21].flatMap((z, bay) =>
          [-4.25, -1.42, 1.42, 4.25].flatMap((x, row) =>
            Array.from({ length: bay === 3 ? 2 : 3 + ((bay + row) % 2) }, (_, tier) => {
              const length = bay === 3 ? 8.2 : 11.2;
              const colors = ['#9d5141', '#647d80', '#b28b52', '#52746a', '#d0c8b1', '#496172'];
              return (
                <group key={`${bay}-${row}-${tier}`} position={[x, 0.98 + tier * 2.04, z]}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[2.68, 1.96, length]} />
                    <meshStandardMaterial color={colors[(bay * 3 + row + tier * 2) % colors.length]} map={corrugation} bumpMap={corrugation} bumpScale={0.035} roughness={0.78} metalness={0.18} />
                  </mesh>
                  {/* Door seam and locking bars remain legible at closer camera distances. */}
                  {[-0.65, 0, 0.65].map(bar => (
                    <mesh key={bar} position={[bar, 0, -length / 2 - 0.018]}>
                      <boxGeometry args={[0.035, 1.72, 0.035]} />
                      <meshStandardMaterial color="#bdc1b5" roughness={0.65} metalness={0.4} />
                    </mesh>
                  ))}
                </group>
              );
            })
          )
        )}
        {[-6.95, 6.95].flatMap(x => [-26, -18, -10, -2, 6, 14].map(z => (
          <mesh key={`${x}-${z}`} position={[x, 0.18, z]}>
            <cylinderGeometry args={[0.04, 0.04, 0.75, 4]} />
            <meshStandardMaterial color="#b3b9b5" roughness={0.6} />
          </mesh>
        )))}
      </group>

      {/* ================================================================= */}
      {/* 3. MULTI-TIER BRIDGE SUPERSTRUCTURE, RADARS & LIFEBOATS          */}
      {/* ================================================================= */}
      <group position={[0, 10.8, -26]}>
        {/* Main Accommodation Deckhouse (White with chamfered bridge wings) */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[13.4, 7.8, 8.5]} />
          <meshStandardMaterial color="#d9d9cd" roughness={0.65} metalness={0.15} />
        </mesh>

        {/* Rows of Cabin Portholes / Windows */}
        {[-1, 1].map(side => (
          <React.Fragment key={`cabins-${side}`}>
            <mesh position={[0, 0, side * 4.27]} rotation={[0, side === 1 ? 0 : Math.PI, 0]}>
              <planeGeometry args={[12.4, 6.8]} />
              <meshStandardMaterial map={markings.cabins} transparent alphaTest={0.2} roughness={0.4} metalness={0.15} />
            </mesh>
            <mesh position={[side * 6.72, 0, 0]} rotation={[0, side * Math.PI / 2, 0]}>
              <planeGeometry args={[7.7, 6.8]} />
              <meshStandardMaterial map={markings.cabins} transparent alphaTest={0.2} roughness={0.4} metalness={0.15} />
            </mesh>
          </React.Fragment>
        ))}

        {/* Navigating Bridge Wings (Aerodynamically flared over ship's beam) */}
        <group position={[0, 4.8, 0.6]}>
          <mesh castShadow>
            <boxGeometry args={[18.8, 2.2, 3.8]} />
            <meshStandardMaterial color="#d9d9cd" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.2, -1.92]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[18.2, 1.6]} />
            <meshStandardMaterial map={markings.bridge} transparent alphaTest={0.2} roughness={0.3} metalness={0.2} />
          </mesh>
          {/* Panoramic Tinted Anti-Glare Windows */}
          <mesh position={[0, 0.2, 1.95]}>
            <boxGeometry args={[18.4, 1.2, 0.2]} />
            <meshStandardMaterial
              color="#36535e"
              roughness={0.05}
              metalness={0.95}
              transparent
              opacity={0.85}
            />
          </mesh>
          {Array.from({ length: 13 }, (_, i) => (
            <mesh key={`bridge-frame-${i}`} position={[-8.7 + i * 1.45, 0.2, 2.08]}>
              <boxGeometry args={[0.1, 1.25, 0.08]} />
              <meshStandardMaterial color="#cbd0c6" roughness={0.6} />
            </mesh>
          ))}
          {/* Orange Lifebuoys on Bridge Wing Rails */}
          {[-9.2, 9.2].map((x, i) => (
            <mesh key={`lifebuoy-${i}`} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.32, 0.1, 8, 16]} />
              <meshStandardMaterial color="#ea580c" roughness={0.4} />
            </mesh>
          ))}

          {/* Port/Starboard Bridge Wing Navigation Lanterns */}
          <mesh position={[-9.5, 0.4, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={isNight ? 2 : 0.3} />
          </mesh>
          <mesh position={[9.5, 0.4, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={isNight ? 2 : 0.3} />
          </mesh>

          {/* Night Bridge Interior Glow */}
          {isNight && (
            <pointLight position={[0, 0.4, 0.5]} color="#e4c899" intensity={1.4} distance={8} />
          )}
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
              <meshStandardMaterial color="#d4d6cc" roughness={0.6} />
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
            <meshStandardMaterial color="#36535e" roughness={0.3} />
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

      </group>

      {/* Transom Stern White Navigation Light (COLREGs Rule 23) */}
      <group position={[0, 4.2, -35.2]}>
        <mesh>
          <sphereGeometry args={[0.22, 8, 8]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={isNight ? 2 : 0.3} />
        </mesh>
        {isNight && (
          <pointLight color="#ffffff" intensity={2.5} distance={15} />
        )}
      </group>

      {/* 5-Blade Bronze Propeller & Rudder Horn */}
      <group position={[0, -1.8, -36.2]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.8, 0.8, 2.4, 16]} />
          <meshStandardMaterial color="#b45309" metalness={0.9} roughness={0.15} />
        </mesh>
        <group ref={propRef} position={[0, 0, -1.2]}>
          {[0, 72, 144, 216, 288].map((deg, i) => (
            <group key={i} rotation={[0, 0, (deg * Math.PI) / 180]}>
              <mesh rotation={[0, 0.35, 0]} position={[0, 1.5, 0]}>
                <boxGeometry args={[0.55, 2.6, 0.18]} />
                <meshStandardMaterial color="#aa8545" metalness={0.8} roughness={0.32} />
              </mesh>
            </group>
          ))}
        </group>
        <mesh position={[0, 0, -3.2]}>
          <boxGeometry args={[0.4, 4.5, 2.2]} />
          <meshStandardMaterial color="#733e37" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
};
