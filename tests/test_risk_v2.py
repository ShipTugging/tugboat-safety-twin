import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from risk_engine import TemporalRiskEngine
from risk_geometry import measure_geometry


class RiskTests(unittest.TestCase):
    def tick(self, engine, t, sag=.08, angle=55., roll=0., rate=0., valid=True):
        return engine.update(t, sag if valid else None, angle if valid else None, roll, rate, 'valid' if valid else 'missing')

    def test_roll_critical_is_reachable_with_good_vision(self):
        e=TemporalRiskEngine()
        for i in range(15): r=self.tick(e, i*.1, roll=23.)
        self.assertEqual(r['risk_state'], 'Critical')
        self.assertIn('ROLL_CRITICAL', r['reason_codes'])

    def test_fluctuating_severity_still_confirms_sustained_danger(self):
        e=TemporalRiskEngine()
        for i in range(10):r=self.tick(e,i*.2,roll=16 if i%2 else 21)
        self.assertIn(r['risk_state'],['Developing','Critical'])

    def test_one_safe_sample_cannot_inherit_lower_risk_recovery_time(self):
        e=TemporalRiskEngine()
        for t in [0,.2,.4]:self.tick(e,t,roll=23)
        for t in [.5,1,1.5,2]:self.tick(e,t,roll=16)
        self.assertNotEqual(self.tick(e,2.5,roll=0)['risk_state'],'Normal')

    def test_missing_vision_is_unknown_but_imu_can_escalate(self):
        e=TemporalRiskEngine()
        self.assertEqual(self.tick(e,0,valid=False)['risk_state'],'UNKNOWN')
        for i in range(1,8): r=self.tick(e,i*.1,roll=23.,valid=False)
        self.assertEqual(r['risk_state'],'Critical')
        self.assertEqual(r['observation_status'],'missing')

    def test_spike_does_not_trigger_and_loss_does_not_clear_warning(self):
        e=TemporalRiskEngine()
        self.tick(e,0)
        self.assertNotEqual(self.tick(e,.1,roll=25.)['risk_state'],'Critical')
        self.assertEqual(self.tick(e,.2)['risk_state'],'Normal')
        for i in range(3,10): r=self.tick(e,i*.1,roll=23.)
        self.assertEqual(r['risk_state'],'Critical')
        self.assertEqual(self.tick(e,1.0,valid=False)['risk_state'],'Critical')
        for i in range(11,36): r=self.tick(e,i*.1)
        self.assertEqual(r['risk_state'],'Normal')

    def test_rates_use_time_and_never_bridge_missing_data(self):
        e=TemporalRiskEngine()
        for i in range(10): r=self.tick(e,i*.1,sag=.15-i*.01)
        self.assertAlmostEqual(r['sag_ratio_rate_per_s'],-.1,places=6)
        self.tick(e,1.,valid=False)
        self.assertIsNone(self.tick(e,1.1,sag=.01)['sag_ratio_rate_per_s'])
        with self.assertRaises(ValueError): self.tick(e,1.)
        self.assertIsNone(self.tick(e,5.,sag=.01)['sag_ratio_rate_per_s'])

    def test_calibration_signed_angle_and_fast_tightening(self):
        e=TemporalRiskEngine()
        for i in range(15): r=self.tick(e,i*.1,angle=-55.)
        self.assertEqual(r['calibration_status'],'ready')
        for i in range(15,25): r=self.tick(e,i*.1,sag=.01,angle=-15.)
        self.assertGreater(r['angle_delta_deg'],30)
        self.assertEqual(r['risk_state'],'GirtingRisk')

    def test_weak_or_fragmented_mask_is_not_taut(self):
        tiny=np.zeros((720,1280),np.uint8); tiny[10:12,10:80]=255
        self.assertFalse(measure_geometry(tiny,.99)['valid'])
        empty=np.zeros_like(tiny)
        self.assertIsNone(measure_geometry(empty,.99)['sag_ratio'])
        broken=empty.copy();broken[100:105,100:350]=255;broken[400:405,600:850]=255
        self.assertFalse(measure_geometry(broken,.99)['valid'])

    def test_one_sag_outlier_does_not_create_a_danger(self):
        e=TemporalRiskEngine()
        for i in range(15):self.tick(e,i*.1,sag=.02)
        self.tick(e,1.5,sag=.3)
        for i in range(16,30):
            self.assertIn(self.tick(e,i*.1,sag=.02)['risk_state'],['Normal','Loaded'])

    def test_fast_tightening_and_rising_roll_have_independent_reasons(self):
        e=TemporalRiskEngine()
        for i in range(15):self.tick(e,i*.1,sag=.15)
        seen=[]
        for i in range(1,11):
            r=self.tick(e,1.4+i*.05,sag=.15-i*.014)
            seen.extend(r['reason_codes'])
        self.assertIn('RAPID_TIGHTENING',seen)
        for i in range(20,30):r=self.tick(e,i*.1,roll=6,rate=6,valid=False)
        self.assertEqual(r['risk_state'],'Developing')
        self.assertIn('ROLL_RISING_FAST',r['reason_codes'])

    def test_horizontal_diagonal_and_sag_geometry(self):
        import cv2
        mask=np.zeros((720,1280),np.uint8)
        pts=np.array([[100,500],[300,560],[500,530],[800,300]],np.int32)
        cv2.polylines(mask,[pts],False,255,7)
        r=measure_geometry(mask,.95)
        self.assertTrue(r['valid'],r)
        self.assertGreater(r['sag_ratio'],.05)
        self.assertLess(r['angle_deg'],90)


if __name__=='__main__': unittest.main()
