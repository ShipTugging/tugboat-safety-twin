import test from 'node:test';
import assert from 'node:assert/strict';
import { BOW_BASELINE, clampScenarioValue } from '../src/components/scenarioControlModel';

test('scenario numeric controls clamp without requiring a drag gesture', () => {
  assert.equal(clampScenarioValue('tugSteeringAngle', 999), 90);
  assert.equal(clampScenarioValue('tugSteeringAngle', -999), -90);
  assert.equal(clampScenarioValue('towLineLength', 0), 10);
  assert.equal(clampScenarioValue('shipSpeed', 99), 14);
  assert.equal(clampScenarioValue('propellerRpm', -1), 0);
  assert.equal(clampScenarioValue('shipSpeed', Number.NaN), 0);
});

test('the operator baseline is the bow CCTV view', () => {
  assert.deepEqual(BOW_BASELINE, { towPosition: 'ahead', cameraMode: 'TUG_SAG_CAM' });
});
