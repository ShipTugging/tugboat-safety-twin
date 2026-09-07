import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { SAG_LEVEL_THRESHOLDS, classifySagLevel, computeSagMetrics, createTowlineCurve, getTowlineAnchors, solveRopeSlack } from '../src/simulation/towline';
import { applySagTarget, randomizeSagScene, targetRatioForLevel } from '../src/dataset/sagScene';
import { seededRandom } from '../src/dataset/environment';
import { settlePhysics } from '../src/simulation/physics';
import { applyDatasetCamera } from '../src/dataset/camera';
import { boxToPolygon, estimateSag2D, formatYoloSegLabel, projectRopeSegmentation } from '../src/dataset/segmentation';

const a=new Vector3(0,4,0), b=new Vector3(0,4,30);

test('sag level bands are contiguous and monotone',()=>{
  assert.equal(classifySagLevel(0),0);
  assert.equal(classifySagLevel(-1),0);
  assert.equal(classifySagLevel(NaN),0);
  for(let i=0;i<SAG_LEVEL_THRESHOLDS.length;i++) {
    assert.equal(classifySagLevel(SAG_LEVEL_THRESHOLDS[i]-1e-9),i);
    assert.equal(classifySagLevel(SAG_LEVEL_THRESHOLDS[i]),i+1);
  }
  assert.equal(classifySagLevel(1),4);
});

test('metrics describe the rendered curve: taut is straight, slack pays out into sag, never below the water cap',()=>{
  const taut=computeSagMetrics(a,b,35,500,'CRITICAL');
  assert.equal(taut.sagM,0);assert.equal(taut.level,0);
  const slack=computeSagMetrics(a,b,35,100,'SAFE');
  const curve=createTowlineCurve(a,b,35,100,'SAFE');
  assert.ok(Math.abs((4-curve.getPoint(.5).y)-slack.sagM)<1e-9,'curve midpoint dips by sagM');
  assert.ok(Math.abs(slack.sagRatio-slack.sagM/30)<1e-12);
  const more=computeSagMetrics(a,b,35,100,'SAFE',20);
  assert.ok(more.sagM>slack.sagM);
  assert.ok(more.sagM<=5.5,'soft cap keeps the rope near the surface');
  assert.ok(computeSagMetrics(a,b,35,100,'SAFE',1e6).sagM<=5.5);
  assert.ok(computeSagMetrics(a,b,35,100,'SAFE',0).sagM===0,'zero excess renders straight');
  assert.ok(computeSagMetrics(a,b,32,100,'SAFE').sagM===0,'live chord within staple reach renders straight');
  assert.equal(computeSagMetrics(a,a,0,0,'SAFE').sagRatio,0);
});

test('solveRopeSlack reproduces the requested ratio and returns null for taut lines',()=>{
  for(const target of [.003,.012,.03,.05,.08]) {
    const slack=solveRopeSlack(a,b,120,'SAFE',target)!;
    assert.ok(slack!==null&&slack>=0);
    const metrics=computeSagMetrics(a,b,20,120,'SAFE',slack);
    assert.ok(Math.abs(metrics.sagRatio-target)<1e-6,`${metrics.sagRatio} != ${target}`);
    assert.equal(metrics.level,classifySagLevel(target));
  }
  assert.equal(solveRopeSlack(a,b,400,'SAFE',.05),null);
  assert.equal(solveRopeSlack(a,b,100,'CRITICAL',.05),null);
  assert.equal(solveRopeSlack(a,b,100,'SAFE',5),null,'beyond the water cap');
  const clamped=solveRopeSlack(a,b,100,'SAFE',5,true)!;
  assert.ok(clamped>0&&computeSagMetrics(a,b,20,100,'SAFE',clamped).level===4,'clamped target lands at the deepest reachable sag');
});

for(const seed of [77,2026,31337]) test(`sag scene randomizer (seed ${seed}) is reproducible, fixed to the tug camera and hits every target level`,()=>{
  const r1=seededRandom(seed), r2=seededRandom(seed);
  const levels=new Map<number,number>();
  for(let index=0;index<150;index++) {
    const base=randomizeSagScene(r1,index);
    assert.deepEqual(base,randomizeSagScene(r2,index));
    assert.equal(base.cameraMode,'TUG_SAG_CAM');
    assert.ok(base.towLineLength>=16&&base.towLineLength<=40);
    assert.ok(base.ropeRadius!>=.06&&base.ropeRadius!<=.13);
    assert.ok(/^#[0-9a-f]{6}$/i.test(base.ropeColor!)&&/^#[0-9a-f]{6}$/i.test(base.hullColor!));
    const telemetry=settlePhysics(base,60000+index*1000);
    const params=applySagTarget(base,telemetry,index,r1);
    applySagTarget(base,telemetry,index,r2);
    const {start,end}=getTowlineAnchors(telemetry);
    const metrics=computeSagMetrics(start,end,params.towLineLength,telemetry.lineTensionKn,telemetry.girtingStatus,params.ropeSlackM);
    const target=index%5;
    if(target>0) assert.equal(metrics.level,target,`index ${index}: level ${metrics.level} != target ${target} (tension ${telemetry.lineTensionKn})`);
    else assert.equal(metrics.level,0);
    levels.set(metrics.level,(levels.get(metrics.level)??0)+1);
  }
  assert.equal(levels.size,5);
  for(let level=0;level<5;level++) assert.ok(Math.abs(targetRatioForLevel(level,()=>.5)-(level===0?.003:0))>=0);
});

test('TUG_SAG_CAM keeps the whole towline inside the frame with the mount on the tug',()=>{
  const random=seededRandom(5);
  for(let index=0;index<40;index++) {
    const base=randomizeSagScene(random,index);
    const telemetry=settlePhysics(base,60000);
    const params=applySagTarget(base,telemetry,index,random);
    const camera=new PerspectiveCamera();
    applyDatasetCamera(camera,params,telemetry,16/9);
    const {start,end}=getTowlineAnchors(telemetry);
    for(const point of [start,end]) {
      const ndc=point.clone().project(camera);
      assert.ok(Math.abs(ndc.x)<.97&&Math.abs(ndc.y)<.97&&ndc.z<1,`anchor ${point.toArray()} outside frame ${ndc.toArray()}`);
    }
    assert.ok(camera.position.distanceTo(new Vector3(...telemetry.tugPosition))<9,'camera is mounted on the tug');
  }
});

test('rope segmentation projects a closed silhouette whose 2D sag matches the geometry',()=>{
  const camera=new PerspectiveCamera(60,16/9,.15,1800);
  camera.position.set(15,6,15);camera.lookAt(0,2,15);camera.updateMatrixWorld(true);
  const start=new Vector3(0,4,0), end=new Vector3(0,4,30);
  const straight=projectRopeSegmentation(createTowlineCurve(start,end,30,500,'CRITICAL'),.1,camera,960,540);
  assert.equal(straight.polygons.length,1);
  assert.ok(straight.polygons[0].length>=6);
  for(const [x,y] of straight.polygons[0]) assert.ok(x>=0&&x<=1&&y>=0&&y<=1);
  assert.equal(straight.visibleFraction,1);
  const flat=estimateSag2D(straight.centerline)!;
  assert.ok(flat.ratio<.002,`straight rope should read as flat, got ${flat.ratio}`);
  const curve=createTowlineCurve(start,end,30,100,'SAFE',6);
  const sagging=projectRopeSegmentation(curve,.1,camera,960,540);
  const image=estimateSag2D(sagging.centerline)!;
  assert.ok(image.ratio>flat.ratio+.02,'sagging rope must deviate from the chord in image space');
  // Occlusion in the middle splits the rope into two polygons.
  const split=projectRopeSegmentation(curve,.1,camera,960,540,(_,index)=>index<20||index>44);
  assert.equal(split.polygons.length,2);
  assert.ok(split.visibleFraction<1);
  // Rope entirely behind the camera yields no polygons.
  camera.lookAt(30,2,15);camera.updateMatrixWorld(true);
  assert.equal(projectRopeSegmentation(curve,.1,camera,960,540).polygons.length,0);
});

test('YOLO-Seg label formatting validates class range and vertices',()=>{
  const polygon=boxToPolygon({xCenter:.5,yCenter:.5,width:.2,height:.1});
  assert.equal(formatYoloSegLabel(5,polygon),'5 0.400000 0.450000 0.600000 0.450000 0.600000 0.550000 0.400000 0.550000');
  assert.throws(()=>formatYoloSegLabel(6,polygon));
  assert.throws(()=>formatYoloSegLabel(0,[[0,0],[1,1]]));
  assert.throws(()=>formatYoloSegLabel(0,[[0,0],[1.5,1],[1,1]]));
  assert.equal(estimateSag2D([{x:0,y:0}]),null);
  assert.equal(estimateSag2D([{x:1,y:1},{x:1,y:1}]),null);
});
