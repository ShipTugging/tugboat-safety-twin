import { CatmullRomCurve3, Euler, Vector3 } from 'three';
import type { RiskLevel, TelemetryState } from '../types/maritime';

export const getTowlineState = (tensionKn:number,risk:RiskLevel):'taut'|'slack' =>
  tensionKn>=320 || risk==='CRITICAL' ? 'taut' : 'slack';

export function createTowlineCurve(start:Vector3,end:Vector3,length:number,tensionKn:number,risk:RiskLevel):CatmullRomCurve3 {
  const span=start.distanceTo(end);
  const excess=Math.max(0,length-span);
  const lowLoad=1-Math.min(1,Math.max(0,tensionKn)/320);
  const sag=getTowlineState(tensionKn,risk)==='taut' ? 0 : Math.min(4.5,span*.09+excess*.08)*lowLoad;
  const points=[0,.25,.5,.75,1].map(t=>new Vector3().lerpVectors(start,end,t).add(new Vector3(0,-Math.sin(Math.PI*t)*sag,0)));
  return new CatmullRomCurve3(points,false,'centripetal');
}

/** Render anchors follow the actual chock/staple and the tug's roll/pitch. */
export function getTowlineAnchors(t:TelemetryState):{start:Vector3;end:Vector3} {
  return {
    start:new Vector3(3.5,2.7,-34.2).add(new Vector3(...t.shipPosition)),
    end:new Vector3(0,2.8,3.2).applyEuler(new Euler(...t.tugRotation)).add(new Vector3(...t.tugPosition)),
  };
}
