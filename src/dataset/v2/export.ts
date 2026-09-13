import { makeParent, makeReplacement, makeVariant, parentScenarioId, planParents, V2_VERSION, type ParentPlan, type V2Config } from './scenarios';
import type { V2Capture, V2Metadata } from './capture';
import type { CaptureSample } from '../types';

export type V2Sink=(path:string,data:string,encoding:'base64'|'utf8')=>Promise<void>;
export interface MaskCheck {ok:boolean;reason?:string;iou?:number;resampled_iou?:number;polygons?:number;fn?:number;fp?:number;repaired_contours?:number}
export interface Rejection {parent_scenario_id:string;attempt:number;scenario_seed:number;variant?:number;reasons:string[]}
export const v2CsvColumns=['sample_id','split','scenario_seed','scenario_id','parent_scenario_id','generation_run_id','image_path','mask_path','metadata_path','tow_position','sag_bin','target_sag_bin','sag_ratio_3d','sag_m','towline_length_m','rope_radius_m','rope_color','steering_deg','ship_speed_kn','rpm','camera_fov','time_of_day','fog_density','wave_strength','lens_condition','blur_px','wetness','mask_pixels','visible_fraction','in_frame_fraction','projected_chord_pixels'];
export function v2CsvRow(m:V2Metadata) {
  const e=m.environment,t=m.towline,v=m.validation,s=m.simulator;
  return [m.sampleId,m.split,m.scenarioSeed,m.scenario_id,m.parent_scenario_id,m.generation_run_id,m.paths.image,m.paths.mask,m.paths.metadata,e.towPosition,m.sagBin,m.targetSagBin,t.sag.sagRatio,t.sag.sagM,t.nominalLengthM,t.radius,t.color,s.steeringAngleDeg,s.shipSpeedKn,s.propellerRpm,m.camera.fov,e.timeOfDay,e.fogDensity,e.waveStrength,e.lensCondition,e.blurPx,e.lensWetness,v.maskPixels,v.visibleFraction,v.inFrameFraction,v.projectedChordPixels].join(',');
}
export function acceptanceReasons(m:V2Metadata,c:V2Config):string[] {
  const v=m.validation,t=c.validation,reasons:string[]=[];
  if(v.maskPixels<t.minMaskPixels)reasons.push('empty or tiny positive mask');
  if(v.visibleFraction<t.minVisibleFraction)reasons.push('insufficient geometrically visible centerline');
  if(v.inFrameFraction<t.minInFrameFraction)reasons.push('insufficient centerline in frame');
  if(!Number.isFinite(v.projectedChordPixels)||v.projectedChordPixels<t.minProjectedChordPixels)reasons.push('insufficient projected towline span');
  if(m.sagBin!==m.targetSagBin)reasons.push('target sag bin unreachable at sampled tension/span');
  return reasons;
}
export async function generateV2(c:V2Config,runId:string,capture:(sample:CaptureSample)=>Promise<V2Capture>,checkMask:(png:string,minimumIou:number)=>Promise<MaskCheck>,write:V2Sink,signal:AbortSignal) {
  const plan=planParents(c),rows=[v2CsvColumns.join(',')],rejections:Rejection[]=[],replacements:unknown[]=[],frames:V2Metadata[]=[];
  let replacementOrdinal=0;
  const splitCounts={train:0,val:0,test:0};let status='incomplete';const startedAt=new Date().toISOString();
  const manifest=()=>({generatorVersion:V2_VERSION,configuration:c,generation_run_id:runId,master_seed:c.seed,classes:{0:'towline'},status,startedAt,finishedAt:new Date().toISOString(),generatedSamples:frames.length,splitCounts,
    parentScenarioCounts:Object.fromEntries(['train','val','test'].map(split=>[split,new Set(frames.filter(f=>f.split===split).map(f=>f.parent_scenario_id)).size])),
    rejectedAttempts:rejections.length,replacements:replacements.length,splitPolicy:'Parent scenarios stratified for marginal condition coverage before capture; all variants/retries and replacements stay in their parent split. No image-level resplit.',labelPolicy:'Binary visible-towline PNG is source of truth. No twin YOLO polygons; use the existing Python converter with IoU >= .98.'});
  const json=(path:string,value:unknown)=>write(path,JSON.stringify(value,null,2)+'\n','utf8');
  await json('generation_manifest.json',manifest());
  try {
    for(const planned of plan) {
      let p:ParentPlan=planned,replacementNumber=0;
      let accepted=false;
      while(!accepted) {
        const failedAttempts:number[]=[];const failureReasons=new Set<string>();
        for(let attempt=0;attempt<c.maxAttemptsPerScenario;attempt++) {
          signal.throwIfAborted();
          const parent=makeParent(c,p,attempt),pending:V2Capture[]=[];
          for(let variant=0;variant<c.variantsPerScenario;variant++) {
            signal.throwIfAborted();
            const sample=makeVariant(c,p,attempt,variant,runId,parent);
            const frame=await capture(sample),reasons=acceptanceReasons(frame.metadata,c);
            let conversion:MaskCheck|undefined;
            if(!reasons.length){conversion=await checkMask(frame.mask,c.validation.minimumPolygonIou);if(!conversion.ok)reasons.push(`mask-to-polygon: ${conversion.reason}`);}
            if(reasons.length){rejections.push({parent_scenario_id:sample.v2!.parentScenarioId,attempt,scenario_seed:sample.v2!.scenarioSeed,variant,reasons});reasons.forEach(reason=>failureReasons.add(reason));break;}
            pending.push({...frame,metadata:{...frame.metadata,annotationCheck:conversion} as V2Metadata});
          }
          if(pending.length!==c.variantsPerScenario){failedAttempts.push(attempt);continue;}
          for(const f of pending) {
            signal.throwIfAborted();
            await write(f.metadata.paths.image,f.rgb.split(',')[1],'base64');
            await write(f.metadata.paths.mask,f.mask.split(',')[1],'base64');
            await json(f.metadata.paths.metadata,f.metadata);
            frames.push(f.metadata);splitCounts[p.split]++;rows.push(v2CsvRow(f.metadata));
          }
          accepted=true;break;
        }
        if(accepted)break;
        const failedParentId=parentScenarioId(runId,p),failedAttemptsCount=c.maxAttemptsPerScenario;
        if(replacementNumber>=3||replacementOrdinal>=c.maxParentReplacements)
          throw new Error(`Parent replacement limit reached for ${p.split}/${p.towPosition}/L${p.sagBin}/${p.steeringSign>0?'positive':'negative'}: failed_parent_id=${failedParentId}, failed_attempts=${failedAttemptsCount}, replacements=${replacementNumber}, reasons=${[...failureReasons].join(' | ')}`);
        replacementNumber++;replacementOrdinal++;
        const failure={failedParentId,failedAttempts:failedAttemptsCount,failureReasons:[...failureReasons]};
        p=makeReplacement(c,p,runId,replacementNumber,replacementOrdinal,failure);
        replacements.push({failed_parent_id:failedParentId,replacement_parent_id:p.parentScenarioId,failed_attempts:failedAttemptsCount,failure_reasons:[...failureReasons],replacement_seed:p.replacementSeed,replacement_number:replacementNumber,split:p.split,tow_position:p.towPosition,sag_bin:p.sagBin,steering_direction:p.steeringSign>0?'positive':'negative'});
      }
    }
    status='complete';
  } finally {
    await write('dataset_summary.csv',rows.join('\n')+'\n','utf8');
    await json('rejection_log.json',rejections);
    await json('replacement_log.json',replacements);
    await json('generation_manifest.json',manifest());
  }
  return manifest();
}
