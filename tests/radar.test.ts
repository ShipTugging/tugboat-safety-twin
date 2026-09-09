import assert from 'node:assert/strict';
import test from 'node:test';
import { worldToRadarPoint } from '../src/simulation/radar';

test('radar maps every world tow chock instead of using the legacy stern constant',()=>{
  assert.deepEqual(worldToRadarPoint([-7,5,0],140,80,1),[133,80]);
  assert.deepEqual(worldToRadarPoint([7,5,0],140,80,1),[147,80]);
  assert.deepEqual(worldToRadarPoint([0,6.8,32],140,80,1),[140,48]);
  assert.deepEqual(worldToRadarPoint([3.5,2.6,-34],140,80,1),[143.5,114]);
});
