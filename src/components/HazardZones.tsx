import React from 'react';
import { Line } from '@react-three/drei';
import { nearestPointOnShipHull } from '../simulation/towPosition';

interface HazardZonesProps {
  enabled:boolean;inWashZone:boolean;hullDistanceM:number;lineAngleDeg:number;
  tugPosition:[number,number,number];shipSpeed:number;propellerRpm:number;
}

export function HazardZones({enabled,inWashZone,hullDistanceM,tugPosition}:HazardZonesProps) {
  if(!enabled)return null;
  const [nearestX,nearestZ]=nearestPointOnShipHull(tugPosition[0],tugPosition[2]);
  const nearest:[number,number,number]=[nearestX,.5,nearestZ];
  return <group>
    {[5,9].map((distance,i)=><Line key={distance} points={[
      [-7-distance,.35,-35-distance],[7+distance,.35,-35-distance],
      [7+distance,.35,35+distance],[-7-distance,.35,35+distance],[-7-distance,.35,-35-distance]
    ]} color={i?'#91d9c9':'#e49a79'} lineWidth={1.5} dashed dashSize={2} gapSize={1.5} transparent opacity={.65}/>)}
    <Line points={[[-3,.35,-35],[-15.1,.35,-90],[15.1,.35,-90],[3,.35,-35]]} color={inWashZone?'#f5b675':'#a6c8c9'} lineWidth={1} dashed dashSize={2} gapSize={1.5} transparent opacity={.65}/>
    <Line points={[nearest,[tugPosition[0],.5,tugPosition[2]]]} color={hullDistanceM<=5?'#ff8576':'#a5ead8'} lineWidth={1.5}/>
    <mesh position={[tugPosition[0],.35,tugPosition[2]]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[8.7,8.8,80]}/><meshBasicMaterial color="#9dd8cb" transparent opacity={.5} depthWrite={false}/></mesh>
  </group>;
}
