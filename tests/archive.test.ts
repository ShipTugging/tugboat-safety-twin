import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { addFrame, addManifest, frameName, frameMetadata } from '../src/dataset/archive';
import { randomizeSagScene } from '../src/dataset/sagScene';
import { seededRandom } from '../src/dataset/environment';
import { settlePhysics } from '../src/simulation/physics';
import type { DatasetKind } from '../src/dataset/types';

test('ZIP stores JPEG binary and matching normalized YOLO paths, including empty negatives',async()=>{
  const zip=new JSZip();
  const jpeg='data:image/jpeg;base64,/9j/2Q==';
  const camera={position:[0,0,10],quaternion:[0,0,0,1],fov:80,aspect:16/9,near:.15,far:1800};
  addFrame(zip,0,{jpeg,camera,labels:[{classId:1,box:{xCenter:.5,yCenter:.4,width:.2,height:.1}}]});
  addFrame(zip,1,{jpeg,camera,labels:[]});
  addManifest(zip,1043,[]);
  const loaded=await JSZip.loadAsync(await zip.generateAsync({type:'uint8array'}));
  assert.deepEqual([...await loaded.file('images/frame_0001.jpg')!.async('uint8array')],[255,216,255,217]);
  assert.equal((await loaded.file('labels/frame_0001.txt')!.async('string')).trim(),'1 0.500000 0.400000 0.200000 0.100000');
  assert.equal((await loaded.file('labels/frame_0002.txt')!.async('string')).trim(),'');
  assert.equal((await loaded.file('classes.txt')!.async('string')).trim().split('\n').length,4);
  assert.equal(frameName(99),'frame_0100');
});

for(const kind of ['sag','detection'] as DatasetKind[])test(`${kind} ZIP pairs every image with exact-time IMU JSON and CSV`,async()=>{
  const zip=new JSZip();
  const params=randomizeSagScene(seededRandom(1043),3,'ahead');
  const telemetry=settlePhysics(params,78901.234);
  const frame={jpeg:'data:image/jpeg;base64,/9j/2Q==',labels:[],camera:{position:[0,0,10],quaternion:[0,0,0,1],fov:80,aspect:16/9,near:.15,far:1800}};
  const metadata=frameMetadata({id:'test:0',index:0,kind,params,telemetry,time:telemetry.timestamp/1000,width:960,height:540},frame);
  addFrame(zip,0,frame,kind);addManifest(zip,1043,[metadata],kind);
  const loaded=await JSZip.loadAsync(await zip.generateAsync({type:'uint8array'}));
  const manifest=JSON.parse(await loaded.file('metadata.json')!.async('string'));
  const record=JSON.parse(await loaded.file('imu/frame_0001.json')!.async('string'));
  assert.equal(record.image,'images/frame_0001.jpg');assert.equal(record.label,'labels/frame_0001.txt');
  assert.equal(record.frameId,manifest.frames[0].frameId);
  assert.equal(record.timestampMs,telemetry.timestamp);
  assert.equal(record.sample.timestampMs,telemetry.timestamp);
  assert.deepEqual(record.sample,record.samples.at(-1));
  assert.deepEqual(record.sample,manifest.frames[0].imu);
  assert.equal(manifest.frames[0].imuFile,'imu/frame_0001.json');
  assert.ok(!('imuRecord' in manifest.frames[0]),'full windows belong in their linked file');
  const paired=(await loaded.file('imu.csv')!.async('string')).trim().split('\n');
  const windows=(await loaded.file('imu_windows.csv')!.async('string')).trim().split('\n');
  assert.equal(paired.length,2);assert.equal(windows.length,22);
  assert.equal(Number(paired[1].split(',')[6]),telemetry.timestamp);
  assert.equal(Number(windows.at(-1)!.split(',')[6]),telemetry.timestamp);
  assert.equal(Number(windows.at(-1)!.split(',')[7]),0);
});
