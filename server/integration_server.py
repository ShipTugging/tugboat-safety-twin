"""Prototype real-YOLO API with capture-clock temporal decisions and session isolation."""
import base64
import hashlib
import io
import os
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
try:
    from .risk_pipeline import RiskStateClassifier, process_frame
    from .risk_engine import load_policy
    from .vision_adapter import prediction_mask, vision_payload
except ImportError:
    from risk_pipeline import RiskStateClassifier, process_frame
    from risk_engine import load_policy
    from vision_adapter import prediction_mask, vision_payload

MODEL_PATH=Path(os.getenv('TUGGUARD_MODEL_PATH',str(Path(__file__).parent/'models/best.pt'))).resolve()
POLICY=load_policy(os.getenv('TUGGUARD_RISK_POLICY'))
model_lock=threading.Lock(); sessions_lock=threading.Lock(); sessions={}
_model=None;_model_hash=None;_start=time.monotonic()


def get_model():
    global _model,_model_hash
    if _model is None:
        from ultralytics import YOLO
        model=YOLO(str(MODEL_PATH),task='segment')
        if model.task!='segment' or model.names!={0:'towline'}:raise ValueError('Expected single-class towline segmentation checkpoint')
        _model_hash=hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest();_model=model
    return _model


@asynccontextmanager
async def lifespan(app):
    with model_lock:get_model()
    yield


app=FastAPI(title='TUGGUARD Risk V2',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=['*'],allow_methods=['GET','POST'],allow_headers=['Content-Type'])


class FrameRequest(BaseModel):
    model_config=ConfigDict(allow_inf_nan=False)
    image_base64:str=Field(min_length=1,max_length=12_000_000)
    roll_deg:float=Field(ge=-180,le=180)
    roll_rate_deg_s:float=Field(ge=-1000,le=1000)
    session_id:str=Field(default='legacy',pattern=r'^[A-Za-z0-9_-]{1,80}$')
    frame_id:str|None=Field(default=None,max_length=120)
    captured_at_ms:float|None=Field(default=None,ge=0)
    timestamp_ms:float|None=Field(default=None,ge=0)
    camera_context:str=Field(default='legacy_camera',max_length=500)


class ResetRequest(BaseModel):
    session_id:str=Field(default='legacy',pattern=r'^[A-Za-z0-9_-]{1,80}$')


@dataclass
class Session:
    classifier:RiskStateClassifier=field(default_factory=lambda:RiskStateClassifier(policy=POLICY))
    lock:threading.Lock=field(default_factory=threading.Lock)
    last_used:float=field(default_factory=time.monotonic)
    context:str|None=None
    clock:str|None=None


def acquire_session(key):
    with sessions_lock:
        now=time.monotonic()
        for old,s in list(sessions.items()):
            if now-s.last_used>1800 and s.lock.acquire(blocking=False):
                del sessions[old];s.lock.release()
        if key not in sessions:
            if len(sessions)>=64:raise HTTPException(429,'Session capacity reached')
            sessions[key]=Session()
        s=sessions[key]
        if not s.lock.acquire(blocking=False):raise HTTPException(409,'Session request already in flight')
        s.last_used=now
        return s


def decode_image_base64(value):
    try:
        if value.startswith('data:'):value=value.split(',',1)[1]
        raw=base64.b64decode(value,validate=True)
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ('JPEG','PNG') or not 16<=im.width<=4096 or not 16<=im.height<=4096:raise ValueError('Unsupported image dimensions/format')
        image=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
        if image is None:raise ValueError('Cannot decode image')
        return image
    except Exception as e:raise HTTPException(422,'Invalid JPEG/PNG image') from e


@app.get('/health')
def health_check():
    return {'status':'ok','uptime_s':round(time.monotonic()-_start,1),'risk_version':POLICY['version'],
            'model_sha256':_model_hash,'inference':{'imgsz':960,'conf':.25,'retina_masks':False},'policy':POLICY}


@app.post('/analyze')
def analyze_frame(req:FrameRequest):
    started=time.perf_counter()
    if req.captured_at_ms is not None and req.timestamp_ms is not None and abs(req.captured_at_ms-req.timestamp_ms)>.001:
        raise HTTPException(422,'Conflicting capture timestamps')
    supplied=req.captured_at_ms if req.captured_at_ms is not None else req.timestamp_ms
    timestamp_ms=supplied if supplied is not None else (time.monotonic()-_start)*1000
    clock='client_capture' if supplied is not None else 'server_arrival_legacy'
    image=decode_image_base64(req.image_base64)
    s=acquire_session(req.session_id)
    try:
        if s.clock is not None and clock!=s.clock:raise HTTPException(409,'Reset session before changing clocks')
        if s.classifier.last_t is not None and timestamp_ms/1000<=s.classifier.last_t:raise HTTPException(409,'Out-of-order capture timestamp')
        context_changed=s.context is not None and s.context!=req.camera_context
        with model_lock:
            model=get_model()
            results=model.predict(image,imgsz=960,conf=.25,classes=[0],retina_masks=False,verbose=False,save=False)
            mask,confidence,meta=prediction_mask(results[0],image.shape[:2])
        if context_changed:s.classifier.reset_vision()
        result=process_frame(mask,confidence,req.roll_deg,req.roll_rate_deg_s,s.classifier,timestamp_ms/1000)
        s.context=req.camera_context;s.clock=clock
        result.update(session_id=req.session_id,frame_id=req.frame_id,captured_at_ms=timestamp_ms,
                      timestamp_ms=timestamp_ms,timestamp_source=clock,
                      vision={**vision_payload(mask,confidence,image.shape[:2]),**meta},
                      model_sha256=_model_hash,processing_ms=round((time.perf_counter()-started)*1000,2))
        if context_changed:result['reason_codes'].append('CAMERA_CONTEXT_CHANGED')
        return result
    finally:s.last_used=time.monotonic();s.lock.release()


@app.post('/reset')
def reset_classifier(req:ResetRequest=ResetRequest()):
    s=acquire_session(req.session_id)
    try:s.classifier=RiskStateClassifier(policy=POLICY);s.clock=s.context=None
    finally:s.lock.release()
    return {'status':'reset','session_id':req.session_id}


if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='0.0.0.0',port=8000)
