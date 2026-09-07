import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { addFrame, addManifest, frameName } from '../src/dataset/archive';

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
