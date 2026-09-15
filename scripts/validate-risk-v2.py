"""Real checkpoint/API smoke, paired-frame replay and explicitly synthetic IMU stress.
Run with server/.venv Python while Risk V2 is running locally.
"""
import argparse
import base64
import io
import json
import statistics
import time
import urllib.request
import uuid
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:8013')
parser.add_argument('--frames',default='artifacts.local/towline-video-ahead')
parser.add_argument('--output',required=True)
args=parser.parse_args()
def post(path,body):
    request=urllib.request.Request(args.url+path,data=json.dumps(body,allow_nan=False).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
root=Path(args.frames);report={'source':'paired Three.js frames; stress IMU explicitly modified, not accident ground truth','runs':{}}
with urllib.request.urlopen(args.url+'/health') as response:report['health']=json.load(response)
for mode in ['paired','synthetic_imu_stress']:
    session='validate-'+uuid.uuid4().hex;rows=[]
    for index in range(0,600,10):
        meta=json.loads((root/'metadata'/f'{index:04}.json').read_text());t=meta['time_s'];imu=meta['telemetry']
        roll,rate=imu['imuRollDeg'],imu['imuRollRateDegS']
        if mode=='synthetic_imu_stress':
            roll=0 if t<3 else min(25,(t-3)*3) if t<13 else max(0,25-(t-13)*8)
            rate=3 if 3<t<3+25/3 else -8 if 13<t<13+25/8 else 0
        body={'session_id':session,'frame_id':str(index),'captured_at_ms':t*1000,
              'roll_deg':roll,'roll_rate_deg_s':rate,'camera_context':'bow-clear',
              'image_base64':'data:image/jpeg;base64,'+base64.b64encode((root/'frames'/f'{index:04}.jpg').read_bytes()).decode()}
        start=time.perf_counter();r=post('/analyze',body);elapsed=(time.perf_counter()-start)*1000
        assert r['frame_id']==str(index) and r['session_id']==session and r['timestamp_ms']==t*1000
        vision=r['vision']
        if vision['mask_base64']:
            with Image.open(io.BytesIO(base64.b64decode(vision['mask_base64']))) as image:
                assert image.format=='PNG' and image.size==(1280,720)
                assert set(np.unique(np.asarray(image)))<={0,255}
        r['vision']['mask_base64']='[verified binary PNG]' if vision['mask_base64'] else None
        r['round_trip_ms']=round(elapsed,2);rows.append(r)
    states=dict(Counter(r['risk_state'] for r in rows))
    if mode=='paired':assert 'Critical' not in states
    else:assert all(s in states for s in ['GirtingRisk','Developing','Critical']),states
    report['runs'][mode]={'frames':len(rows),'states':states,'observation_status':dict(Counter(r['observation_status'] for r in rows)),
        'median_round_trip_ms':statistics.median(r['round_trip_ms'] for r in rows),
        'max_round_trip_ms':max(r['round_trip_ms'] for r in rows),'frames_data':rows}
    print(mode,states,flush=True)
stream=io.BytesIO();Image.new('RGB',(960,540),'white').save(stream,format='JPEG')
blank=base64.b64encode(stream.getvalue()).decode();session='blank-'+uuid.uuid4().hex
results=[]
for i in range(8):
    r=post('/analyze',{'session_id':session,'frame_id':str(i),'captured_at_ms':i*200,
        'roll_deg':0 if i==0 else 25,'roll_rate_deg_s':0,'image_base64':blank})
    results.append({'state':r['risk_state'],'vision':r['vision']['towline_detected'],'reasons':r['reason_codes']})
assert results[0]['state']=='UNKNOWN' and results[-1]['state']=='Critical'
assert not any(r['vision'] for r in results)
report['blank_and_imu']=results
with open(args.output,'x',encoding='utf-8') as handle:json.dump(report,handle,ensure_ascii=False,allow_nan=False,indent=2)
print('Validated',args.output)
