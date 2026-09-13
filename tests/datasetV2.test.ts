import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {applyV2Camera,makeParent,makeReplacement,makeVariant,planParents,seedForSlot,v2Config,validateV2Config} from '../src/dataset/v2/scenarios';
import {requiredCoverage,stratifyParents,variantConditions} from '../src/dataset/v2/split';
import {generateV2} from '../src/dataset/v2/export';
import type {V2Capture,V2Metadata} from '../src/dataset/v2/capture';

test('V2 splits parents, keeps variants together, and separates sample/base seeds',()=>{
  const plan=planParents(v2Config);
  assert.deepEqual(planParents(v2Config),plan);
  assert.deepEqual(['train','val','test'].map(s=>plan.filter(p=>p.split===s).length),[42,12,6]);
  assert.deepEqual(['astern','port','starboard','ahead'].map(s=>plan.filter(p=>p.towPosition===s).length),[15,15,15,15]);
  assert.deepEqual([0,1,2,3,4].map(s=>plan.filter(p=>p.sagBin===s).length),[12,12,12,12,12]);
  const sampleSeeds=new Set<number>(),ids=new Set<string>(),times=new Map<string,Set<number>>();
  for(const p of plan)for(let attempt=0;attempt<2;attempt++) {
    const parent=makeParent(v2Config,p,attempt);
    for(let variant=0;variant<2;variant++) {
      const a=makeVariant(v2Config,p,attempt,variant,'run-a',parent),b=makeVariant(v2Config,p,attempt,variant,'run-a',parent);
      assert.deepEqual(a,b);assert.equal(a.v2!.split,p.split);assert.ok(!sampleSeeds.has(a.v2!.scenarioSeed));sampleSeeds.add(a.v2!.scenarioSeed);
      assert.ok(!ids.has(a.v2!.scenarioId));ids.add(a.v2!.scenarioId);assert.equal(a.v2!.parentSeed,parent.parentSeed);
      if(!times.has(a.v2!.parentScenarioId))times.set(a.v2!.parentScenarioId,new Set());
      if(attempt===0)times.get(a.v2!.parentScenarioId)!.add(a.time);
    }
  }
  assert.ok([...times.values()].every(s=>s.size===1));
  assert.equal(new Set(Array.from({length:10000},(_,i)=>seedForSlot(v2Config.seed,i))).size,10000);
});
test('V2 camera does not enlarge requested FOV and positive-only generation guards remain strict',()=>{
  const p=planParents(v2Config)[0],sample=makeVariant(v2Config,p,0,0,'test',makeParent(v2Config,p,0));
  sample.params.cameraFov=58;
  const camera=new PerspectiveCamera();applyV2Camera(camera,sample);
  assert.equal(camera.fov,58);assert.ok(camera.position.toArray().every(Number.isFinite));
  assert.throws(()=>validateV2Config({...v2Config,datasetSize:5002}),/datasetSize/);
  assert.throws(()=>validateV2Config({...v2Config,validation:{...v2Config.validation,minimumPolygonIou:.9}}),/IoU/);
});
test('a failed second variant discards the whole attempt and exhausted runs remain incomplete',async()=>{
  const c={...structuredClone(v2Config),datasetSize:40,maxAttemptsPerScenario:2},saved=new Map<string,string>();
  let checks=0;
  const capture=async(sample:any):Promise<V2Capture>=>({rgb:'data:image/png;base64,AA==',mask:'data:image/png;base64,AA==',metadata:{
    sampleId:sample.id,split:sample.v2.split,scenarioSeed:sample.v2.scenarioSeed,scenario_id:sample.v2.scenarioId,parent_scenario_id:sample.v2.parentScenarioId,generation_run_id:'run',sagBin:sample.v2.targetSagBin,targetSagBin:sample.v2.targetSagBin,
    paths:{image:`images/${sample.index}.png`,mask:`masks/${sample.index}.png`,metadata:`metadata/${sample.index}.json`},validation:{maskPixels:100,visibleFraction:1,inFrameFraction:1,projectedChordPixels:100},
    environment:{},towline:{sag:{}},simulator:{},camera:{},attempt:sample.v2.attempt,variant:sample.v2.variant} as unknown as V2Metadata});
  await generateV2(c,'run',capture,async()=>({ok:++checks!==2,reason:'unsupported topology'}),async(p,d)=>{saved.set(p,d);},new AbortController().signal);
  assert.equal(saved.get('generation_manifest.json')&&JSON.parse(saved.get('generation_manifest.json')!).status,'complete');
  assert.equal(JSON.parse(saved.get('metadata/0.json')!).attempt,1);
  assert.equal(JSON.parse(saved.get('metadata/1.json')!).attempt,1);
  assert.equal(JSON.parse(saved.get('rejection_log.json')!).length,1);
  const failed=new Map<string,string>();
  await assert.rejects(generateV2({...c,maxParentReplacements:0},'run',capture,async()=>({ok:false,reason:'hole'}),async(p,d)=>{failed.set(p,d);},new AbortController().signal),/Parent replacement limit reached/);
  assert.equal(JSON.parse(failed.get('generation_manifest.json')!).status,'incomplete');
  assert.ok(![...failed.keys()].some(p=>p.startsWith('images/')));
});

test('port L0 negative parent is replaced deterministically without changing categorical constraints',async()=>{
  const base={...planParents(v2Config).find(p=>p.towPosition==='port'&&p.sagBin===0&&p.steeringSign<0)!};
  const replacement=makeReplacement({...v2Config,datasetSize:40},base,'run',1,1,{failedParentId:'run:parent:321',failedAttempts:20,failureReasons:['insufficient geometrically visible centerline']});
  assert.notEqual(replacement.parentScenarioId,'run:parent:321');assert.equal(replacement.replacementOf,'run:parent:321');
  assert.equal(replacement.split,base.split);assert.equal(replacement.towPosition,'port');assert.equal(replacement.sagBin,0);assert.equal(replacement.steeringSign,-1);
  assert.deepEqual(replacement,makeReplacement({...v2Config,datasetSize:40},base,'run',1,1,{failedParentId:'run:parent:321',failedAttempts:20,failureReasons:['insufficient geometrically visible centerline']}));
  const same=makeReplacement({...v2Config,datasetSize:40},base,'run',2,2,{failedParentId:replacement.parentScenarioId!,failedAttempts:20,failureReasons:['tiny']});
  assert.notEqual(same.parentScenarioId,replacement.parentScenarioId);assert.notEqual(same.replacementSeed,replacement.replacementSeed);
});

test('a parent exhausting twenty attempts is replaced and linked in metadata',async()=>{
  const c={...structuredClone(v2Config),datasetSize:40,maxParentReplacements:1},saved=new Map<string,string>();let checks=0;
  const capture=async(sample:any):Promise<V2Capture>=>({rgb:'data:image/png;base64,AA==',mask:'data:image/png;base64,AA==',metadata:{sampleId:sample.id,split:sample.v2.split,scenarioSeed:sample.v2.scenarioSeed,scenario_id:sample.v2.scenarioId,parent_scenario_id:sample.v2.parentScenarioId,generation_run_id:'run',sagBin:sample.v2.targetSagBin,targetSagBin:sample.v2.targetSagBin,paths:{image:`images/${sample.index}.png`,mask:`masks/${sample.index}.png`,metadata:`metadata/${sample.index}.json`},validation:{maskPixels:100,visibleFraction:1,inFrameFraction:1,projectedChordPixels:100},environment:{},towline:{sag:{}},simulator:{},camera:{},attempt:sample.v2.attempt,variant:sample.v2.variant,replacement:sample.v2.replacementOf?{failed_parent_id:sample.v2.replacementOf,replacement_parent_id:sample.v2.parentScenarioId,failed_attempts:sample.v2.replacementFailure.failedAttempts,failure_reasons:sample.v2.replacementFailure.failureReasons,replacement_seed:sample.v2.replacementSeed}:null} as unknown as V2Metadata});
  await generateV2(c,'run',capture,async()=>({ok:++checks>20,reason:'forced failure'}),async(p,d)=>{saved.set(p,d);},new AbortController().signal);
  const links=JSON.parse(saved.get('replacement_log.json')!);assert.equal(links.length,1);assert.equal(links[0].failed_attempts,20);assert.notEqual(links[0].failed_parent_id,links[0].replacement_parent_id);
  const replacementMeta=[...saved.entries()].find(([path,data])=>path.startsWith('metadata/')&&JSON.parse(data).replacement);
  assert.ok(replacementMeta);const linked=JSON.parse(replacementMeta![1]).replacement;assert.equal(linked.failed_attempts,20);assert.equal(linked.failed_parent_id,links[0].failed_parent_id);assert.equal(JSON.parse(saved.get('generation_manifest.json')!).status,'complete');
});

function checkCoverage(plan:ReturnType<typeof planParents>) {
  const seen=new Map<number,string>();
  for(const p of plan){assert.ok(!seen.has(p.index));seen.set(p.index,p.split);}
  for(const split of ['train','val','test']) {
    const observed:Record<string,Set<string>>=Object.fromEntries(Object.keys(requiredCoverage).map(k=>[k,new Set<string>()]));
    for(const p of plan.filter(p=>p.split===split))for(let variant=0;variant<2;variant++) {
      const c=variantConditions(p.index,variant);
      observed.tow_position.add(p.towPosition);observed.sag_bin.add(`L${p.sagBin}`);
      observed.time_of_day.add(c.timeOfDay);observed.lens_condition.add(c.lens);
      observed.steering_direction.add(p.steeringSign>0?'positive':'negative');
    }
    for(const [key,values] of Object.entries(requiredCoverage))assert.deepEqual([...observed[key]].sort(),[...values].sort(),`${split}/${key}`);
  }
}
test('stratification covers all required marginals across seeds and generation sizes',()=>{
  for(const datasetSize of [38,40,60,100,120,200,5000])for(const seed of [0,1,2043,4294967295]) {
    const config={...v2Config,datasetSize,seed},plan=planParents(config);checkCoverage(plan);
    assert.equal(plan.length,datasetSize/2);assert.deepEqual(planParents(config),plan);
    if(datasetSize===5000)assert.deepEqual(['train','val','test'].map(s=>plan.filter(p=>p.split===s).length*2),[3500,1000,500]);
  }
  const small=planParents({...v2Config,datasetSize:40});
  assert.deepEqual(['train','val','test'].map(s=>small.filter(p=>p.split===s).length),[10,5,5]);
});
test('unavailable coverage fails with category and eligible parent count',()=>{
  assert.throws(()=>planParents({...v2Config,datasetSize:36}),/sag_bin:L4: only 2 eligible parents/);
  assert.throws(()=>planParents({...v2Config,datasetSize:10}),/sag_bin:L4: only 0 eligible parents/);
  const parents=planParents(v2Config).map(({split,...p})=>({...p,towPosition:'astern' as const}));
  assert.throws(()=>stratifyParents(parents,{train:42,val:12,test:6},2043),/tow_position:port: only 0 eligible parents/);
});
test('split assignment and run IDs do not alter scene randomness',()=>{
  const p=planParents(v2Config)[0],parent=makeParent(v2Config,p,0);
  const a=makeVariant(v2Config,p,0,0,'run-a',parent),b=makeVariant(v2Config,{...p,split:'test'},0,0,'run-b',parent);
  assert.deepEqual(a.params,b.params);assert.deepEqual(a.telemetry,b.telemetry);
  assert.equal(a.v2!.scenarioSeed,b.v2!.scenarioSeed);assert.notEqual(a.v2!.generationRunId,b.v2!.generationRunId);
});

test('coverage outranks ratios when parent condition combinations require extra capacity',()=>{
  // Four Sag-specific astern parents plus three side/ahead parents are required.
  const parents=Array.from({length:30},(_,index)=>({index,towPosition:(index%10<5?'astern':['port','starboard','ahead'][(index%10-5)%3]) as any,sagBin:index%10<5?index%10:0,steeringSign:index%2?1:-1}));
  const plan=stratifyParents(parents,{train:20,val:5,test:5},2043);
  checkCoverage(plan);
  assert.ok(plan.filter(p=>p.split==='val').length>=7);
  assert.ok(plan.filter(p=>p.split==='test').length>=7);
  assert.equal(plan.length,30);
});
