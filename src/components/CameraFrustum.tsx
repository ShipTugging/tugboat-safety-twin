import React, { useMemo } from 'react';
import * as THREE from 'three';

interface CameraFrustumProps {
  tugPosition: [number, number, number];
  tugRotation: [number, number, number];
  hullDistanceM: number;
  suctionRiskPct: number;
}

export const CameraFrustum: React.FC<CameraFrustumProps> = ({
  tugPosition,
  tugRotation,
  hullDistanceM,
  suctionRiskPct,
}) => {
  // Frustum cone dimensions
  const frustumLength = Math.min(38, Math.max(12, hullDistanceM + 6));
  const frustumRadius = frustumLength * 0.38;

  // Frustum wireframe geometry (cone pointing forward along local Z/negative Z)
  const frustumGeom = useMemo(() => {
    // Cone geometry: radius, height, radialSegments, heightSegments, openEnded
    const geom = new THREE.ConeGeometry(frustumRadius, frustumLength, 8, 4, true);
    // Rotate cone so its tip is at origin and expands forward along Z+
    geom.rotateX(Math.PI / 2);
    geom.translate(0, 0, frustumLength / 2);
    return geom;
  }, [frustumLength, frustumRadius]);

  const isAlert = suctionRiskPct >= 80;
  const frustumColor = isAlert ? '#ff1744' : '#00f0ff';

  // Target lock-on position on ship's starboard hull
  const targetOnShip: [number, number, number] = [
    7.0, // Starboard hull X
    3.0,
    Math.min(25, Math.max(-32, tugPosition[2] + 12))
  ];

  return (
    <group>
      {/* 1. Vision AI Frustum Cone attached to Tugboat Wheelhouse Mast */}
      <group
        position={[tugPosition[0], tugPosition[1] + 3.1, tugPosition[2]]}
        rotation={[tugRotation[0], tugRotation[1], tugRotation[2]]}
      >
        {/* Semi-transparent wireframe FOV cone */}
        <mesh geometry={frustumGeom}>
          <meshBasicMaterial
            color={frustumColor}
            wireframe
            transparent
            opacity={isAlert ? 0.35 : 0.18}
          />
        </mesh>

        {/* Inner volumetric glow cone */}
        <mesh geometry={frustumGeom}>
          <meshBasicMaterial
            color={frustumColor}
            transparent
            opacity={0.04}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Optical Sensor Center Reticle Ray */}
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([0, 0, 0, 0, 0, frustumLength])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineDashedMaterial
            color={frustumColor}
            dashSize={0.8}
            gapSize={0.4}
            opacity={0.6}
            transparent
          />
        </line>
      </group>

      {/* 2. Target Acquisition Box on Large Ship Hull */}
      <group position={targetOnShip}>
        {/* Wireframe Bounding Box Locking Hull Surface */}
        <mesh>
          <boxGeometry args={[1.2, 5.0, 9.0]} />
          <meshBasicMaterial
            color={frustumColor}
            wireframe
            transparent
            opacity={0.8}
          />
        </mesh>

        {/* Corner Reticle Brackets */}
        {[-4.2, 4.2].map((z, zi) => (
          <group key={zi} position={[0.65, 0, z]}>
            <mesh>
              <sphereGeometry args={[0.2, 8, 8]} />
              <meshBasicMaterial color={frustumColor} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};
