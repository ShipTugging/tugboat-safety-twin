import * as THREE from 'three';
import type { TowPosition } from '../types/maritime';

const POSITION_CONFIG:Record<TowPosition,{chock:[number,number,number];outward:[number,number,number]}>= {
  astern:{chock:[3.5,2.6,-34],outward:[0,0,-1]},
  port:{chock:[-7,5,0],outward:[-1,0,0]},
  starboard:{chock:[7,5,0],outward:[1,0,0]},
  ahead:{chock:[0,6.8,32],outward:[0,0,1]},
};

export const TOW_POSITION_LABELS:Record<TowPosition,string>={astern:'선미',port:'좌현',starboard:'우현',ahead:'선수'};

export function getTugStaplePosition(tugPosition:[number,number,number],tugRotation:[number,number,number]):THREE.Vector3 {
  return new THREE.Vector3(0,2.8,3.2)
    .applyEuler(new THREE.Euler(...tugRotation))
    .add(new THREE.Vector3(...tugPosition));
}

export function getTowGeometry(position:TowPosition,steeringDeg:number,distance:number,shipPosition:[number,number,number],waterY:number) {
  const config=POSITION_CONFIG[position];
  const shipChock=new THREE.Vector3(...config.chock).add(new THREE.Vector3(...shipPosition));
  const steering=THREE.MathUtils.degToRad(steeringDeg);
  const outward=new THREE.Vector3(...config.outward);
  const tangent=new THREE.Vector3(-outward.z,0,outward.x);
  const towDistance=Math.max(10,distance);
  // Preserve the original astern trajectory: steering produces a broad
  // lateral swing while the longitudinal component remains close to length.
  const tugPosition=shipChock.clone()
    .addScaledVector(outward,Math.cos(steering*.7)*towDistance)
    .addScaledVector(tangent,Math.sin(steering)*towDistance*.85);
  tugPosition.y=waterY;
  const baseYaw=Math.atan2(-outward.x,-outward.z);
  const tugYaw=baseYaw+steering*.85;
  const tugStaple=getTugStaplePosition(tugPosition.toArray() as [number,number,number],[0,tugYaw,0]);
  return {
    shipChock:shipChock.toArray() as [number,number,number],
    tugPosition:tugPosition.toArray() as [number,number,number],
    tugStaple:tugStaple.toArray() as [number,number,number],
    tugYaw,
  };
}

export function nearestPointOnShipHull(x:number,z:number):[number,number] {
  let nearestX=THREE.MathUtils.clamp(x,-7,7);
  let nearestZ=THREE.MathUtils.clamp(z,-35,35);
  if(Math.abs(x)<=7&&Math.abs(z)<=35) {
    const candidates=[{d:7-x,x:7,z},{d:x+7,x:-7,z},{d:35-z,x,z:35},{d:z+35,x,z:-35}];
    const nearest=candidates.reduce((a,b)=>a.d<b.d?a:b);
    nearestX=nearest.x;nearestZ=nearest.z;
  }
  return [nearestX,nearestZ];
}

export function distanceFromShipHull(x:number,z:number):number {
  const [nearestX,nearestZ]=nearestPointOnShipHull(x,z);
  return Math.max(.5,Math.hypot(x-nearestX,z-nearestZ));
}
