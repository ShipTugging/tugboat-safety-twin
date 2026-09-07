import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TelemetryState, TimeOfDay } from '../types/maritime';

interface OceanWaterProps {
  showTacticalGrid?: boolean; timeOfDay?: TimeOfDay; telemetry: TelemetryState;
  shipSpeed: number; propellerRpm: number; highQuality: boolean;
}
const vertexShader = `
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    p.y += .09*sin(p.x*.23+p.z*.13-uTime*.8) + .055*sin(p.z*.42-p.x*.1-uTime*1.1);
    vWorld = (modelMatrix*vec4(p,1.)).xyz;
    gl_Position = projectionMatrix*viewMatrix*vec4(vWorld,1.);
  }
`;
const fragmentShader = `
  uniform float uTime, uNight, uSunset, uGrid, uSpeed, uRpm;
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
    float dx=detail(uv+vec2(.12,0))-a;
    float dz=detail(uv+vec2(0,.12))-a;
    vec3 n=normalize(vec3(-dx*2.2,1.,-dz*2.2));
    n.x += -.021*cos(p.x*.23+p.y*.13-uTime*.8);
    n.z += -.023*cos(p.y*.42-p.x*.1-uTime*1.1);
    n=normalize(n);
    vec3 eye=normalize(cameraPosition-vWorld);
    float fresnel=.025+.975*pow(1.-max(dot(eye,n),0.),5.);
    vec3 deep=mix(vec3(.025,.17,.19),vec3(.065,.12,.14),uSunset);
    deep=mix(deep,vec3(.006,.024,.048),uNight);
    vec3 sky=mix(vec3(.45,.64,.69),vec3(.72,.47,.32),uSunset);
    sky=mix(sky,vec3(.07,.12,.20),uNight);
    vec3 sun=normalize(mix(vec3(-.65,.55,.25),vec3(-.8,.2,.35),uSunset));
    sun=normalize(mix(sun,vec3(-.4,.7,.2),uNight));
    vec3 h=normalize(sun+eye);
    float spec=pow(max(dot(n,h),0.),180.)*.65 + pow(max(dot(n,h),0.),28.)*.055;
    vec3 sunColor=mix(vec3(1.,.91,.72),vec3(1.,.61,.32),uSunset);
    sunColor=mix(sunColor,vec3(.22,.38,.6),uNight);
    vec3 color=mix(deep*(.83+a*.4),sky,clamp(fresnel*.55,0.,1.)) + spec*sunColor;

    // Foam lives on the same surface, avoiding coplanar transparent wake meshes.
    float aft=-36.-p.y;
    float width=2.+max(aft,0.)*.17;
    float trail=(1.-smoothstep(width*.45,width,abs(p.x)))*smoothstep(0.,4.,aft)*(1.-smoothstep(10.,65.,aft));
    float vArm=exp(-pow((abs(p.x)-(2.+max(aft,0.)*.27))*.8,2.))*smoothstep(0.,4.,aft)*(1.-smoothstep(12.,65.,aft));
    vec2 rel=p-uTug.xz;
    vec2 local=vec2(cos(uYaw)*rel.x-sin(uYaw)*rel.y,sin(uYaw)*rel.x+cos(uYaw)*rel.y);
    float tugAft=-local.y-4.;
    float tugTrail=exp(-pow(local.x/(1.3+max(tugAft,0.)*.14),2.))*smoothstep(0.,2.,tugAft)*(1.-smoothstep(3.,22.,tugAft));
    float tugBow=exp(-pow((length(vec2(local.x, (local.y-3.8)*.6))-2.8)*2.,2.))*smoothstep(0.,3.,local.y);
    float foamGrain=smoothstep(.35,.8,detail(p*2.+vec2(0,uTime*.9)));
    float foam=(trail*clamp(uRpm/120.,0.,1.)*.7 + vArm*uSpeed/14. + tugTrail*uSpeed/14. + tugBow*uSpeed/14.)*foamGrain;
    color=mix(color,mix(vec3(.72,.85,.82),vec3(.19,.29,.35),uNight),clamp(foam,0.,.72));
    if(uGrid>.5) {
      vec2 coord=p/10.;
      vec2 grid=abs(fract(coord-.5)-.5)/max(fwidth(coord),vec2(.001));
      float line=1.-min(min(grid.x,grid.y),1.);
      color=mix(color,vec3(.35,.67,.62),line*.14);
    }
    float fog=1.-exp(-length(cameraPosition-vWorld)*.0014);
    color=mix(color,sky*.8,clamp(fog,0.,.85));
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export function OceanWater({showTacticalGrid=false,timeOfDay='day',telemetry,shipSpeed,propellerRpm,highQuality}:OceanWaterProps) {
  const mat=useRef<THREE.ShaderMaterial>(null);
  const geometry=useMemo(()=>new THREE.PlaneGeometry(1800,1800,highQuality?220:120,highQuality?220:120).rotateX(-Math.PI/2),[highQuality]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  const uniforms=useMemo(()=>({uTime:{value:0},uNight:{value:0},uSunset:{value:0},uGrid:{value:0},uSpeed:{value:0},uRpm:{value:0},uTug:{value:new THREE.Vector3()},uYaw:{value:0}}),[]);
  useFrame(state=>{
    if(!mat.current) return;
    const u=mat.current.uniforms;
    u.uTime.value=state.clock.elapsedTime;
    u.uNight.value=timeOfDay==='night'?1:0; u.uSunset.value=timeOfDay==='sunset'?1:0;
    u.uGrid.value=showTacticalGrid?1:0; u.uSpeed.value=shipSpeed; u.uRpm.value=propellerRpm;
    u.uTug.value.set(...telemetry.tugPosition); u.uYaw.value=telemetry.tugRotation[1];
  });
  return <mesh geometry={geometry} position={[0,-.15,0]}><shaderMaterial ref={mat} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader}/></mesh>;
}
