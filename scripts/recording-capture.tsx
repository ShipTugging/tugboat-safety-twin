import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Scene3D} from '../src/components/Scene3D';
import type {CaptureSample, CapturedFrame, SceneCaptureApi} from '../src/dataset/types';

declare global {
  interface Window {
    recording?: {capture: (sample: CaptureSample) => Promise<CapturedFrame>};
  }
}
function RecordingCapture() {
  const [sample,setSample] = useState<CaptureSample|null>(null);
  const api = useRef<SceneCaptureApi|null>(null), running = useRef(false);
  const onReady = useCallback((value: SceneCaptureApi|null) => { api.current = value; }, []);
  useEffect(() => {
    window.recording = {capture: async next => {
      if (running.current) throw new Error('A recording frame is already pending');
      if (!next.id.startsWith('video:recording:') || next.v2) throw new Error('Expected recording RGB sample');
      running.current = true;
      try {
        // The initial sample mounts Scene3D; wait for its capture API without advancing simulation time.
        setSample(next);
        const started = performance.now();
        while (!api.current) {
          if (performance.now()-started > 30000) throw new Error('Recording renderer did not initialize');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return await api.current.capture(next.id, new AbortController().signal);
      } finally { running.current = false; }
    }};
    return () => { delete window.recording; };
  }, []);
  if (!sample) return null;
  return <Scene3D params={sample.params} telemetry={sample.telemetry} captureSample={sample}
    recordingTime={sample.time} captureBusy datasetMode liveCameraMode="TUG_SAG_CAM"
    onCaptureReady={onReady} onUpdatePhysics={()=>{}} onSelectCamera={()=>{}} onSelectTimeOfDay={()=>{}}/>;
}
createRoot(document.getElementById('root')!).render(<RecordingCapture/>);
