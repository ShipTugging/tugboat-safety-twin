import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { RiskLevel } from '../types/maritime';

interface TowingLineProps {
  start: [number, number, number]; // Ship chock
  end: [number, number, number];   // Tug staple
  tensionKn: number;
  girtingStatus: RiskLevel;
  quickReleaseActive: boolean;
}

export const TowingLine: React.FC<TowingLineProps> = ({
  start,
  end,
  tensionKn,
  girtingStatus,
  quickReleaseActive,
}) => {
  // Calculate curve points for catenary line
  const { geometry, color, emissiveIntensity } = useMemo(() => {
    const p1 = new THREE.Vector3(...start);
    const p2 = new THREE.Vector3(...end);

    // Catenary sag depends inversely on tension
    // Higher tension = straighter line; Lower tension = more sag
    const mid = new THREE.Vector3().lerpVectors(p1, p2, 0.5);
    const sag = Math.max(0.08, 1.4 - Math.min(1.2, tensionKn / 150));
    mid.y -= sag;

    const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
    const geom = new THREE.TubeGeometry(curve, 32, 0.085, 8, false);

    // Color logic
    let lineColor = '#d8c4a0';
    let intensity = 0;

    if (girtingStatus === 'CRITICAL') {
      lineColor = '#ff1744';
      intensity = 2.0;
    } else if (girtingStatus === 'WARNING') {
      lineColor = '#ffb020';
      intensity = 1.0;
    } else {
      lineColor = '#d8c4a0';
      intensity = 0;
    }

    return {
      geometry: geom,
      color: lineColor,
      emissiveIntensity: intensity,
    };
  }, [start, end, tensionKn, girtingStatus]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  // If quick release activated, line is detached
  if (quickReleaseActive) {
    return (
      <group>
        {/* Detached line stub on ship */}
        <mesh position={start}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#ff1744" />
        </mesh>
        {/* Detached line stub on tug staple */}
        <mesh position={end}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#ff1744" />
        </mesh>
      </group>
    );
  }


  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {/* Towing Shackle / Anchor points */}
      <mesh position={start}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
};
