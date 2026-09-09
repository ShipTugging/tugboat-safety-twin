import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { measureImu, createSyncedImu } from '../src/dataset/imu';
import { randomizeSagScene } from '../src/dataset/sagScene';
import { seededRandom } from '../src/dataset/environment';
import { settlePhysics } from '../src/simulation/physics';

const pose=(x=0,y=0,z=0,q=new Quaternion())=>({position:[x,y,z] as [number,number,number],quaternion:q.toArray() as [number,number,number,number]});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('stationary IMU reports gravity specific force and zero gyro',()=>{
  const r=measureImu(pose(),pose(),pose(),.01);
  r.gyroscopeRadS.forEach(v=>close(v,0));
  r.linearAccelerationWorldMps2.forEach(v=>close(v,0));
  close(r.accelerometerMps2[0],0);close(r.accelerometerMps2[1],9.80665);close(r.accelerometerMps2[2],0);
});
test('accelerometer rotates world specific force into the actual sensor body frame',()=>{
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);
  const r=measureImu(pose(.0001,0,0,q),pose(0,0,0,q),pose(.0001,0,0,q),.01);
  close(r.linearAccelerationWorldMps2[0],2);
  close(r.accelerometerMps2[0],9.80665);close(r.accelerometerMps2[1],-2);
});
test('gyro uses quaternion rotation without a wrap spike at 180 degrees',()=>{
  const q=(angle:number)=>new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle);
  const r=measureImu(pose(0,0,0,q(Math.PI-.02)),pose(0,0,0,q(Math.PI)),pose(0,0,0,q(Math.PI+.02)),.01);
  close(r.gyroscopeRadS[0],0);close(r.gyroscopeRadS[1],2);close(r.gyroscopeRadS[2],0);
});
test('IMU window ends exactly at image simulation time, with independent deterministic samples',()=>{
  const params=randomizeSagScene(seededRandom(1043),3,'starboard');
  const telemetry=settlePhysics(params,73456.789);
  const record=createSyncedImu('frame_0004',params,telemetry);
  assert.equal(record.frameId,'frame_0004');assert.equal(record.timestampMs,telemetry.timestamp);
  assert.equal(record.samples.length,21);assert.equal(record.sampleRateHz,100);
  assert.deepEqual(record.sample,record.samples.at(-1));
  record.samples.forEach((s,i)=>{close(s.timestampMs,telemetry.timestamp-200+i*10);assert.equal(s.offsetMs,-200+i*10);});
  close(record.sample.orientationEulerDeg[0],telemetry.tugRotation[0]*180/Math.PI);
  close(record.sample.orientationEulerDeg[1],telemetry.tugRotation[1]*180/Math.PI);
  close(record.sample.orientationEulerDeg[2],telemetry.tugRotation[2]*180/Math.PI);
  assert.deepEqual(record,createSyncedImu('frame_0004',params,telemetry));
  assert.ok(record.samples.every(s=>[...s.accelerometerMps2,...s.gyroscopeRadS].every(Number.isFinite)));
});
