import React from 'react';
import { Sky } from '@react-three/drei';
import { OceanWater } from './OceanWater';
import { TelemetryState, TimeOfDay } from '../types/maritime';

interface Props {
  showTacticalGrid?:boolean; timeOfDay?:TimeOfDay; telemetry:TelemetryState;
  shipSpeed:number; propellerRpm:number; highQuality:boolean;
}
function Crane({x,z}:{x:number;z:number}) {
  return <group position={[x,2,z]}>
    {[-7,7].map(side=><group key={side}><mesh position={[side,16,0]}><boxGeometry args={[1.3,32,1.5]}/><meshStandardMaterial color="#758887" roughness={.8}/></mesh><mesh position={[side,8,6]} rotation={[.35,0,0]}><boxGeometry args={[1,18,1]}/><meshStandardMaterial color="#758887"/></mesh></group>)}
    <mesh position={[0,32,9]}><boxGeometry args={[18,2,44]}/><meshStandardMaterial color="#8d9b97" roughness={.8}/></mesh>
    <mesh position={[0,39,-7]}><boxGeometry args={[1.2,14,1.2]}/><meshStandardMaterial color="#8d9b97"/></mesh>
    <mesh position={[0,23,23]}><boxGeometry args={[.12,18,.12]}/><meshStandardMaterial color="#4a5b5d"/></mesh>
    <mesh position={[0,14,23]}><boxGeometry args={[9,.7,2]}/><meshStandardMaterial color="#a6aaa0"/></mesh>
  </group>;
}
export function HarborEnvironment({showTacticalGrid,timeOfDay='day',telemetry,shipSpeed,propellerRpm,highQuality}:Props) {
  const night=timeOfDay==='night', sunset=timeOfDay==='sunset';
  const sun:[number,number,number]=night?[-80,140,40]:sunset?[-160,40,70]:[-130,110,50];
  return <>
    <color attach="background" args={[night?'#111e31':sunset?'#b99b85':'#b7ccd1']}/>
    <fog attach="fog" args={[night?'#142236':sunset?'#b99b85':'#b7ccd1',180,650]}/>
    {!night && <Sky distance={450000} sunPosition={sun} turbidity={sunset?5:3} rayleigh={sunset?1.5:.65} mieCoefficient={.006} mieDirectionalG={.8}/>}
    <hemisphereLight args={[night?'#6c8bab':'#d5e9e9',night?'#101b22':'#526e69',night?.9:1.7]}/>
    <directionalLight position={sun} intensity={night?.8:sunset?2.1:2.7} color={night?'#a2bad9':sunset?'#ffd4a1':'#fff1d7'} castShadow={highQuality} shadow-mapSize={[2048,2048]} shadow-camera-left={-85} shadow-camera-right={85} shadow-camera-top={85} shadow-camera-bottom={-85} shadow-camera-near={10} shadow-camera-far={350} shadow-bias={-.0003} shadow-normalBias={.15}/>
    <directionalLight position={[65,45,-100]} intensity={night?.35:1.6} color={night?'#6f9bc3':'#d2e3e5'}/>
    <OceanWater showTacticalGrid={showTacticalGrid} timeOfDay={timeOfDay} telemetry={telemetry} shipSpeed={shipSpeed} propellerRpm={propellerRpm} highQuality={highQuality}/>
    <group position={[0,0,175]}>
      <mesh position={[0,1,35]} receiveShadow><boxGeometry args={[520,5,70]}/><meshStandardMaterial color="#687570" roughness={.95}/></mesh>
      <mesh position={[0,3.7,2]}><boxGeometry args={[520,.35,1.1]}/><meshStandardMaterial color="#c2bca3"/></mesh>
      {[-190,-125,-60,10,80,150,220].map((x,i)=><Crane key={x} x={x} z={5+(i%2)*9}/>)}
      {Array.from({length:28},(_,i)=><mesh key={i} position={[-240+i*18,6+(i%3)*1.2,43+(i%2)*15]}><boxGeometry args={[15,6+(i%3)*2.4,12]}/><meshStandardMaterial color={['#6f8582','#956f57','#637b86','#a39b7f'][i%4]} roughness={.9}/></mesh>)}
      {[-200,-140,-80,-20,40,100,160,220].map(x=><group key={x} position={[x,0,0]}><mesh position={[0,8,-1]}><cylinderGeometry args={[.18,.23,16,6]}/><meshStandardMaterial color="#637276"/></mesh><mesh position={[0,16,-1]}><boxGeometry args={[2,.35,1]}/><meshStandardMaterial color="#ece6cf" emissive="#ffcc82" emissiveIntensity={night?3:0}/></mesh></group>)}
    </group>
    {[-45,52].map((x,i)=><group key={x} position={[x,0,-25]}>
      <mesh position={[0,.45,0]}><cylinderGeometry args={[.65,1.1,1.8,12]}/><meshStandardMaterial color={i?'#497e68':'#b94f3b'} roughness={.55}/></mesh>
      <mesh position={[0,2,0]}><cylinderGeometry args={[.18,.25,2,8]}/><meshStandardMaterial color={i?'#497e68':'#b94f3b'}/></mesh>
      <mesh position={[0,3.1,0]}><sphereGeometry args={[.17,8,8]}/><meshStandardMaterial color="#ead5a6" emissive={i?'#65bc8d':'#e47a55'} emissiveIntensity={night?4:.2}/></mesh>
    </group>)}
  </>;
}
