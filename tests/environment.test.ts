import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom, randomizeEnvironment } from '../src/dataset/environment';
import { getTowlineState, createTowlineCurve } from '../src/simulation/towline';
import { Vector3 } from 'three';

test('same seed recreates the randomized environment sequence within operating limits', () => {
  const a=seededRandom(1234), b=seededRandom(1234);
  const modes=new Set(), times=new Set();
  for(let i=0;i<100;i++) {
    const sample=randomizeEnvironment(a,i);
    assert.deepEqual(sample,randomizeEnvironment(b,i));
    assert.ok(sample.fogDensity>=.0002 && sample.fogDensity<=.015);
    assert.ok(sample.towLineLength>=18 && sample.towLineLength<=55);
    assert.ok(Math.abs(sample.tugSteeringAngle)<=85);
    assert.equal(sample.quickReleaseActive,false);
    modes.add(sample.cameraMode); times.add(sample.timeOfDay);
  }
  assert.equal(modes.size,3); assert.equal(times.size,3);
});
test('taut threshold is shared by geometry and labels, with zero-length guards', () => {
  assert.equal(getTowlineState(319,'SAFE'),'slack');
  assert.equal(getTowlineState(320,'SAFE'),'taut');
  assert.equal(getTowlineState(200,'CRITICAL'),'taut');
  const a=new Vector3(0,4,0), b=new Vector3(0,4,30);
  const taut=createTowlineCurve(a,b,35,500,'CRITICAL');
  const slack=createTowlineCurve(a,b,35,100,'SAFE');
  assert.ok(taut.getPoint(.5).y>3.9);
  assert.ok(slack.getPoint(.5).y<2);
  assert.ok(createTowlineCurve(a,b,50,100,'SAFE').getPoint(.5).y<slack.getPoint(.5).y);
  assert.ok(slack.getPoint(0).distanceTo(a)<1e-10);
  assert.ok(slack.getPoint(1).distanceTo(b)<1e-10);
  assert.ok(createTowlineCurve(a,a,0,0,'SAFE').getPoints(16).every(p=>p.toArray().every(Number.isFinite)));
});
