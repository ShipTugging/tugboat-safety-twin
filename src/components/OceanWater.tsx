import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const UltraRealisticOceanShader = {
  vertexShader: `
    uniform float uTime;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vWaveHeight;
    varying vec3 vViewPosition;

    // Gerstner Wave formulation with precise analytical normal calculation
    vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
      float steepness = wave.z;
      float wavelength = wave.w;
      float k = 2.0 * 3.14159265 / wavelength;
      float c = sqrt(9.8 / k);
      vec2 d = normalize(wave.xy);
      float f = k * (dot(d, p.xz) - c * uTime * 0.85);
      float a = steepness / k;

      tangent += vec3(
        -d.x * d.x * (steepness * sin(f)),
        d.x * (steepness * cos(f)),
        -d.x * d.y * (steepness * sin(f))
      );
      binormal += vec3(
        -d.x * d.y * (steepness * sin(f)),
        d.y * (steepness * cos(f)),
        -d.y * d.y * (steepness * sin(f))
      );

      return vec3(
        d.x * (a * cos(f)),
        a * sin(f),
        d.y * (a * cos(f))
      );
    }

    void main() {
      vec3 gridPoint = position;
      vec3 tangent = vec3(1.0, 0.0, 0.0);
      vec3 binormal = vec3(0.0, 0.0, 1.0);
      vec3 p = gridPoint;

      // 6-component multi-octave oceanic swell + wind chop
      vec4 w1 = vec4(1.0, 0.25, 0.20, 36.0); // Primary swell
      vec4 w2 = vec4(0.35, 1.0, 0.16, 22.0); // Secondary cross-swell
      vec4 w3 = vec4(-0.6, 0.8, 0.14, 11.0); // Medium wind sea
      vec4 w4 = vec4(0.8, -0.5, 0.10, 5.8);  // Short chop
      vec4 w5 = vec4(-0.3, -0.9, 0.06, 2.8); // Capillary ripple
      vec4 w6 = vec4(0.9, 0.4, 0.04, 1.6);   // High frequency glitter

      p += gerstnerWave(w1, gridPoint, tangent, binormal);
      p += gerstnerWave(w2, gridPoint, tangent, binormal);
      p += gerstnerWave(w3, gridPoint, tangent, binormal);
      p += gerstnerWave(w4, gridPoint, tangent, binormal);
      p += gerstnerWave(w5, gridPoint, tangent, binormal);
      p += gerstnerWave(w6, gridPoint, tangent, binormal);

      vec3 normal = normalize(cross(binormal, tangent));
      vNormal = normal;
      vWaveHeight = p.y;

      vec4 worldPos = modelMatrix * vec4(p, 1.0);
      vWorldPosition = worldPos.xyz;

      vec4 mvPosition = viewMatrix * worldPos;
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uSSSColor;
    uniform vec3 uFoamColor;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uGridIntensity;
    uniform float uTime;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vWaveHeight;
    varying vec3 vViewPosition;

    // Pseudo-random noise for micro surface turbulence
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                 mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }

    void main() {
      vec3 viewDir = normalize(vViewPosition);
      vec3 normal = normalize(vNormal);

      // Add high-frequency procedural micro-normals for sparkling ripple highlights
      vec2 rippleUv = vWorldPosition.xz * 1.5 + vec2(uTime * 0.1, uTime * 0.08);
      float n = noise(rippleUv);
      normal.xz += (vec2(noise(rippleUv + 0.5), noise(rippleUv + 1.2)) - 0.5) * 0.12;
      normal = normalize(normal);

      // 1. Schlick's Fresnel Approximation (realistic reflection vs transmission)
      float NdotV = max(dot(viewDir, normal), 0.0);
      float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 4.5);

      // 2. Depth Water Tint based on wave height
      float depthFactor = smoothstep(-1.5, 1.6, vWaveHeight);
      vec3 waterBodyColor = mix(uDeepColor, uShallowColor, depthFactor);

      // 3. Subsurface Scattering (light shining through translucent wave crests)
      float sssFactor = max(0.0, dot(vNormal, uSunDirection)) * smoothstep(0.4, 1.4, vWaveHeight);
      waterBodyColor += uSSSColor * sssFactor * 0.45;

      // 4. White Crest Seafoam
      float foamNoise = noise(vWorldPosition.xz * 3.5 + uTime * 0.25);
      float foamThreshold = 0.85 - foamNoise * 0.35;
      float foamFactor = smoothstep(foamThreshold, 1.4, vWaveHeight);
      vec3 finalWaterColor = mix(waterBodyColor, uFoamColor, foamFactor * 0.92);

      // 5. Dual-lobe Solar Specular Reflection (Sun glitter glistening on sea)
      vec3 halfVector = normalize(uSunDirection + viewDir);
      float NdotH = max(dot(normal, halfVector), 0.0);
      float sharpSpec = pow(NdotH, 180.0) * 3.5;
      float broadSpec = pow(NdotH, 30.0) * 0.8;
      vec3 sunSpecular = uSunColor * (sharpSpec + broadSpec);

      // 6. Sky Horizon Gradient Reflection
      vec3 skyReflection = mix(vec3(0.45, 0.68, 0.92), vec3(0.75, 0.88, 1.0), normal.y);
      vec3 surfaceColor = mix(finalWaterColor, skyReflection, fresnel * 0.75) + sunSpecular;

      // 7. Tactical Digital Twin Grid Overlay (Optional toggle)
      if (uGridIntensity > 0.01) {
        vec2 gridCoord = abs(fract(vWorldPosition.xz * 0.2) - 0.5);
        float lineDist = min(gridCoord.x, gridCoord.y);
        float gridLine = 1.0 - smoothstep(0.0, 0.035, lineDist);
        surfaceColor += vec3(0.0, 0.95, 1.0) * gridLine * uGridIntensity * 0.3;
      }

      gl_FragColor = vec4(surfaceColor, 0.95);
    }
  `
};

interface OceanWaterProps {
  showTacticalGrid?: boolean;
}

export const OceanWater: React.FC<OceanWaterProps> = ({ showTacticalGrid = true }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color('#03182b') },      // Deep oceanic navy
    uShallowColor: { value: new THREE.Color('#0369a1') },   // Tropical coastal turquoise
    uSSSColor: { value: new THREE.Color('#06b6d4') },       // Subsurface crest glow
    uFoamColor: { value: new THREE.Color('#f8fafc') },      // Frothy wave crest foam
    uSunDirection: { value: new THREE.Vector3(0.65, 0.55, 0.5).normalize() },
    uSunColor: { value: new THREE.Color('#fffbeb') },       // Crisp warm golden sunlight
    uGridIntensity: { value: showTacticalGrid ? 0.35 : 0.0 },
  }), [showTacticalGrid]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uGridIntensity.value = showTacticalGrid ? 0.35 : 0.0;
    }
  });

  return (
    <group>
      {/* High-Resolution Dynamic Ocean Mesh */}
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, -20]} receiveShadow>
        <planeGeometry args={[500, 500, 200, 200]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={UltraRealisticOceanShader.vertexShader}
          fragmentShader={UltraRealisticOceanShader.fragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Deep Ocean Bed Horizon Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -15, -20]}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial color="#020c17" />
      </mesh>
    </group>
  );
};
