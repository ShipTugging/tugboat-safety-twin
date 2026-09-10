import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackFrameIndex } from '../src/simulation/playback';
test('first RAF timestamp can precede start; clamp to frame zero and final frame',()=>{
  assert.equal(playbackFrameIndex(-.02,100,2001),0);
  assert.equal(playbackFrameIndex(0,100,2001),0);
  assert.equal(playbackFrameIndex(1.25,100,2001),125);
  assert.equal(playbackFrameIndex(99,100,2001),2000);
});
