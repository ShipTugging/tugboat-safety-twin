import type { SimulationParams, TimeOfDay } from '../types/maritime';

export function seededRandom(seed: number): () => number {
  let state=seed>>>0;
  return () => {
    state+=0x6D2B79F5;
    let n=Math.imul(state^(state>>>15),1|state);
    n^=n+Math.imul(n^(n>>>7),61|n);
    return ((n^(n>>>14))>>>0)/4294967296;
  };
}

/** Alternate safe/girting configurations and cycle cameras independently of light. */
export function randomizeEnvironment(random:()=>number=Math.random,index=Math.floor(random()*600)):SimulationParams {
  const between=(a:number,b:number)=>a+(b-a)*random();
  const dangerous=index%2===1;
  const cameras=['orbit','TUG_AFT_DECK','TUG_BRIDGE'] as const;
  const cameraMode=cameras[index%3];
  const timeOfDay=(['day','sunset','night'] as TimeOfDay[])[Math.floor(random()*3)];
  return {
    tugSteeringAngle:Math.round(between(dangerous?68:5,dangerous?85:24)),
    towLineLength:Math.round(between(18,55)),
    shipSpeed:Math.round(between(dangerous?7:2,dangerous?11:6)*10)/10,
    propellerRpm:[0,45,80,115][Math.floor(random()*4)],
    cameraMode,timeOfDay,quickReleaseActive:false,soundEnabled:false,
    fogDensity:between(.0002,.015),sunIntensity:between(.7,1.35),waveStrength:between(.5,1.7),
    cameraFov:cameraMode==='TUG_BRIDGE'?80:cameraMode==='TUG_AFT_DECK'?between(60,75):between(40,55),
    cameraJitter:[between(-.18,.18),between(-.1,.1),between(-.18,.18)],
  };
}
