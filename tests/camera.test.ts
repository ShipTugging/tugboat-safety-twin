import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { applyDatasetCamera } from '../src/dataset/camera';
import { randomizeEnvironment, seededRandom } from '../src/dataset/environment';
import { settlePhysics } from '../src/simulation/physics';

test('bridge CCTV is 80 degrees and export projection cannot mutate the live camera',()=>{
  const live=new PerspectiveCamera(43,1.8,.3,1800);
  live.position.set(20,50,-100);live.lookAt(0,0,0);live.updateMatrixWorld();
  const before=live.toJSON();
  const sample=randomizeEnvironment(seededRandom(3),2);
  const capture=new PerspectiveCamera();
  applyDatasetCamera(capture,sample,settlePhysics(sample,60000),16/9);
  assert.equal(capture.fov,80);
  assert.equal(capture.aspect,16/9);
  assert.deepEqual(live.toJSON(),before);
  assert.ok(capture.position.toArray().every(Number.isFinite));
  assert.ok(Math.abs(capture.up.length()-1)<1e-10);
});
test('deck CCTV follows the heeled tug and environment camera is reproducible',()=>{
  const sample=randomizeEnvironment(seededRandom(3),1);
  const t=settlePhysics(sample,60000);
  const a=new PerspectiveCamera(), b=new PerspectiveCamera();
  applyDatasetCamera(a,sample,t,16/9);applyDatasetCamera(b,sample,t,16/9);
  assert.deepEqual(a.position.toArray(),b.position.toArray());
  assert.deepEqual(a.quaternion.toArray(),b.quaternion.toArray());
  assert.ok(Math.abs(a.up.x)>.1,'camera must bank with the tug roll');
});
