import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getFoamConfig } from '../simulation/foam';

interface Props {
  shipPosition: [number, number, number];
  propellerRpm: number;
  simulationTime?: number;
  fogDensity?: number;
  fogColor?: string;
}

export function SternFoam({ shipPosition, propellerRpm, simulationTime, fogDensity = .0014, fogColor = '#b7ccd1' }: Props) {
  const drawingSize=useMemo(()=>new THREE.Vector2(),[]);
  const resources = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(new Float32Array(160), 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: .4 }, uScale: { value: 500 }, uFogDensity: { value: .0014 }, uFogColor: { value: new THREE.Color(fogColor) } },
      vertexShader: `attribute float opacity; varying float vOpacity; varying float vDepth;
        uniform float uSize, uScale;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); vOpacity = opacity; vDepth = -mv.z;
          gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uScale / max(1., -mv.z); }`,
      fragmentShader: `varying float vOpacity; varying float vDepth; uniform float uFogDensity; uniform vec3 uFogColor;
        void main() { float r = length(gl_PointCoord - .5) * 2.; float alpha = (1. - smoothstep(.1, 1., r)) * vOpacity;
          if(alpha < .005) discard; float fog = 1. - exp(-uFogDensity*uFogDensity*vDepth*vDepth);
          gl_FragColor = vec4(mix(vec3(1.), uFogColor, fog), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geometry, material };
  }, []);
  useEffect(() => () => { resources.geometry.dispose(); resources.material.dispose(); }, [resources]);
  useFrame(state => {
    const config = getFoamConfig(propellerRpm);
    const time = simulationTime ?? state.clock.elapsedTime;
    const position = resources.geometry.getAttribute('position') as THREE.BufferAttribute;
    const opacity = resources.geometry.getAttribute('opacity') as THREE.BufferAttribute;
    resources.geometry.setDrawRange(0, config.count);
    resources.material.uniforms.uSize.value = config.size;
    resources.material.uniforms.uFogDensity.value = fogDensity;
    resources.material.uniforms.uFogColor.value.set(fogColor);
    for (let i = 0; i < config.count; i++) {
      const age = ((time + i / config.emissionRate) % config.lifetime + config.lifetime) % config.lifetime;
      const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      const spread = (seed - Math.floor(seed)) * 2 - 1;
      position.setXYZ(i, spread * (.8 + age * .75), .2 + Math.sin(age * 2.5 + i) * .07, -age * 4.5);
      opacity.setX(i, .65 * Math.min(1, age * 5 + .2) * (1 - age / config.lifetime));
    }
    position.needsUpdate = true;
    opacity.needsUpdate = true;
  });
  return <points position={[shipPosition[0], shipPosition[1], shipPosition[2] - 37.4]} geometry={resources.geometry} material={resources.material} frustumCulled={false} onBeforeRender={(renderer,_scene,camera)=>{
    renderer.getDrawingBufferSize(drawingSize);
    resources.material.uniforms.uScale.value=drawingSize.y*camera.projectionMatrix.elements[5]*.5;
  }}/>;
}
