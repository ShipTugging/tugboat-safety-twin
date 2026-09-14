"""Recording output integrity, encoder, and existing IMU/sync integration."""
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT.parent / 'tugboat-safety_IMU'))
from recording_io import SENSOR_FIELDS, encode_recording, validate_recording, validate_video
from run_pipeline import run as preprocess_run
from run_sync import run as sync_run


class RecordingOutputTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'session'
        (self.root / 'frames').mkdir(parents=True)
        self.session = {'session_id':'test-session', 'sequence_id':'test-sequence', 'status':'captured',
                        'simulation_hz':600, 'camera_fps':24, 'imu_hz':100, 'width':1280, 'height':720,
                        'timestamp_origin_ms':0, 'duration_ms':1000,
                        'expected_camera_frames':24, 'expected_imu_samples':100}
        self.write_session()
        image_bytes = io.BytesIO()
        Image.new('RGB', (1280,720), (32,64,96)).save(image_bytes, format='JPEG')
        data = image_bytes.getvalue()
        self.frames = []
        for index in range(24):
            path = f'frames/frame_{index:06}.jpg'
            (self.root / path).write_bytes(data)
            self.frames.append({'session_id':'test-session', 'sequence_id':'test-sequence',
                                'frame_index':index, 'timestamp_ms':index/24*1000, 'simulation_tick':index*25,
                                'image_path':path, 'position_world_m':[0,0,0], 'rotation_xyz_rad':[0,0,0],
                                'rgb_sha256':hashlib.sha256(data).hexdigest()})
        self.write_frames()
        self.imu = [{**dict.fromkeys(SENSOR_FIELDS, 0), 'timestamp_ms':index*10, 'ay_mps2':9.80665,
                     'sequence_id':'test-sequence'} for index in range(100)]
        self.write_imu('imu_raw.csv'); self.write_imu('imu_normalized.csv')

    def write_session(self):
        (self.root / 'session.json').write_text(json.dumps(self.session))

    def write_frames(self):
        (self.root / 'camera_frames.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in self.frames))

    def write_imu(self, name):
        with (self.root / name).open('w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=[*SENSOR_FIELDS, 'sequence_id'])
            writer.writeheader(); writer.writerows(self.imu)

    def validate(self):
        return validate_recording(self.root, allow_captured=True)

    def test_valid_output_and_shared_timestamp_grid(self):
        report = self.validate()
        self.assertEqual(report['camera_frames'],24)
        self.assertEqual(report['imu_samples'],100)
        self.assertLessEqual(report['maximum_nearest_imu_gap_ms'],5.000001)
        self.assertEqual(report['last_imu_timestamp_ms'],990)
        self.assertTrue(report['shared_tick_orientation_valid'])

    def test_missing_frame_is_rejected(self):
        (self.root / self.frames[5]['image_path']).unlink()
        with self.assertRaises(FileNotFoundError): self.validate()

    def test_duplicate_frame_is_rejected(self):
        self.frames[5] = self.frames[4].copy(); self.write_frames()
        with self.assertRaisesRegex(ValueError,'Duplicate frame index'): self.validate()

    def test_out_of_order_frame_is_rejected(self):
        self.frames[3], self.frames[4] = self.frames[4], self.frames[3]; self.write_frames()
        with self.assertRaisesRegex(ValueError,'ordering'): self.validate()

    def test_incomplete_status_and_count_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'Incomplete'): validate_recording(self.root)
        self.session['status']='failed'; self.write_session()
        with self.assertRaisesRegex(ValueError,'Incomplete'): self.validate()
        self.session['status']='captured'; self.write_session()
        self.frames.pop(); self.write_frames()
        with self.assertRaisesRegex(ValueError,'Missing/extra'): self.validate()

    def test_timestamp_corruption_is_rejected(self):
        self.frames[2]['timestamp_ms'] += 1; self.write_frames()
        with self.assertRaisesRegex(ValueError,'timestamp grid'): self.validate()

    def test_corrupt_rgb_checksum_and_resolution_are_rejected(self):
        path = self.root / self.frames[0]['image_path']
        path.write_bytes(b'corrupt JPEG')
        with self.assertRaisesRegex(ValueError,'checksum'): self.validate()
        Image.new('RGB',(640,360)).save(path)
        self.frames[0]['rgb_sha256']=hashlib.sha256(path.read_bytes()).hexdigest(); self.write_frames()
        with self.assertRaisesRegex(ValueError,'Invalid RGB format'): self.validate()

    def test_extra_frame_file_is_rejected(self):
        (self.root / 'frames/unexpected.jpg').write_bytes(b'unexpected')
        with self.assertRaisesRegex(ValueError,'frame files'): self.validate()

    def test_boundary_and_shared_pose_mismatches_are_rejected(self):
        self.frames[0]['sequence_id']='different'; self.write_frames()
        with self.assertRaisesRegex(ValueError,'boundary|sequence_id'): self.validate()
        self.frames[0]['sequence_id']='test-sequence'; self.frames[0]['rotation_xyz_rad']=[0,0,.1]
        self.write_frames()
        with self.assertRaisesRegex(ValueError,'Shared-pose'): self.validate()

    def test_invalid_imu_or_changed_normalized_values_are_rejected(self):
        self.imu[10]['timestamp_ms']=90; self.write_imu('imu_raw.csv')
        with self.assertRaisesRegex(ValueError,'timestamp grid'): self.validate()
        self.imu[10]['timestamp_ms']=100; self.write_imu('imu_raw.csv')
        self.imu[10]['ax_mps2']=float('nan'); self.write_imu('imu_normalized.csv')
        with self.assertRaisesRegex(ValueError,'non-finite'): self.validate()
        self.imu[10]['ax_mps2']=1; self.write_imu('imu_normalized.csv')
        with self.assertRaisesRegex(ValueError,'changed sensor'): self.validate()

    def test_malformed_sidecar_has_line_context(self):
        path=self.root / 'camera_frames.jsonl'
        path.write_text(json.dumps(self.frames[0])+'\nnot JSON\n')
        with self.assertRaisesRegex(ValueError,'line 2'): self.validate()

    def test_real_encoder_and_decoder_validate_fps_count_and_dimensions(self):
        report=encode_recording(self.root)
        self.assertEqual(report['video']['decoded_frames'],24)
        self.assertEqual(report['video']['fps'],24)
        self.assertAlmostEqual(report['video']['duration_sec'],1)
        self.session['status']='complete'; self.write_session()
        validate_recording(self.root)
        with self.assertRaisesRegex(ValueError,'overwrite'): encode_recording(self.root)
        with self.assertRaisesRegex(ValueError,'frame count'): validate_video(self.root/'camera.mp4',25,1)

    def test_existing_preprocessing_and_sync_accept_recording_sequence_boundary(self):
        # Exercise the actual neighboring projects, without changing their source or output directories.
        preprocess_run(self.root/'imu_raw.csv',self.root/'imu_normalized.csv',self.root/'imu_diagnostics.json')
        self.validate()
        vision=[]
        for row in self.frames:
            vision.append({'timestamp_ms':row['timestamp_ms'], 'vision':{
                'towline_detected':True,'confidence':.9,'mask_base64':'opaque +/==',
                'mask_width':1280,'mask_height':720}})
        path=self.root/'vision.jsonl'
        path.write_text(''.join(json.dumps(row)+'\n' for row in vision))
        output=self.root/'synchronized.jsonl'
        with redirect_stdout(io.StringIO()):
            sync_run(path,self.root/'imu_normalized.csv',output,self.root/'sync_diagnostics.json',
                     sequence_id='test-sequence')
        result=[json.loads(line) for line in output.read_text().splitlines()]
        self.assertEqual(len(result),24)
        for actual,original in zip(result,vision):
            self.assertTrue(actual['sync']['matched'])
            self.assertLessEqual(abs(actual['sync']['time_delta_ms']),5.000001)
            self.assertEqual(actual['vision'],original['vision'])
            self.assertEqual(actual['metadata']['imu']['sequence_id'],'test-sequence')


if __name__ == '__main__':
    unittest.main()
