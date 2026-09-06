import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ShipWakeProps {
  shipSpeed: number;
  tugPosition: [number, number, number];
  shipPosition: [number, number, number];
}

export const ShipWake: React.FC<ShipWakeProps> = ({ shipSpeed, tugPosition, shipPosition }) => {
  const wakeMatRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (wakeMatRef.current) {
      wakeMatRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      wakeMatRef.current.uniforms.uSpeed.value = shipSpeed;
    }
  });

  const wakeShader = {
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSpeed;
      varying vec2 vUv;

      // Procedural noise for water foam
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }

      void main() {
        // V-shaped Kelvin wake dissipation
        float lateralDist = abs(vUv.x - 0.5) * 2.0;
        float longitudinal = vUv.y; // 0 at stern, 1 behind

        // Wake spreads outward
        float wakeWidth = 0.15 + longitudinal * 0.85;
        float wakeMask = smoothstep(wakeWidth, wakeWidth * 0.4, lateralDist);

        // Turbulent foam ripples moving backwards
        float foamNoise = noise(vec2(vUv.x * 24.0, vUv.y * 38.0 - uTime * (uSpeed * 0.4 + 1.2)));
        float foamDetail = noise(vec2(vUv.x * 48.0, vUv.y * 64.0 - uTime * 2.0));
        float foam = smoothstep(0.35, 0.8, foamNoise + foamDetail * 0.4);

        // Fade out as wake moves further aft
        float fade = (1.0 - longitudinal * 0.95) * (uSpeed / 14.0 * 0.8 + 0.3);

        vec3 foamColor = vec3(0.95, 0.98, 1.0);
        float alpha = wakeMask * foam * fade * 0.85;

        gl_FragColor = vec4(foamColor, alpha);
      }
    `
  };

  return (
    <group>
      {/* 1. Large Ship Stern Wake Trail (Kelvin Wake V-spread) */}
      <mesh
        position={[shipPosition[0], 0.04, -58]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[26, 65, 1, 1]} />
        <shaderMaterial
          ref={wakeMatRef}
          vertexShader={wakeShader.vertexShader}
          fragmentShader={wakeShader.fragmentShader}
          uniforms={{
            uTime: { value: 0 },
            uSpeed: { value: shipSpeed },
          }}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>

      {/* 2. Tugboat Propeller Wash & Bow Wave Foam */}
      <group position={[tugPosition[0], 0.05, tugPosition[2]]}>
        {/* Tug stern foam disk */}
        <mesh position={[0, 0, -6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7, 14]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.4}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {/* Tug bow spray ring */}
        <mesh position={[0, 0, 5]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 3.2, 16]} />
          <meshBasicMaterial
            color="#e0f7fa"
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
};
