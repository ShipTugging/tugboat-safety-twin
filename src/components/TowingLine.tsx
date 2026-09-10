import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { RiskLevel } from '../types/maritime';
import { computeSagMetrics, createTowlineCurve, getTowlineState } from '../simulation/towline';

interface TowingLineProps {
  start: [number, number, number]; // Ship chock
  end: [number, number, number];   // Tug staple
  tensionKn: number;
  girtingStatus: RiskLevel;
  quickReleaseActive: boolean;
  lineLength: number;
  ropeSlackM?: number;
  ropeSagOverrideM?: number;
  ropeColor?: string;
  ropeRadius?: number;
  datasetMode?: boolean;
  meshRef?: React.Ref<THREE.Mesh>;
}

export const DEFAULT_ROPE_RADIUS = 0.085;

export const TowingLine: React.FC<TowingLineProps> = ({
  start,
  end,
  tensionKn,
  girtingStatus,
  quickReleaseActive,
  lineLength,
  ropeSlackM,
  ropeSagOverrideM,
  ropeColor = '#d8c4a0',
  ropeRadius = DEFAULT_ROPE_RADIUS,
  datasetMode=false,
  meshRef,
}) => {
  // The curve, its sag metrics and the tube share one computation so labels
  // always describe exactly the geometry that was rendered.
  const { geometry, color, emissiveIntensity, userData } = useMemo(() => {
    const p1 = new THREE.Vector3(...start);
    const p2 = new THREE.Vector3(...end);
    const curve = createTowlineCurve(p1,p2,lineLength,tensionKn,girtingStatus,ropeSlackM,ropeSagOverrideM);
    const sag = computeSagMetrics(p1,p2,lineLength,tensionKn,girtingStatus,ropeSlackM,ropeSagOverrideM);
    const geom = new THREE.TubeGeometry(curve, 64, ropeRadius, 8, false);

    let lineColor = ropeColor;
    let intensity = 0;
    if (!datasetMode && girtingStatus === 'CRITICAL') {
      lineColor = '#ff1744';
      intensity = 2.0;
    } else if (!datasetMode && girtingStatus === 'WARNING') {
      lineColor = '#ffb020';
      intensity = 1.0;
    }

    return {
      geometry: geom,
      color: lineColor,
      emissiveIntensity: intensity,
      userData: { datasetClass: getTowlineState(tensionKn,girtingStatus)==='taut'?1:2, curve, radius: ropeRadius, sag },
    };
  }, [start, end, tensionKn, girtingStatus, lineLength, ropeSlackM, ropeSagOverrideM, ropeColor, ropeRadius, datasetMode]);

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
      <mesh ref={meshRef} geometry={geometry} userData={userData}>
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
