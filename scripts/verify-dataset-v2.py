#!/usr/bin/env python3
"""Audit V2 source, strict derived labels and the real YOLO-Seg data loader.

This never loads weights or trains a model. Outputs JSON/Markdown and sample grids.
"""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tugboat-safety_model'))
import numpy as np
from PIL import Image, ImageDraw
from utils.common import configure_runtime, read_mask, require, sha256, green_overlay, write_json
from utils.dataset import prepared_dataset
from utils.polygons import mask_to_labels


REQUIRED_COVERAGE = {
    'tow_position': ('astern', 'port', 'starboard', 'ahead'),
    'sag_bin': (0, 1, 2, 3, 4),
    'time_of_day': ('day', 'sunset', 'night'),
    'lens_condition': ('clear', 'blurred', 'wet'),
    'steering_direction': ('positive', 'negative'),
}


def coverage_check(metas):
    """Check accepted metadata, not just planned categories. Fail with every gap."""
    getters = {
        'tow_position': lambda m: m['environment']['towPosition'],
        'sag_bin': lambda m: m['sagBin'],
        'time_of_day': lambda m: m['environment']['timeOfDay'],
        'lens_condition': lambda m: m['environment']['lensCondition'],
        'steering_direction': lambda m: 'positive' if m['simulator']['steeringAngleDeg'] > 0 else 'negative' if m['simulator']['steeringAngleDeg'] < 0 else 'zero',
    }
    distributions = {}; failures = []
    for split in ('train', 'val', 'test'):
        samples = [m for m in metas if m['split'] == split]
        distributions[split] = {}
        for axis, values in REQUIRED_COVERAGE.items():
            observed = Counter(getters[axis](m) for m in samples)
            distributions[split][axis] = {value: observed[value] for value in values}
            for value in values:
                if not observed[value]:
                    eligible = len({m['parent_scenario_id'] for m in metas if getters[axis](m) == value})
                    failures.append(f'{split}/{axis}/{value}: 0 accepted samples; {len(samples)} samples in split, {eligible} eligible accepted parents in entire run')
    require(not failures, 'Split coverage failed: ' + '; '.join(failures))
    return dict(status='passed', required=REQUIRED_COVERAGE, by_split=distributions)


def stats(values):
    a = np.asarray(values, dtype=float)
    return dict(count=len(a), min=float(a.min()), p05=float(np.percentile(a, 5)), p25=float(np.percentile(a, 25)), median=float(np.median(a)), mean=float(a.mean()), p75=float(np.percentile(a, 75)), p95=float(np.percentile(a, 95)), max=float(a.max()))


def loader_check(dataset, counts, seed):
    configure_runtime()
    import torch
    from ultralytics.cfg import get_cfg
    from ultralytics.data.utils import check_det_dataset
    from ultralytics.data.build import build_yolo_dataset, build_dataloader
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    data = check_det_dataset(str(dataset / 'dataset.yaml'), autodownload=False)
    # Match baseline train_yolo_seg.py: thin-mask preservation and restrained augmentation.
    cfg = get_cfg(overrides=dict(task='segment', imgsz=960, batch=2, workers=0, cache=False,
        mask_ratio=1, overlap_mask=False, mosaic=0., mixup=0., copy_paste=0.,
        degrees=1., translate=.02, scale=.1, shear=0., perspective=0., flipud=0., fliplr=0.,
        hsv_h=.01, hsv_s=.1, hsv_v=.1, close_mosaic=0))
    result = {}
    for split in ('train', 'val', 'test'):
        ds = build_yolo_dataset(cfg, data[split], 2, data, mode='train' if split == 'train' else 'val', stride=32)
        require(len(ds) == counts[split], f'Ultralytics dropped {split} images')
        require(all(len(label['cls']) and np.all(label['cls'] == 0) for label in ds.labels), 'Loader found non-towline/empty labels')
        source_instances=sum(len(label['cls']) for label in ds.labels)
        expected_instances=sum(len(f.read_text().splitlines()) for f in (dataset/'labels'/split).glob('*.txt'))
        require(source_instances==expected_instances,'Ultralytics dropped stored polygons')
        loader = build_dataloader(ds, batch=2, workers=0, shuffle=False, pin_memory=False, device='cpu')
        images = batches = instances = empty_masks = 0
        for batch in loader:
            images += len(batch['im_file']); batches += 1; instances += len(batch['cls'])
            require(tuple(batch['img'].shape[1:]) == (3, 960, 960), 'Unexpected RGB batch shape')
            require(batch['masks'].ndim == 3 and tuple(batch['masks'].shape[1:]) == (960, 960), 'Unexpected mask ratio/shape')
            require(bool((batch['cls'] == 0).all()), 'Unexpected class in batch')
            empty_masks += int((batch['masks'].flatten(1).sum(1) == 0).sum())
        require(images == counts[split] and empty_masks == 0, f'Loader failed {split} positive-mask check')
        result[split] = dict(images=images, batches=batches, instances=instances, source_instances=source_instances, augmentation_removed_instances=source_instances-instances, empty_instance_masks=empty_masks, augment=split == 'train', imgsz=960)
    return dict(status='passed', splits=result, model_loaded=False, training_performed=False)


def make_grids(source, metas, out):
    selectors = [
        ('day', lambda m: m['environment']['timeOfDay'] == 'day'),
        ('sunset', lambda m: m['environment']['timeOfDay'] == 'sunset'),
        ('night', lambda m: m['environment']['timeOfDay'] == 'night'),
        ('wet lens', lambda m: m['environment']['lensCondition'] == 'wet'),
        ('blur', lambda m: m['environment']['lensCondition'] == 'blurred'),
        ('astern', lambda m: m['environment']['towPosition'] == 'astern'),
        ('port', lambda m: m['environment']['towPosition'] == 'port'),
        ('starboard', lambda m: m['environment']['towPosition'] == 'starboard'),
        ('ahead', lambda m: m['environment']['towPosition'] == 'ahead'),
        ('positive steering', lambda m: m['simulator']['steeringAngleDeg'] > 0),
        ('negative steering', lambda m: m['simulator']['steeringAngleDeg'] < 0),
        ('fixed heading', lambda m: m['camera']['aimPolicy'] == 'fixed_heading'),
        ('Sag L1', lambda m: m['sagBin'] == 1),
        ('Sag L2', lambda m: m['sagBin'] == 2),
        ('Sag L3', lambda m: m['sagBin'] == 3),
        ('Sag L4', lambda m: m['sagBin'] == 4),
    ]
    selected = []; used = set()
    for title, predicate in selectors:
        options = [m for m in metas if predicate(m) and m['sampleId'] not in used]
        if options: selected.append((title, options[0])); used.add(options[0]['sampleId'])
    for title, key, reverse in [('dense fog',lambda m:m['environment']['fogDensity'],True),('small towline',lambda m:m['validation']['maskPixels'],False),('partial occlusion',lambda m:m['validation']['visibleFraction']/max(m['validation']['inFrameFraction'],1e-9),False),('cropped towline',lambda m:m['validation']['inFrameFraction'],False)]:
        choices=sorted([m for m in metas if m['sampleId'] not in used],key=key,reverse=reverse)
        if choices:selected.append((title,choices[0]));used.add(choices[0]['sampleId'])
    grid=Image.new('RGB',(2048,320*((len(selected)+3)//4)),'#14202a')
    contact=Image.new('RGB',(1152,240*len(selected)),'#14202a')
    index=[]
    for i,(title,m) in enumerate(selected):
        with Image.open(source/m['paths']['image']) as im: rgb=im.convert('RGB')
        mask=read_mask(source/m['paths']['mask'])
        overlay=green_overlay(rgb,mask)
        panel=overlay.copy();panel.thumbnail((512,288));x=(i%4)*512;y=(i//4)*320;grid.paste(panel,(x,y+32))
        caption=f"{title} | {m['split']} | {m['environment']['lensCondition']} | L{m['sagBin']}"
        ImageDraw.Draw(grid).text((x+6,y+5),caption,fill='white')
        panels=[rgb,Image.fromarray(mask.astype(np.uint8)*255).convert('RGB'),overlay]
        for col,panel in enumerate(panels):panel.thumbnail((384,216));contact.paste(panel,(col*384,i*240+24))
        ImageDraw.Draw(contact).text((8,i*240+4),f"{caption} | visible={m['validation']['visibleFraction']:.2f} | RGB / GT / overlay",fill='white')
        index.append({'category':title,'sample_id':m['sampleId'],'paths':m['paths']})
    grid.save(out/'representative_grid.png');contact.save(out/'contact_sheet.png');write_json(out/'contact_samples.json',index)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True);p.add_argument('--dataset',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    args=p.parse_args();source=args.source.resolve();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((source/'generation_manifest.json').read_text());require(manifest['status']=='complete','Source incomplete')
    runtime=json.loads((source/'runtime.json').read_text());require(runtime['generation_run_id']==manifest['generation_run_id'] and not runtime['browserErrors'],'Browser/run audit failed')
    require(manifest['classes']=={'0':'towline'},'V2 must be single class')
    summary=list(csv.DictReader((source/'dataset_summary.csv').open()));counts=manifest['splitCounts']
    require(len(summary)==manifest['generatedSamples']==manifest['configuration']['datasetSize'],'Source count mismatch')
    by_id={r['sample_id']:r for r in summary};require(len(by_id)==len(summary),'Duplicate CSV IDs')
    image_formats=Counter();mask_formats=Counter()
    metas=[];ids=set();seeds=set();scenarios=set();parents=defaultdict(list);rgb_hashes=defaultdict(list);mask_hashes=defaultdict(list);direct=[];failures=[]
    for split in ('train','val','test'):
        images=sorted((source/'images'/split).glob('*.png'));require(len(images)==counts[split],'Image count mismatch')
        stems={f.stem for f in images}
        require(stems=={f.stem.removesuffix('_mask') for f in (source/'masks'/split).glob('*.png')}=={f.stem for f in (source/'metadata'/split).glob('*.json')},'Orphan source files')
        for image in images:
            m=json.loads((source/'metadata'/split/f'{image.stem}.json').read_text());sid=m['sampleId'];r=by_id[sid]
            require(sid==image.stem==m['sample_id'] and m['split']==split==r['split'],'Sample identity mismatch')
            require(sid not in ids and m['scenarioSeed'] not in seeds and m['scenario_id'] not in scenarios,'Duplicate source ID/seed/scenario')
            ids.add(sid);seeds.add(m['scenarioSeed']);scenarios.add(m['scenario_id']);parents[m['parent_scenario_id']].append(m)
            require(m['generation_run_id']==manifest['generation_run_id'] and m['classes']=={'0':'towline'},'Run/class mismatch')
            for key in ('image','mask','metadata'):
                require(m['paths'][key]==r[key+'_path'] and f'/{split}/' in m['paths'][key],'Source path mismatch')
            mask=read_mask(source/m['paths']['mask'])
            with Image.open(source/m['paths']['mask']) as stored_mask:
                require(stored_mask.format=='PNG' and stored_mask.size==(manifest['configuration']['imageWidth'],manifest['configuration']['imageHeight']), 'Mask PNG format/size mismatch')
                if 'A' in stored_mask.getbands(): require(set(np.unique(np.asarray(stored_mask.getchannel('A'))))=={255}, 'Mask alpha must be opaque')
                mask_formats[f'{stored_mask.width}x{stored_mask.height} {stored_mask.mode} PNG']+=1
            with Image.open(image) as im:
                require(im.format=='PNG' and im.size==(manifest['configuration']['imageWidth'],manifest['configuration']['imageHeight'])==(m['image']['width'],m['image']['height']),'RGB size/format mismatch')
                require(mask.shape==(im.height,im.width),'Mask size mismatch')
                image_formats[f'{im.width}x{im.height} {im.mode} PNG']+=1
                rgb_hashes[hashlib.sha256(im.convert('RGB').tobytes()).hexdigest()].append(sid)
            mask_hashes[hashlib.sha256(mask.tobytes()).hexdigest()].append(sid)
            require(int(mask.sum())==m['validation']['maskPixels'] and mask.any(),'Mask foreground mismatch')
            world=np.asarray(m['towline']['centerlineWorld'],dtype=float);projected=np.asarray(m['towline']['centerlineImage'],dtype=float)
            require(np.isfinite(world).all() and np.isfinite(projected).all(),'Invalid centerline metadata')
            chord=world[-1]-world[0];length=np.linalg.norm(chord);unit=chord/length;delta=world-world[0]
            sag=np.max(np.linalg.norm(delta-np.outer(delta@unit,unit),axis=1))
            require(np.isclose(sag/length,m['towline']['sagRatioGT'],rtol=1e-9),'Geometric Sag metadata mismatch')
            require(np.isclose(np.linalg.norm(projected[-1]-projected[0]),m['validation']['projectedChordPixels'],rtol=1e-9),'Projected span metadata mismatch')
            require(m['camera']['automaticFovFit'] is False and m['sagBin']==m['targetSagBin'],'FOV/Sag audit failed')
            try:
                _,_,metric=mask_to_labels(mask,manifest['configuration']['validation']['minimumPolygonIou']);direct.append(metric)
            except ValueError as e:failures.append({'sample_id':sid,'reason':str(e)})
            metas.append(m)
    leaking={parent:sorted({m['split'] for m in variants}) for parent,variants in parents.items() if len({m['split'] for m in variants})>1}
    require(not leaking,'Parent scenario leakage')
    for parent,variants in parents.items():
        require(len(variants)==manifest['configuration']['variantsPerScenario'] and {m['variant'] for m in variants}=={0,1},'Incomplete parent variants')
        # Lens/camera/light live in simulator.params; remove them before comparing base geometry.
        base={json.dumps({'centerline':m['towline']['centerlineWorld'],'radius':m['towline']['radius'],'color':m['towline']['color'],'length':m['towline']['nominalLengthM'],'parent_seed':m['parent_scenario_seed'],'attempt':m['attempt'],'telemetry':m['simulator']['telemetry'],'time':m['simulator']['simulationTime']},sort_keys=True) for m in variants}
        require(len(base)==1,'Related variants did not retain base geometry')
    coverage=coverage_check(metas)
    duplicate_rgb=[v for v in rgb_hashes.values() if len(v)>1];require(not duplicate_rgb,'Duplicate RGB images')
    require(not failures,f'Mask-to-label failures: {failures[:3]}')
    dataset,prep,_=prepared_dataset(args.dataset,verify_source=True);require(prep['counts']==counts,'Derived count mismatch')
    converted=list(csv.DictReader((dataset/'preparation_samples.csv').open()));require(len(converted)==len(metas),'Derived conversion count mismatch')
    validation_path=out/'validation.json'
    require(validation_path.is_file(),'Run validate_yolo_seg.py with --report <out>/validation.json first')
    validation=json.loads(validation_path.read_text())
    require(validation['validated']==len(metas) and validation['counts']==counts and validation['source_hashes_unchanged'],'Final label validation mismatch')
    for split in counts:
        require({f.stem for f in (dataset/'images'/split).glob('*.png')}=={m['sampleId'] for m in metas if m['split']==split},'Derived IDs differ from source')
    categorical={'time_of_day':lambda m:m['environment']['timeOfDay'],'lens_condition':lambda m:m['environment']['lensCondition'],'tow_position':lambda m:m['environment']['towPosition'],'sag_bin':lambda m:m['sagBin'],'steering_direction':lambda m:'positive' if m['simulator']['steeringAngleDeg']>0 else 'negative' if m['simulator']['steeringAngleDeg']<0 else 'zero','camera_aim':lambda m:m['camera']['aimPolicy']}
    numeric={'towline_length_m':lambda m:m['towline']['nominalLengthM'],'rope_radius_m':lambda m:m['towline']['radius'],'sag_ratio':lambda m:m['towline']['sag']['sagRatio'],'sag_m':lambda m:m['towline']['sag']['sagM'],'span_m':lambda m:m['towline']['sag']['spanM'],'steering_deg':lambda m:m['simulator']['steeringAngleDeg'],'ship_speed_kn':lambda m:m['simulator']['shipSpeedKn'],'rpm':lambda m:m['simulator']['propellerRpm'],'camera_fov_deg':lambda m:m['camera']['fov'],'fog_density':lambda m:m['environment']['fogDensity'],'wave_strength':lambda m:m['environment']['waveStrength'],'blur_px':lambda m:m['environment']['blurPx'],'applied_blur_px':lambda m:m['environment']['appliedBlurPx'],'wetness':lambda m:m['environment']['lensWetness'],'mask_foreground_pixels':lambda m:m['validation']['maskPixels'],'visible_fraction':lambda m:m['validation']['visibleFraction'],'in_frame_fraction':lambda m:m['validation']['inFrameFraction'],'projected_chord_pixels':lambda m:m['validation']['projectedChordPixels'],'foreground_width_px':lambda m:m['validation']['foregroundSizePx'][0],'foreground_height_px':lambda m:m['validation']['foregroundSizePx'][1],'occlusion_among_in_frame':lambda m:1-m['validation']['visibleFraction']/max(m['validation']['inFrameFraction'],1e-9)}
    for axis,idx in [('x',0),('y',1),('z',2)]: numeric['camera_jitter_'+axis+'_m']=lambda m,i=idx:m['camera']['jitter'][i]
    for axis,idx in [('yaw',0),('pitch',1),('roll',2)]: numeric['camera_rotation_jitter_'+axis+'_deg']=lambda m,i=idx:m['camera']['rotationJitterDeg'][i]
    numeric['sun_intensity']=lambda m:m['environment']['sunIntensity']
    rejected=json.loads((source/'rejection_log.json').read_text())
    report={'status':'passed','source':str(source),'dataset':str(dataset),'generation_run_id':manifest['generation_run_id'],'seed':manifest['master_seed'],'counts':counts,'parent_counts':manifest['parentScenarioCounts'],'split_coverage':coverage,'format_check':{'images':dict(image_formats),'masks':dict(mask_formats),'all_pair_dimensions_match':True,'mask_color_values':[0,255]},
        'categorical_distributions':{name:dict(Counter(fn(m) for m in metas)) for name,fn in categorical.items()},
        'categorical_by_split':{split:{name:dict(Counter(fn(m) for m in metas if m['split']==split)) for name,fn in categorical.items()} for split in counts},
        'numeric_distributions':{name:stats([fn(m) for m in metas]) for name,fn in numeric.items()},
        'rope_color_counts':dict(Counter(m['towline']['color'] for m in metas)),
        'duplicate_check':{'duplicate_rgb_groups':duplicate_rgb,'duplicate_mask_groups':[v for v in mask_hashes.values() if len(v)>1],'mask_duplicates_policy':'Allowed within a parent; RGB variants can share projected geometry. No RGB duplicates.'},
        'scenario_leakage_check':{'leaking_parents':leaking,'unique_parents':len(parents),'unique_sample_seeds':len(seeds),'base_geometry_consistent':True},
        'conversion':{'successful_samples':len(converted),'failed_samples':failures,'polygons':prep['polygon_count'],'repaired_contours':prep['repaired_contours'],'added_pixels':prep['added_pixels'],'lost_pixels':prep['lost_pixels'],'iou':stats([float(r['iou']) for r in converted])},
        'rejections':{'rejected_parent_attempts':len(rejected),'reason_counts':dict(Counter(reason for r in rejected for reason in r['reasons'])),'log':str(source/'rejection_log.json')},
        'final_polygon_validation':validation,'source_manifest_sha256':sha256(source/'generation_manifest.json'),'source_immutability_verified':True,'training_performed':False}
    report['ultralytics_loader']=loader_check(dataset,counts,manifest['master_seed'])
    test_distributions=report['categorical_by_split']['test']
    report['pilot_limits']={'test_missing_tow_positions':sorted(set(report['categorical_distributions']['tow_position'])-set(test_distributions['tow_position'])), 'test_missing_sag_bins':sorted(int(value) for value in set(map(str,report['categorical_distributions']['sag_bin']))-set(map(str,test_distributions['sag_bin']))), 'training_augmentation_removed_components':report['ultralytics_loader']['splits']['train']['augmentation_removed_instances'], 'all_images_retained_positive_masks':True, 'real_world_performance_evaluated':False}
    if (out/'reproducibility.json').is_file(): report['reproducibility']=json.loads((out/'reproducibility.json').read_text())
    write_json(out/'qa_report.json',report);make_grids(source,metas,out)
    text=['# Dataset V2 pilot QA','',f"Run: `{report['generation_run_id']}`; seed {report['seed']}. No model training.",'',f"Samples: train {counts['train']}, val {counts['val']}, test {counts['test']}.",'',f"Parent scenarios: {report['parent_counts']}; no parent leakage or duplicate RGB.",'']
    text+=['Required marginal coverage: passed in train, val and test.','', '| Split | Tow position | Sag bin | Time of day | Lens | Steering |', '|---|---|---|---|---|---|']
    for split,distributions in coverage['by_split'].items():
        text.append('| '+split+' | '+' | '.join(str(distributions[axis]) for axis in REQUIRED_COVERAGE)+' |')
    text.append('')
    for name,distribution in report['categorical_distributions'].items():text.append(f'- {name}: {distribution}')
    text+=['','| Parameter | min | p05 | median | mean | p95 | max |','|---|---:|---:|---:|---:|---:|---:|']
    for name,s in report['numeric_distributions'].items():text.append('| '+name+' | '+' | '.join(f'{s[k]:.6g}' for k in ['min','p05','median','mean','p95','max'])+' |')
    text+=['',f"Conversion: {len(converted)} successful; 0 failed; {prep['polygon_count']} polygons. IoU min {prep['minimum_reconstruction_iou']:.9f}, mean {prep['mean_reconstruction_iou']:.9f}. Added pixels {prep['added_pixels']}; lost pixels {prep['lost_pixels']}.",'',f"Rejected parent attempts: {len(rejected)}. Detailed reasons in qa_report.json and rejection_log.json.",'',f"Final Ultralytics resampling IoU: min {validation['minimum_after_ultralytics_resampling_iou']:.9f}, mean {validation['mean_after_ultralytics_resampling_iou']:.9f}.",'', 'Real Ultralytics train/val/test loaders passed with 960px inputs, mask_ratio=1 and the baseline training augmentation. No weights loaded or training invoked.','', 'Stored polygons all survive loader parsing. Training augmentation can crop small components; source_instances and augmentation_removed_instances are reported separately. Every loaded image retained positive mask support.','', 'See representative_grid.png, contact_sheet.png and contact_samples.json. Geometric masks stay clean under RGB-only fog/blur/wet-lens degradation.']
    text+=['',f"Test coverage gaps: tow positions {report['pilot_limits']['test_missing_tow_positions']}; Sag bins {report['pilot_limits']['test_missing_sag_bins']}. Required marginal coverage verified in every split."]
    (out/'qa_report.md').write_text('\n'.join(text)+'\n')
    print(json.dumps({'status':'passed','counts':counts,'qa_report':str(out/'qa_report.json'),'conversion':report['conversion'],'rejected_attempts':len(rejected),'loader':report['ultralytics_loader']},indent=2))


if __name__=='__main__':main()
