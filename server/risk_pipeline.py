"""Online masks and canonical synchronized JSONL share the prototype V2 engine.

Image sag is not tension; image angle is not a calibrated 3D towing angle.
The frozen segmentation model's evaluation is not risk-classifier validation.
"""
import base64
import io
import json
import math
import numpy as np
from PIL import Image

try:
    from .risk_engine import TemporalRiskEngine, load_policy
    from .risk_geometry import measure_geometry
except ImportError:
    from risk_engine import TemporalRiskEngine, load_policy
    from risk_geometry import measure_geometry


class RiskStateClassifier(TemporalRiskEngine):
    """Compatibility name. Baseline is now in image degrees, never legacy gamma."""
    def __init__(self, window=5, baseline_angle_deg=None, policy=None):
        super().__init__(policy)
        if baseline_angle_deg is not None:
            raise ValueError('Legacy 3D baseline is not supported; calibrate an image baseline through timed frames')


def process_frame(mask, confidence, roll_deg, roll_rate_deg_s, classifier, timestamp):
    geometry = measure_geometry(mask, confidence)
    result = classifier.update(timestamp, geometry['sag_ratio'], geometry['angle_deg'],
                               roll_deg, roll_rate_deg_s, geometry['status'])
    fusion = 'vision_imu_fused' if geometry['valid'] else 'imu_primary' if geometry['status']=='degraded' else 'imu_only'
    result.update(timestamp=timestamp, timestamp_ms=timestamp*1000, fusion_mode=fusion,
                  confidence=float(confidence or 0), sag_ratio=geometry['sag_ratio'],
                  towline_angle_pixel_deg=geometry['angle_deg'], towline_angle_corrected_deg=None,
                  angle_reference='image_vertical_unoriented_degrees_not_3d',
                  roll_deg=float(roll_deg), roll_rate_deg_s=float(roll_rate_deg_s), geometry=geometry)
    return result


def decode_mask_base64(payload, width, height):
    if not isinstance(width,int) or not isinstance(height,int) or not 1<=width<=4096 or not 1<=height<=4096:
        raise ValueError('Invalid mask dimensions')
    with Image.open(io.BytesIO(base64.b64decode(payload,validate=True))) as im:
        if im.format!='PNG' or im.size!=(width,height): raise ValueError('Mask PNG dimensions mismatch')
        mask=np.asarray(im.convert('L'))
    if not np.isin(mask,[0,255]).all(): raise ValueError('Mask foreground must be binary 0/255')
    return mask


def synchronized_sequence(record):
    meta=record.get('metadata',{})
    vision=meta.get('vision',{}).get('sequence_id')
    imu=meta.get('imu',{}).get('sequence_id')
    if vision and imu and vision!=imu: raise ValueError('Vision/IMU sequence boundary mismatch')
    return vision or imu or record.get('sequence_id') or 'legacy'


def process_synchronized_record(record, classifier, roll_rate_deg_s=0.):
    vision=record['vision'];imu=record.get('imu'); sync=record.get('sync',{})
    timestamp=float(record['timestamp_ms'])/1000
    if not math.isfinite(timestamp) or timestamp<0: raise ValueError('Invalid timestamp')
    synchronized_sequence(record)
    delta=sync.get('time_delta_ms')
    matched=(sync.get('matched') is True and isinstance(delta,(float,int)) and math.isfinite(delta)
             and abs(delta)<=classifier.policy['max_sync_delta_ms'] and isinstance(imu,dict))
    if not matched:
        classifier.reset_vision()
        return {'timestamp_ms':timestamp*1000,'risk_state':'UNKNOWN','observation_status':'unsynchronized',
                'reason_codes':['IMU_SYNC_INVALID'],'fusion_mode':None,'confidence':vision.get('confidence'),
                'sag_ratio':None,'towline_angle_pixel_deg':None,'towline_angle_corrected_deg':None,
                'roll_deg':None,'roll_rate_deg_s':None,'policy_version':classifier.policy['version']}
    detected=vision.get('towline_detected') is True
    mask=decode_mask_base64(vision['mask_base64'],vision['mask_width'],vision['mask_height']) if detected else None
    r=process_frame(mask,vision.get('confidence'),float(imu['roll_deg']),float(roll_rate_deg_s),classifier,timestamp)
    r['towline_detected']=detected
    return r


def process_synchronized_jsonl(jsonl_path):
    engines={};previous={};results=[]
    with open(jsonl_path,encoding='utf-8') as handle:
        for index,line in enumerate(handle):
            if not line.strip():continue
            key=None
            try:
                record=json.loads(line);key=synchronized_sequence(record)
                engine=engines.setdefault(key,RiskStateClassifier())
                timestamp=float(record['timestamp_ms']);imu=record.get('imu') or {}
                rate=0.;prev=previous.get(key)
                if 'roll_deg' in imu and prev:
                    dt=(timestamp-prev[0])/1000
                    if dt<=0:raise ValueError('Capture timestamps must strictly increase')
                    if dt<=engine.policy['max_gap_s']:rate=(float(imu['roll_deg'])-prev[1])/dt
                r=process_synchronized_record(record,engine,rate)
                if r['observation_status']=='unsynchronized':previous.pop(key,None)
                else:previous[key]=(timestamp,float(imu['roll_deg']))
                r.update(frame_index=index,sequence_id=key);results.append(r)
            except Exception as error:
                if key in engines: engines[key].reset_vision();previous.pop(key,None)
                results.append({'frame_index':index,'risk_state':'ERROR','reason_codes':['INVALID_RECORD'],'error':str(error)})
    return results


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',required=True,help='Canonical synchronized.jsonl')
    parser.add_argument('--output',required=True,help='New risk JSONL file')
    args=parser.parse_args()
    results=process_synchronized_jsonl(args.input)
    with open(args.output,'x',encoding='utf-8') as handle:
        for r in results:handle.write(json.dumps(r,ensure_ascii=False,allow_nan=False)+'\n')
    print(json.dumps({'frames':len(results),'states':{k:sum(r['risk_state']==k for r in results) for k in sorted({r['risk_state'] for r in results})}}))
