import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { randomizeSagScene,applySagTarget } from '../src/dataset/sagScene';
import { seededRandom } from '../src/dataset/environment';
import { settlePhysics } from '../src/simulation/physics';
import { createTowlineCurve,computeSagMetrics,getTowlineAnchors } from '../src/simulation/towline';
import { applyDatasetCamera } from '../src/dataset/camera';
import { resolveCapturePosition } from '../src/dataset/position';

test('current, explicit and mixed selection resolve without coupling position to Sag level',()=>{
  assert.equal(resolveCapturePosition('current','port',0),'port');
  assert.equal(resolveCapturePosition('ahead','port',0),'ahead');
  const combinations=new Set();
  for(let i=0;i<20;i++)combinations.add(`${resolveCapturePosition('all','astern',i)}:${i%5}`);
  assert.equal(combinations.size,20);
});
for(const position of ['astern','port','starboard','ahead'] as const) test(`${position}: all Sag levels and full curve remain in frame`,()=>{
  const random=seededRandom(1043);
  for(let i=0;i<50;i++) {
    const base=randomizeSagScene(random,i,position);
    assert.equal(base.towPosition,position);
    const t=settlePhysics(base,60000+i*1000);
    const p=applySagTarget(base,t,i,random);
    const {start,end}=getTowlineAnchors(t);
    const sag=computeSagMetrics(start,end,p.towLineLength,t.lineTensionKn,t.girtingStatus,p.ropeSlackM);
    assert.equal(sag.level,i%5,`${position} frame ${i}`);
    const camera=new PerspectiveCamera();applyDatasetCamera(camera,p,t,16/9);
    const curve=createTowlineCurve(start,end,p.towLineLength,t.lineTensionKn,t.girtingStatus,p.ropeSlackM);
    for(const point of curve.getPoints(32)) {
      const projected=point.project(camera);
      assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z>=-1&&projected.z<=1,`${position} frame ${i} outside camera`);
    }
  }
});
