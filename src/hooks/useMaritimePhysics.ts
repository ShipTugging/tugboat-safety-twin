import { useState, useRef, useEffect, useCallback } from 'react';
import type { SimulationParams, TelemetryState } from '../types/maritime';
import { maritimeAudio } from '../utils/audioSynthesizer';
import { createInitialTelemetry, createPhysicsState, stepMaritimePhysics } from '../simulation/physics';

export function useMaritimePhysics(params: SimulationParams) {
  const [telemetry, setTelemetry] = useState<TelemetryState>(() => createInitialTelemetry());
  const physicsStateRef = useRef(createPhysicsState());
  const audioAlarmCooldownRef = useRef(0);

  useEffect(() => {
    maritimeAudio.setEnabled(params.soundEnabled);
  }, [params.soundEnabled]);

  const updatePhysics = useCallback((delta: number) => {
    const now = Date.now();
    const next = stepMaritimePhysics(params, physicsStateRef.current, delta, now);

    if (next.girtingStatus === 'CRITICAL' && now - audioAlarmCooldownRef.current > 750) {
      maritimeAudio.playGirtingAlarm();
      audioAlarmCooldownRef.current = now;
    }
    if (next.suctionStatus === 'CRITICAL') {
      maritimeAudio.playProximityPing(1.0);
    } else if (next.suctionStatus === 'WARNING') {
      maritimeAudio.playProximityPing(0.6);
    }
    setTelemetry(next);
  }, [params]);

  return { telemetry, updatePhysics };
}
