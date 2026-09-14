import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Quaternion } from 'three';
import { RECORDING_CLOCK, generateRecording, recordingImuCsv, recordingParamsAt, recordingPose,
  recordingScenario, recordingTimestampMs, validateRecordingConfig } from '../src/simulation/recording';
import { createPhysicsState, stepMaritimePhysics } from '../src/simulation/physics';
import { measureImu } from '../src/dataset/imu';
import { v2Config, makeParent, makeVariant, planParents } from '../src/dataset/v2/scenarios';

const config = {sessionId:'run-test',sequenceId:'recording-test',durationSec:20,seed:2043};
const close = (a:number,b:number,tolerance=1e-9) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);

test('recording 20-second half-open clock gives 480 camera and 2000 IMU samples', () => {
  const r = generateRecording(config);
  assert.equal(RECORDING_CLOCK.simulationHz,600);
  assert.equal(r.camera.length,480); assert.equal(r.imu.length,2000);
  assert.equal(r.camera[0].sidecar.timestamp_ms,0); assert.equal(r.imu[0].row.timestamp_ms,0);
  assert.equal(r.imu.at(-1)!.row.timestamp_ms,19990);
  r.camera.forEach((f,i) => {
    assert.equal(f.tick,i*25); assert.equal(f.sidecar.frame_index,i);
    assert.equal(f.sidecar.timestamp_ms,i/24*1000);
    close(f.sample.telemetry.timestamp,f.sidecar.timestamp_ms);
    assert.ok(f.sidecar.timestamp_ms>=0 && f.sidecar.timestamp_ms<20000);
    if(i) close(f.sidecar.timestamp_ms-r.camera[i-1].sidecar.timestamp_ms,1000/24);
  });
  r.imu.forEach((f,i) => { assert.equal(f.tick,i*6); assert.equal(f.row.timestamp_ms,i*10); });
});

test('recording two-second smoke uses the same scenario prefix and exact sample grids', () => {
  const short=generateRecording({...config,durationSec:2}), full=generateRecording(config);
  assert.equal(short.camera.length,48); assert.equal(short.imu.length,200);
  assert.deepEqual(short.camera,full.camera.slice(0,48));
  assert.deepEqual(short.imu,full.imu.slice(0,200));
});

test('recording is reproducible with no wall-clock dependence; seed controls its schedule', () => {
  const originalNow=Date.now;
  try {
    Date.now=()=>{throw new Error('Wall clock must not drive recording');};
    assert.deepEqual(generateRecording(config),generateRecording(config));
    assert.notDeepEqual(generateRecording({...config,seed:2044}).imu,generateRecording(config).imu);
  } finally {Date.now=originalNow;}
});

test('camera and IMU at shared ticks reference the identical underlying telemetry', () => {
  const r=generateRecording(config), imuByTick=new Map(r.imu.map(f=>[f.tick,f]));
  let shared=0;
  for(const camera of r.camera) {
    const imu=imuByTick.get(camera.tick);
    if(!imu)continue;
    shared++; assert.equal(camera.sample.telemetry,imu.telemetry);
    assert.equal(camera.sidecar.timestamp_ms,imu.row.timestamp_ms);
    assert.deepEqual(camera.sidecar.position_world_m,imu.telemetry.tugPosition);
  }
  assert.equal(shared,80);
});

test('all sensor samples including endpoints derive from one continuous 600 Hz state', () => {
  const r=generateRecording(config), state=createPhysicsState(), poses=new Map<number,ReturnType<typeof stepMaritimePhysics>>();
  for(let tick=-1200;tick<=12000;tick++) {
    const t=recordingTimestampMs(tick);
    const telemetry=stepMaritimePhysics(recordingParamsAt(r.session.scenario,t/1000),state,1/600,t);
    if(tick%6===0)poses.set(tick,telemetry);
  }
  for(const {tick,telemetry,row} of r.imu) {
    assert.deepEqual(telemetry,poses.get(tick));
    const m=measureImu(recordingPose(poses.get(tick-6)!),recordingPose(telemetry),recordingPose(poses.get(tick+6)!),.01);
    assert.deepEqual([row.ax_mps2,row.ay_mps2,row.az_mps2],m.accelerometerMps2);
    assert.deepEqual([row.gx_rad_s,row.gy_rad_s,row.gz_rad_s],m.gyroscopeRadS);
  }
});

test('recording retains full precision Euler XYZ pitch/yaw/roll mapping', () => {
  const r=generateRecording({...config,durationSec:2});
  for(const {telemetry,row} of r.imu) {
    assert.equal(row.pitch_deg,telemetry.tugRotation[0]*180/Math.PI);
    assert.equal(row.yaw_deg,telemetry.tugRotation[1]*180/Math.PI);
    assert.equal(row.roll_deg,telemetry.tugRotation[2]*180/Math.PI);
    assert.deepEqual(recordingPose(telemetry).quaternion,new Quaternion().setFromEuler(new Euler(...telemetry.tugRotation)).toArray());
  }
  assert.ok(r.imu.some(f=>f.row.pitch_deg!==f.telemetry.imuPitchDeg));
});

test('recording uses existing specific force and quaternion angular velocity convention', () => {
  const telemetry=generateRecording({...config,durationSec:1}).imu[0].telemetry;
  const pose=(x:number,yaw:number)=>recordingPose({...telemetry,tugPosition:[x,0,0],tugRotation:[0,yaw,0]});
  const rest=measureImu(pose(0,0),pose(0,0),pose(0,0),.01);
  assert.deepEqual(rest.accelerometerMps2,[0,9.80665,0]); assert.deepEqual(rest.gyroscopeRadS,[0,0,0]);
  const moving=measureImu(pose(.0001,-.02),pose(0,0),pose(.0001,.02),.01);
  close(moving.accelerometerMps2[0],2); close(moving.gyroscopeRadS[1],2);
});

test('recording cannot mutate live integration memory or V2 scene generation', () => {
  const scenario=recordingScenario(2043), params=scenario.initialParams;
  const live=createPhysicsState(); stepMaritimePhysics(params,live,1/60,0);
  const before={...live}, c=structuredClone(v2Config), p=planParents(c)[0];
  const variant=()=>makeVariant(c,p,0,0,'isolation',makeParent(c,p,0));
  const original=variant(); generateRecording(config);
  assert.deepEqual(live,before); assert.deepEqual(variant(),original); assert.deepEqual(c,v2Config);
});

test('scenario uses only a smooth existing parameter schedule and visibly changes pose', () => {
  const r=generateRecording(config), s=r.session.scenario;
  assert.equal(recordingParamsAt(s,0).towLineLength,36);
  assert.equal(recordingParamsAt(s,10).towLineLength,20);
  assert.equal(recordingParamsAt(s,19).towLineLength,36);
  assert.notDeepEqual(r.camera[0].sample.telemetry.tugPosition,r.camera[240].sample.telemetry.tugPosition);
  assert.equal(s.initialParams.ropeSagOverrideM,undefined);
  assert.equal(s.initialParams.ropeSlackM,undefined);
});

test('recording boundary, paths and standardized CSV exclude geometry/risk features', () => {
  const r=generateRecording({...config,durationSec:2}), csv=recordingImuCsv(r.imu);
  const rows=csv.trim().split('\n'); assert.equal(rows.length,201);
  assert.equal(rows[0],'timestamp_ms,ax_mps2,ay_mps2,az_mps2,gx_rad_s,gy_rad_s,gz_rad_s,roll_deg,pitch_deg,yaw_deg,sequence_id');
  assert.ok(rows.slice(1).every(row=>row.endsWith(',recording-test')));
  const exported=JSON.stringify({session:r.session,camera:r.camera.map(f=>f.sidecar),csv});
  assert.doesNotMatch(exported,/sag_ratio|towline_angle_deg|curvature|girtingRisk/);
  assert.ok(r.camera.every(f=>!f.sample.v2 && f.sample.id.startsWith('video:recording:')));
  assert.equal(r.camera.at(-1)!.sidecar.image_path,'frames/frame_000047.jpg');
});

test('recording IDs do not change the physical timeline', () => {
  const a=generateRecording(config), b=generateRecording({...config,sessionId:'other',sequenceId:'other'});
  assert.deepEqual(a.camera.map(f=>f.sample.telemetry),b.camera.map(f=>f.sample.telemetry));
  assert.deepEqual(a.imu.map(f=>{const {sequence_id,...values}=f.row;return values;}),
    b.imu.map(f=>{const {sequence_id,...values}=f.row;return values;}));
});

test('invalid recording configuration fails before any generation', () => {
  for(const patch of [{durationSec:0},{durationSec:21},{durationSec:1.5},{seed:NaN},{seed:-1},
    {seed:2**32},{sessionId:''},{sessionId:'../escape'},{sequenceId:'a,b'}, {sessionId:undefined}])
    assert.throws(()=>validateRecordingConfig({...config,...patch} as typeof config));
});
