import { useMemo } from 'react';
import { Euler, Object3D, Vector3 } from 'three';
import type { TelemetryState } from '../types/maritime';

export function MarineFloodlights({telemetry,shadows}:{telemetry:TelemetryState;shadows:boolean}) {
  const target=useMemo(()=>new Object3D(),[]);
  const position=new Vector3(0,5.1,1).applyEuler(new Euler(...telemetry.tugRotation)).add(new Vector3(...telemetry.tugPosition));
  return <>
    <primitive object={target} position={[telemetry.lineStartPoint[0],telemetry.lineStartPoint[1]+2,telemetry.lineStartPoint[2]]}/>
    <spotLight position={position} target={target} intensity={3500} color="#f5e6c7" angle={.7} penumbra={.65} distance={140} decay={2} castShadow={shadows} shadow-mapSize={[512,512]} shadow-bias={-.001}/>
    <pointLight position={[telemetry.tugPosition[0],telemetry.tugPosition[1]+3,telemetry.tugPosition[2]+3]} intensity={25} color="#e7c999" distance={13} decay={2}/>
  </>;
}
