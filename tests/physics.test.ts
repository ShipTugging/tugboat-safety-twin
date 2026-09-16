import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialTelemetry, createPhysicsState, settlePhysics, stepMaritimePhysics } from '../src/simulation/physics';
import type { SimulationParams } from '../src/types/maritime';

const baseline: SimulationParams = {
  tugSteeringAngle: 18, towLineLength: 32, shipSpeed: 6, propellerRpm: 45,
  cameraMode: 'orbit', timeOfDay: 'day', quickReleaseActive: false, soundEnabled: false, fogDensity: 0.008,
  towPosition: 'astern',
};

// Characterization values captured from the original live hook at timestamp 0.
const presets = [
  { values: [18, 32, 6, 45], expected: [190, 6, 'SAFE', 0, 'CLEAR', 30.6, 5, 5, 0.2] },
  { values: [68, 26, 8.5, 60], expected: [639, 78, 'CRITICAL', 0, 'CLEAR', 23.7, 8, 11, 2.1] },
  { values: [4, 28, 9, 115], expected: [198, 0, 'SAFE', 40, 'MARGINAL', 27, 6, 10, 0] },
  { values: [-22, 14, 10, 50], expected: [293, 10, 'SAFE', 35, 'MARGINAL', 12.5, 13, 40, -0.3] },
];

for (const { values, expected } of presets) {
  test(`preserves live preset physics at steering ${values[0]}`, () => {
    const [tugSteeringAngle, towLineLength, shipSpeed, propellerRpm] = values;
    const result = stepMaritimePhysics({ ...baseline, tugSteeringAngle, towLineLength, shipSpeed, propellerRpm }, createPhysicsState(), 1 / 60, 0);
    assert.deepEqual([result.lineTensionKn, result.girtingRiskPct, result.girtingStatus,
      result.washTurbulencePct, result.washStatus, result.hullDistanceM,
      result.suctionRiskPct, result.suctionForceKn, result.imuRollDeg], expected);
  });
}

test('preserves attachment positions and timestamp', () => {
  const result = stepMaritimePhysics(baseline, createPhysicsState(), 1 / 60, 0);
  assert.deepEqual(result.tugPosition, [11.90526224699857, 0.5, -65.22933638203992]);
  assert.deepEqual(result.lineStartPoint, [3.5, 2.6, -34]);
  assert.deepEqual(result.lineEndPoint, [12.740924826324909, 3.2511204723871114, -62.096764882468655]);
  assert.equal(result.timestamp, 0);
});

test('missing tow position uses the bow-first simulation baseline', () => {
  const { towPosition: _towPosition, ...withoutPosition } = baseline;
  const result = stepMaritimePhysics(withoutPosition, createPhysicsState(), 1 / 60, 0);
  assert.deepEqual(result.lineStartPoint, [0, 6.8, 32]);
  assert.ok(result.tugPosition[2] > result.lineStartPoint[2]);
});

test('quick release removes load immediately and damps existing roll', () => {
  const crisis = { ...baseline, tugSteeringAngle: 85, shipSpeed: 10 };
  const state = createPhysicsState();
  for (let index = 0; index < 120; index++) stepMaritimePhysics(crisis, state, 1 / 60, 0);
  const loadedRoll = state.smoothedRoll;
  const result = stepMaritimePhysics({ ...crisis, quickReleaseActive: true }, state, 1 / 60, 0);
  assert.equal(result.lineTensionKn, 0);
  assert.equal(result.girtingRiskPct, 0);
  assert.equal(result.girtingStatus, 'SAFE');
  assert.equal(result.emergencyReleaseTriggered, true);
  assert.ok(state.smoothedRoll > 0 && state.smoothedRoll < loadedRoll);
});

test('snapshot settling is deterministic and cannot mutate a live state', () => {
  const live = createPhysicsState();
  stepMaritimePhysics(baseline, live, 1 / 60, 5000);
  const before = structuredClone(live);
  const snapshot = settlePhysics(baseline, 12000);
  assert.deepEqual(settlePhysics(baseline, 12000), snapshot);
  assert.equal(snapshot.timestamp, 12000);
  assert.deepEqual(live, before);
  const second = createPhysicsState();
  assert.notDeepEqual(live, second);
  assert.deepEqual(createPhysicsState(), second);
});

test('delta clamps preserve live integration behavior', () => {
  assert.deepEqual(stepMaritimePhysics(baseline, createPhysicsState(), 2, 500), stepMaritimePhysics(baseline, createPhysicsState(), 0.1, 500));
  assert.deepEqual(stepMaritimePhysics(baseline, createPhysicsState(), 0, 500), stepMaritimePhysics(baseline, createPhysicsState(), 0.001, 500));
});

test('initial telemetry is independent for each caller', () => {
  const initial = createInitialTelemetry(42);
  assert.equal(initial.timestamp, 42);
  assert.equal(initial.lineTensionKn, 125);
  initial.tugPosition[0] = 100;
  assert.deepEqual(createInitialTelemetry(42).tugPosition, [16, 0.4, -42]);
});
