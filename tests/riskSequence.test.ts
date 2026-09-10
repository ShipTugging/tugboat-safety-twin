import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion, Euler } from 'three';
import { measureImu } from '../src/dataset/imu';
import { generateRiskSequence, sequenceCsv, sequenceSvg, measureRopeAngles } from '../src/simulation/riskSequence';
import { computeSagMetrics, getTowlineAnchors } from '../src/simulation/towline';
import { createPhysicsState, stepMaritimePhysics } from '../src/simulation/physics';
import type { SimulationParams } from '../src/types/maritime';

const base:SimulationParams={tugSteeringAngle:0,towLineLength:40,shipSpeed:3,propellerRpm:0,cameraMode:'orbit',timeOfDay:'day',quickReleaseActive:true,soundEnabled:true,fogDensity:.002,towPosition:'astern',ropeSlackM:5};
test('actual heading to rope angle preserves obtuse directions and signed planar angle',()=>{
  for(const degrees of [0,30,90,135,180]) {
    const a=measureRopeAngles(new Vector3(Math.sin(degrees*Math.PI/180),0,Math.cos(degrees*Math.PI/180)),new Quaternion());
    assert.ok(Math.abs(a.angleDeg-degrees)<1e-8);
    assert.ok(Math.abs(a.planarAngleDeg-degrees)<1e-8);
    assert.ok(Math.abs(a.acuteAngleDeg-Math.min(degrees,180-degrees))<1e-8);
  }
  assert.ok(measureRopeAngles(new Vector3(-1,0,1),new Quaternion()).signedAngleDeg<0);
});
test('fixed clock, deterministic sequence and same physics integration state',()=>{
  const s=generateRiskSequence(base,'normal_to_girting_fast');
  assert.equal(s.frames.length,2001);assert.equal(s.frames[2000].timeSec,20);
  assert.deepEqual(s,generateRiskSequence(base,'normal_to_girting_fast'));
  const state=createPhysicsState();
  for(let i=-200;i<=2000;i++) {
    const frame=s.frames[Math.max(i,0)];
    const t=stepMaritimePhysics(frame.params,state,.01,60000+i*10);
    if(i>=0) {
      assert.deepEqual(t,frame.telemetry);
      assert.equal(frame.timeSec,i/100);
      assert.equal(frame.params.ropeSlackM,undefined);
      const {start,end}=getTowlineAnchors(t);
      const sag=computeSagMetrics(start,end,32,t.lineTensionKn,t.girtingStatus,undefined,frame.params.ropeSagOverrideM);
      assert.equal(sag.sagRatio,frame.sagRatio);
      if(i>0) assert.ok(Math.abs(frame.sagRatioRatePerSec-(frame.sagRatio-s.frames[i-1].sagRatio)*100)<1e-10);
    }
  }
});
test('steady stays safe, both transitions critical, fast produces larger causal sag response',()=>{
  const steady=generateRiskSequence(base,'normal_steady'),slow=generateRiskSequence(base,'normal_to_girting_slow'),fast=generateRiskSequence(base,'normal_to_girting_fast');
  assert.ok(steady.frames.every(f=>f.telemetry.girtingStatus==='SAFE'));
  for(const s of [slow,fast]) assert.equal(s.frames.at(-1)!.telemetry.girtingStatus,'CRITICAL');
  const peak=(s:typeof slow)=>Math.max(...s.frames.filter(f=>f.timeSec>=5).map(f=>Math.abs(f.sagRatioRatePerSec)));
  assert.ok(peak(fast)>peak(slow));
  assert.ok(Math.abs(steady.frames[0].rollRateDegS)<2);
  assert.ok(Math.abs(steady.frames[0].sagRatioRatePerSec)<.01);
});
test('CSV and SVG export all samples, units and finite measured values',()=>{
  const s=generateRiskSequence(base,'normal_to_girting_fast');
  const rows=sequenceCsv(s).trim().split('\n');
  assert.equal(rows.length,2002);
  assert.match(rows[0],/sag_ratio_rate_per_s/);assert.match(rows[0],/accel_body_x_mps2/);
  assert.ok(rows.every(r=>!r.includes('NaN')&&!r.includes('Infinity')));
  assert.match(sequenceSvg(s),/<svg/);assert.match(sequenceSvg(s),/polyline/);
});
test('IMU uses neighboring sequential poses and full-precision Euler roll',()=>{
  const s=generateRiskSequence(base,'normal_to_girting_fast');
  const pose=(i:number)=>({position:s.frames[i].telemetry.tugPosition,quaternion:new Quaternion().setFromEuler(new Euler(...s.frames[i].telemetry.tugRotation)).toArray() as [number,number,number,number]});
  for(const i of [1,500,550,600,1999]) {
    assert.deepEqual(s.frames[i].imu,measureImu(pose(i-1),pose(i),pose(i+1),.01));
    assert.ok(Math.abs(s.frames[i].rollDeg-s.frames[i].telemetry.tugRotation[2]*180/Math.PI)<1e-12);
    assert.ok(Math.abs(s.frames[i].angleRateDegS-(s.frames[i].angleDeg-s.frames[i-1].angleDeg)*100)<1e-9);
  }
});
test('all tow positions retain environment and show the expected faster response',()=>{
  for(const towPosition of ['astern','port','starboard','ahead'] as const) {
    const slow=generateRiskSequence({...base,towPosition},'normal_to_girting_slow');
    const fast=generateRiskSequence({...base,towPosition},'normal_to_girting_fast');
    const peak=(s:typeof slow)=>Math.max(...s.frames.filter(f=>f.timeSec>=5).map(f=>Math.abs(f.sagRatioRatePerSec)));
    assert.ok(peak(fast)>peak(slow));
    assert.equal(fast.frames.at(-1)!.params.towPosition,towPosition);
    assert.equal(fast.frames.at(-1)!.params.fogDensity,base.fogDensity);
  }
});
