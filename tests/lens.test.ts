import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/dataset/environment';
import { randomizeLens, createDroplets } from '../src/dataset/lens';
test('lens modes have reproducible bounded blur and wetness with clear controls',()=>{
  for(const mode of ['mixed','clear','blurred','wet'] as const) {
    const a=seededRandom(1043), b=seededRandom(1043);
    const conditions=new Set();
    for(let i=0;i<100;i++) {
      const lens=randomizeLens(a,mode);assert.deepEqual(lens,randomizeLens(b,mode));
      conditions.add(lens.lensCondition);
      assert.ok(lens.imageBlurPx>=0&&lens.imageBlurPx<=4);
      assert.ok(lens.lensWetness>=0&&lens.lensWetness<=1);
      if(mode==='clear'){assert.equal(lens.imageBlurPx,0);assert.equal(lens.lensWetness,0);}
      if(mode==='wet')assert.ok(lens.lensWetness>0);
    }
    assert.equal(conditions.size,mode==='mixed'?3:1);
  }
});
test('droplet geometry is fixed per seed and never changes image coordinates',()=>{
  assert.deepEqual(createDroplets(12,.8),createDroplets(12,.8));
  assert.equal(createDroplets(12,0).length,0);
  for(const p of createDroplets(12,1))assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&p.radius>0&&p.radius<.08);
});
