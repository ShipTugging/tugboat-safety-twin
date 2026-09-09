import assert from 'node:assert/strict';
import test from 'node:test';
import { getTowGeometry, distanceFromShipHull, getTugStaplePosition } from '../src/simulation/towPosition';
import { getTowlineAnchors } from '../src/simulation/towline';
import { createPhysicsState, stepMaritimePhysics } from '../src/simulation/physics';
import type { SimulationParams } from '../src/types/maritime';
import { Vector3 } from 'three';

const round=(values:number[])=>values.map(value=>Math.abs(value)<1e-10?0:Math.round(value*1000)/1000);

test('four tow positions use the matching ship chock and place the tug outside the hull',()=>{
  const expected={
    astern:{anchor:[3.5,2.6,-34],tug:[3.5,.5,-66],yaw:0},
    port:{anchor:[-7,5,0],tug:[-39,.5,0],yaw:Math.PI/2},
    starboard:{anchor:[7,5,0],tug:[39,.5,0],yaw:-Math.PI/2},
    ahead:{anchor:[0,6.8,32],tug:[0,.5,64],yaw:Math.PI},
  } as const;
  for(const [position,value] of Object.entries(expected)) {
    const result=getTowGeometry(position as keyof typeof expected,0,32,[0,0,0],.5);
    assert.deepEqual(round(result.shipChock),round(value.anchor));
    assert.deepEqual(round(result.tugPosition),round(value.tug));
    assert.ok(Math.abs(Math.atan2(Math.sin(result.tugYaw-value.yaw),Math.cos(result.tugYaw-value.yaw)))<1e-10);
    assert.equal(distanceFromShipHull(result.tugPosition[0],result.tugPosition[2]),position==='astern'?31:position==='ahead'?29:32);
  }
});

test('steering swings around the selected chock and keeps bow staple aligned with tug yaw',()=>{
  for(const position of ['astern','port','starboard','ahead'] as const) {
    const result=getTowGeometry(position,35,26,[0,.1,0],.5);
    const horizontal=Math.hypot(result.tugPosition[0]-result.shipChock[0],result.tugPosition[2]-result.shipChock[2]);
    assert.ok(horizontal>20&&horizontal<30);
    const stapleDistance=Math.hypot(result.tugStaple[0]-result.tugPosition[0],result.tugStaple[2]-result.tugPosition[2]);
    assert.ok(Math.abs(stapleDistance-3.2)<1e-10);
  }
});

test('telemetry and rendered towline share the same fully transformed tug staple',()=>{
  const params:SimulationParams={tugSteeringAngle:68,towLineLength:26,shipSpeed:8.5,propellerRpm:60,cameraMode:'orbit',timeOfDay:'day',quickReleaseActive:false,soundEnabled:false,fogDensity:.0014,towPosition:'port'};
  const result=stepMaritimePhysics(params,createPhysicsState(),1/60,1200);
  const expected=getTugStaplePosition(result.tugPosition,result.tugRotation);
  assert.ok(new Vector3(...result.lineEndPoint).distanceTo(expected)<1e-10);
  assert.ok(getTowlineAnchors(result).end.distanceTo(expected)<1e-10);
});

test('ship distance is symmetric around bow, stern and both sides',()=>{
  assert.equal(distanceFromShipHull(0,-45),10);
  assert.equal(distanceFromShipHull(0,45),10);
  assert.equal(distanceFromShipHull(-17,0),10);
  assert.equal(distanceFromShipHull(17,0),10);
  assert.ok(Math.abs(distanceFromShipHull(10,38)-Math.sqrt(18))<1e-12);
});

test('side and bow operations update physics anchors and stay outside stern wash',()=>{
  const base:SimulationParams={tugSteeringAngle:0,towLineLength:20,shipSpeed:6,propellerRpm:115,cameraMode:'orbit',timeOfDay:'day',quickReleaseActive:false,soundEnabled:false,fogDensity:.0014};
  const anchors={port:[-7,5,0],starboard:[7,5,0],ahead:[0,6.8,32]} as const;
  for(const position of ['port','starboard','ahead'] as const) {
    const result=stepMaritimePhysics({...base,towPosition:position},createPhysicsState(),1/60,0);
    assert.deepEqual(round(result.lineStartPoint),anchors[position]);
    assert.equal(result.inWashZone,false);
    assert.ok(result.hullDistanceM>=17);
  }
});
