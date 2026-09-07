import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { RiskLevel } from '../types/maritime';
import { createTowlineCurve, getTowlineState } from '../simulation/towline';

interface TowingLineProps {
  start: [number, number, number]; // Ship chock
  end: [number, number, number];   // Tug staple
  tensionKn: number;
  girtingStatus: RiskLevel;
  quickReleaseActive: boolean;
  lineLength: number;
  datasetMode?: boolean;
  meshRef?: React.Ref<THREE.Mesh>;
}

export const TowingLine: React.FC<TowingLineProps> = ({
  start,
  end,
  tensionKn,
  girtingStatus,
  quickReleaseActive,
  lineLength,
  datasetMode=false,
  meshRef,
}) => {
  // Calculate curve points for catenary line
  const { geometry, color, emissiveIntensity } = useMemo(() => {
    const p1 = new THREE.Vector3(...start);
    const p2 = new THREE.Vector3(...end);

    // Catenary sag depends inversely on tension
    // Higher tension = straighter line; Lower tension = more sag
    const curve = createTowlineCurve(p1,p2,lineLength,tensionKn,girtingStatus);
    const geom = new THREE.TubeGeometry(curve, 64, 0.085, 8, false);

    // Color logic
    let lineColor = '#d8c4a0';
    let intensity = 0;

    if (!datasetMode && girtingStatus === 'CRITICAL') {
      lineColor = '#ff1744';
      intensity = 2.0;
    } else if (!datasetMode && girtingStatus === 'WARNING') {
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
  }, [start, end, tensionKn, girtingStatus, lineLength, datasetMode]);

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
      <mesh ref={meshRef} geometry={geometry} userData={{datasetClass:getTowlineState(tensionKn,girtingStatus)==='taut'?1:2}}>
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
