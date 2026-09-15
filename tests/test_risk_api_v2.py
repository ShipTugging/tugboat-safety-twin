import base64
import io
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import integration_server as api
from vision_adapter import prediction_mask,vision_payload
from risk_pipeline import decode_mask_base64, process_frame, RiskStateClassifier, process_synchronized_record


def tensor(values):
    return SimpleNamespace(cpu=lambda:SimpleNamespace(numpy=lambda:np.asarray(values)))


class ApiTests(unittest.TestCase):
    def setUp(self):
        api.sessions.clear()
        self.client=TestClient(api.app)
        stream=io.BytesIO();Image.new('RGB',(1280,720)).save(stream,format='JPEG')
        self.image=base64.b64encode(stream.getvalue()).decode()
        self.result=SimpleNamespace(orig_shape=(720,1280),boxes=SimpleNamespace(conf=tensor([.99,.95]),cls=tensor([1,0])),
                                    masks=SimpleNamespace(xy=[np.array([[20,20],[30,20],[30,30]]),np.array([[100.8,500.8],[800.8,200.8],[805.8,208.8],[105.8,508.8]])]))
        self.fake=SimpleNamespace(predict=lambda *a,**kw:[self.result])

    def test_polygon_selection_rounding_and_png_contract(self):
        mask,conf,meta=prediction_mask(self.result,(720,1280))
        self.assertEqual(meta['selected_instance'],1)
        self.assertEqual(conf,.95)
        self.assertEqual(int(mask[500,100]),0) # np.rint, not truncation
        self.assertEqual(int(mask[501,101]),255)
        payload=vision_payload(mask,conf,(720,1280))
        decoded=decode_mask_base64(payload['mask_base64'],1280,720)
        np.testing.assert_array_equal(mask,decoded)

    def post(self,t,session='test',roll=0.,context='bow'):
        return self.client.post('/analyze',json={'image_base64':self.image,'roll_deg':roll,'roll_rate_deg_s':0.,
                'session_id':session,'frame_id':str(t),'captured_at_ms':t,'camera_context':context})

    def test_real_api_schema_reachable_risk_and_session_reset_isolation(self):
        with patch.object(api,'get_model',return_value=self.fake):
            for t in [0,200,400,600]:r=self.post(t,roll=23.)
            data=r.json();self.assertEqual(r.status_code,200)
            self.assertEqual(data['risk_state'],'Critical')
            self.assertEqual(data['captured_at_ms'],600);self.assertEqual(data['frame_id'],'600')
            self.assertEqual(self.post(0,session='other').json()['risk_state'],'Loaded')
            self.client.post('/reset',json={'session_id':'other'})
            self.assertEqual(self.post(800,roll=23.).json()['risk_state'],'Critical')
            self.assertEqual(self.post(100).status_code,409)
            self.assertEqual(self.post(1000,roll=23.,context='port').json()['calibration_status'],'pending')

    def test_malformed_images_imu_and_concurrent_session_are_rejected(self):
        self.assertEqual(self.client.post('/analyze',json={'image_base64':'bad','roll_deg':0,'roll_rate_deg_s':0}).status_code,422)
        self.assertEqual(self.client.post('/analyze',json={'image_base64':self.image}).status_code,422)
        s=api.acquire_session('test')
        try:self.assertEqual(self.post(0).status_code,409)
        finally:s.lock.release()

    def test_missing_vision_and_sync_failure_do_not_become_normal(self):
        e=RiskStateClassifier()
        self.assertEqual(process_frame(None,None,0,0,e,0)['risk_state'],'UNKNOWN')
        for t in [.2,.4,.6]:r=process_frame(None,None,25,0,e,t)
        self.assertEqual(r['risk_state'],'Critical')
        bad={'timestamp_ms':1000,'vision':{'towline_detected':False,'confidence':None},'imu':None,'sync':{'matched':False}}
        self.assertEqual(process_synchronized_record(bad,e)['observation_status'],'unsynchronized')


if __name__=='__main__':unittest.main()
