"""Regression checks for coverage failures on accepted dataset metadata."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('v2qa', Path(__file__).resolve().parents[1] / 'scripts/verify-dataset-v2.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class CoverageTests(unittest.TestCase):
    def samples(self):
        return [dict(split=split, parent_scenario_id=f'{split}:{i}', sagBin=i,
                     environment=dict(towPosition=qa.REQUIRED_COVERAGE['tow_position'][i % 4],
                                      timeOfDay=qa.REQUIRED_COVERAGE['time_of_day'][i % 3],
                                      lensCondition=qa.REQUIRED_COVERAGE['lens_condition'][i % 3]),
                     simulator=dict(steeringAngleDeg=10 if i % 2 else -10))
                for split in ('train', 'val', 'test') for i in range(5)]

    def test_complete_coverage(self):
        self.assertEqual(qa.coverage_check(self.samples())['status'], 'passed')

    def test_every_required_category_gap_is_rejected(self):
        for split in ('train', 'val', 'test'):
            for axis, values in qa.REQUIRED_COVERAGE.items():
                for missing in values:
                    with self.subTest(split=split, axis=axis, missing=missing):
                        metas = copy.deepcopy(self.samples())
                        replacement = next(v for v in values if v != missing)
                        for m in metas:
                            if m['split'] != split:
                                continue
                            if axis == 'sag_bin':
                                if m['sagBin'] == missing: m['sagBin'] = replacement
                            elif axis == 'steering_direction':
                                m['simulator']['steeringAngleDeg'] = 10 if replacement == 'positive' else -10
                            else:
                                key = {'tow_position': 'towPosition', 'time_of_day': 'timeOfDay', 'lens_condition': 'lensCondition'}[axis]
                                if m['environment'][key] == missing: m['environment'][key] = replacement
                        with self.assertRaisesRegex(ValueError, f'{split}/{axis}/{missing}: 0 accepted samples'):
                            qa.coverage_check(metas)


if __name__ == '__main__':
    unittest.main()
