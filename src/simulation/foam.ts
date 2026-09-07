/** Fixed lifetime makes active particle count proportional to emission rate. */
export function getFoamConfig(rpm: number) {
  const scale = 1 + Math.min(1, Math.max(0, (rpm - 45) / 70));
  const active = Number.isFinite(rpm) && rpm >= 45;
  return {
    count: active ? Math.round(80 * scale) : 0,
    size: .4 * scale,
    emissionRate: active ? 20 * scale : 0,
    lifetime: 4,
  };
}
