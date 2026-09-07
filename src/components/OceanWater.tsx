import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TelemetryState, TimeOfDay } from '../types/maritime';

interface OceanWaterProps {
  showTacticalGrid?: boolean; timeOfDay?: TimeOfDay; telemetry: TelemetryState;
  shipSpeed: number; propellerRpm: number; highQuality: boolean;
  fogDensity?: number; sunIntensity?: number; waveStrength?: number; simulationTime?: number;
}
// Seeded periodic gradient noise avoids repeated wave bands and remains seamless.
function createWaterNormal() {
  const size = 256, data = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const fade = (t: number) => t*t*t*(t*(t*6-15)+10);
  const mix = (a: number, b: number, t: number) => a+(b-a)*t;
  const periodicNoise = (u: number, v: number, period: number) => {
    const ix = Math.floor(u), iy = Math.floor(v), fx = u-ix, fy = v-iy;
    const gradient = (x: number, y: number, dx: number, dy: number) => {
      const wrappedX = ((x % period)+period)%period, wrappedY = ((y % period)+period)%period;
      let seed = Math.imul(wrappedX+71, 374761393)^Math.imul(wrappedY+113, 668265263)^Math.imul(period, 1442695041);
      seed = Math.imul(seed^(seed>>>13), 1274126177);
      const angle = ((seed^(seed>>>16))>>>0)/4294967296*Math.PI*2;
      return Math.cos(angle)*dx+Math.sin(angle)*dy;
    };
    return mix(mix(gradient(ix,iy,fx,fy),gradient(ix+1,iy,fx-1,fy),fade(fx)),
      mix(gradient(ix,iy+1,fx,fy-1),gradient(ix+1,iy+1,fx-1,fy-1),fade(fx)),fade(fy));
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u=x/size, v=y/size;
    heights[y*size+x]=periodicNoise(u*5,v*5,5)*.7
      +periodicNoise(u*11+3.1,v*11+1.7,11)*.3
      +periodicNoise(u*23+7.3,v*23+2.9,23)*.12
      +periodicNoise(u*47+1.9,v*47+9.1,47)*.045;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*7;
    const dz=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*7;
    const n = new THREE.Vector3(-dx, -dz, 1).normalize(), i = (y*size+x)*4;
    data[i] = (n.x*.5+.5)*255; data[i+1] = (n.y*.5+.5)*255; data[i+2] = (n.z*.5+.5)*255; data[i+3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
const vertexShader = `
  uniform float uTime;
  uniform float uWaveStrength;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    p.y += uWaveStrength * (.09*sin(p.x*.23+p.z*.13-uTime*.8) + .055*sin(p.z*.42-p.x*.1-uTime*1.1));
    vWorld = (modelMatrix*vec4(p,1.)).xyz;
    gl_Position = projectionMatrix*viewMatrix*vec4(vWorld,1.);
  }
`;
const fragmentShader = `
  uniform float uTime, uNight, uSunset, uGrid, uSpeed, uRpm;
  uniform sampler2D uNormalMap;
  uniform float uFogDensity, uSunIntensity, uWaveStrength;
  uniform vec3 uFogColor;
  uniform vec3 uShip;
  uniform vec3 uTug;
  uniform float uYaw;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
  }
  float detail(vec2 p) {
    return noise(p)*.55 + noise(p*2.03)*.27 + noise(p*4.09)*.12 + noise(p*8.11)*.06;
  }
  void main() {
    vec2 p=vWorld.xz;
    vec2 uv=p*.95+vec2(uTime*.18,-uTime*.12);
    float a=detail(uv);
    mat2 turnA=mat2(.819,-.574,.574,.819);
    mat2 turnB=mat2(.391,.921,-.921,.391);
    vec2 drift=vec2(noise(p*.021+17.),noise(p*.019-31.))*.12;
    vec3 normalA=texture2D(uNormalMap,turnA*p*.017+drift+vec2(uTime*.007,-uTime*.005)).xyz*2.-1.;
    vec3 normalB=texture2D(uNormalMap,turnB*p*.043-drift*.7+vec2(-uTime*.011,uTime*.009)).xyz*2.-1.;
    vec2 slope=normalA.xy*turnA+normalB.xy*turnB*.55;
    vec3 n=normalize(vec3(slope.x*uWaveStrength,1.,slope.y*uWaveStrength));
    n.x += -.021*cos(p.x*.23+p.y*.13-uTime*.8)*uWaveStrength;
    n.z += -.023*cos(p.y*.42-p.x*.1-uTime*1.1)*uWaveStrength;
    n=normalize(n);
    vec3 eye=normalize(cameraPosition-vWorld);
    float fresnel=.025+.975*pow(1.-max(dot(eye,n),0.),5.);
    vec3 deep=mix(vec3(.025,.17,.19),vec3(.065,.12,.14),uSunset);
    deep=mix(deep,vec3(.006,.024,.048),uNight);
    vec3 sky=mix(vec3(.45,.64,.69),vec3(.72,.47,.32),uSunset);
    sky=mix(sky,vec3(.07,.12,.20),uNight);
    vec3 sun=normalize(mix(vec3(-.18,1.,.2),vec3(-.8,.2,.35),uSunset));
    sun=normalize(mix(sun,vec3(-.4,.7,.2),uNight));
    vec3 h=normalize(sun+eye);
    float spec=pow(max(dot(n,h),0.),180.)*.65 + pow(max(dot(n,h),0.),28.)*.055;
    vec3 sunColor=mix(vec3(1.,.91,.72),vec3(1.,.61,.32),uSunset);
    sunColor=mix(sunColor,vec3(.22,.38,.6),uNight);
    vec3 color=mix(deep*(.83+a*.4),sky,clamp(fresnel*.55,0.,1.)) + spec*sunColor*uSunIntensity*mix(1.,.12,uNight);

    // Foam lives on the same surface, avoiding coplanar transparent wake meshes.
    vec2 shipRel=p-uShip.xz;
    float aft=-36.-shipRel.y;
    float width=2.+max(aft,0.)*.17;
    float trail=(1.-smoothstep(width*.45,width,abs(shipRel.x)))*smoothstep(0.,4.,aft)*(1.-smoothstep(10.,65.,aft));
    float vArm=exp(-pow((abs(shipRel.x)-(2.+max(aft,0.)*.27))*.8,2.))*smoothstep(0.,4.,aft)*(1.-smoothstep(12.,65.,aft));
    vec2 rel=p-uTug.xz;
    vec2 local=vec2(cos(uYaw)*rel.x-sin(uYaw)*rel.y,sin(uYaw)*rel.x+cos(uYaw)*rel.y);
    float tugAft=-local.y-4.;
    float tugTrail=exp(-pow(local.x/(1.3+max(tugAft,0.)*.14),2.))*smoothstep(0.,2.,tugAft)*(1.-smoothstep(3.,22.,tugAft));
    float tugBow=exp(-pow((length(vec2(local.x, (local.y-3.8)*.6))-2.8)*2.,2.))*smoothstep(0.,3.,local.y);
    float foamGrain=smoothstep(.35,.8,detail(p*2.+vec2(0,uTime*.9)));
    float foam=(trail*step(45.,uRpm)*clamp(uRpm/120.,0.,1.)*.7 + vArm*uSpeed/14. + tugTrail*uSpeed/14. + tugBow*uSpeed/14.)*foamGrain;
    color=mix(color,mix(vec3(.72,.85,.82),vec3(.19,.29,.35),uNight),clamp(foam,0.,.72));
    if(uGrid>.5) {
      vec2 coord=p/10.;
      vec2 grid=abs(fract(coord-.5)-.5)/max(fwidth(coord),vec2(.001));
      float line=1.-min(min(grid.x,grid.y),1.);
      color=mix(color,vec3(.35,.67,.62),line*.14);
    }
    float fogDepth=-(viewMatrix*vec4(vWorld,1.)).z;
    float fog=1.-exp(-uFogDensity*uFogDensity*fogDepth*fogDepth);
    color=mix(color,uFogColor,clamp(fog,0.,1.));
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export function OceanWater({showTacticalGrid=false,timeOfDay='day',telemetry,shipSpeed,propellerRpm,highQuality,fogDensity=.0014,sunIntensity=1,waveStrength=1,simulationTime}:OceanWaterProps) {
  const mat=useRef<THREE.ShaderMaterial>(null);
  const geometry=useMemo(()=>new THREE.PlaneGeometry(1800,1800,highQuality?220:120,highQuality?220:120).rotateX(-Math.PI/2),[highQuality]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  const normalMap=useMemo(createWaterNormal,[]);
  useEffect(()=>()=>normalMap.dispose(),[normalMap]);
  const uniforms=useMemo(()=>({uTime:{value:0},uNight:{value:0},uSunset:{value:0},uGrid:{value:0},uSpeed:{value:0},uRpm:{value:0},uTug:{value:new THREE.Vector3()},uShip:{value:new THREE.Vector3()},uYaw:{value:0},uNormalMap:{value:normalMap},uFogDensity:{value:.0014},uFogColor:{value:new THREE.Color('#b7ccd1')},uSunIntensity:{value:1},uWaveStrength:{value:1}}),[normalMap]);
  useFrame(state=>{
    if(!mat.current) return;
    const u=mat.current.uniforms;
    u.uTime.value=simulationTime ?? state.clock.elapsedTime;
    u.uFogDensity.value=fogDensity; u.uSunIntensity.value=sunIntensity; u.uWaveStrength.value=waveStrength;
    u.uFogColor.value.set(timeOfDay==='night'?'#142236':timeOfDay==='sunset'?'#b99b85':'#b7ccd1');
    u.uShip.value.set(...telemetry.shipPosition);
    u.uNight.value=timeOfDay==='night'?1:0; u.uSunset.value=timeOfDay==='sunset'?1:0;
    u.uGrid.value=showTacticalGrid?1:0; u.uSpeed.value=shipSpeed; u.uRpm.value=propellerRpm;
    u.uTug.value.set(...telemetry.tugPosition); u.uYaw.value=telemetry.tugRotation[1];
  });
  return <mesh name="ocean-surface" geometry={geometry} position={[0,-.15,0]}><shaderMaterial ref={mat} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader}/></mesh>;
}
