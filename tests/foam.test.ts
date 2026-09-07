import test from 'node:test';
import assert from 'node:assert/strict';
import { getFoamConfig } from '../src/simulation/foam.ts';

for (const rpm of [0, 44]) {
  test(`foam disabled at ${rpm} RPM`, () => {
    assert.equal(getFoamConfig(rpm).count, 0);
    assert.equal(getFoamConfig(rpm).emissionRate, 0);
  });
}
for (const [rpm, count, size, emissionRate] of [[45,80,.4,20],[80,120,.6,30],[115,160,.8,40],[120,160,.8,40]]) {
  test(`foam scales and clamps at ${rpm} RPM`, () => {
    const config = getFoamConfig(rpm);
    assert.equal(config.count, count);
    assert.ok(Math.abs(config.size - size) < 1e-10);
    assert.equal(config.emissionRate, emissionRate);
    assert.equal(config.count / config.emissionRate, config.lifetime);
  });
}
