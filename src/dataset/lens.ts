import { seededRandom } from './environment';
export type LensSelection='mixed'|'clear'|'blurred'|'wet';
export function randomizeLens(random:()=>number,selection:LensSelection='mixed') {
  const lensCondition=selection==='mixed'?(['clear','blurred','wet'] as const)[Math.floor(random()*3)]:selection;
  return {
    lensCondition,
    imageBlurPx:lensCondition==='clear'?0:lensCondition==='blurred'?1+random()*3:.3+random()*1.2,
    lensWetness:lensCondition==='wet'?.35+random()*.65:0,
    lensSeed:Math.floor(random()*4294967296),
  };
}
export function createDroplets(seed:number,wetness:number) {
  const random=seededRandom(seed),strength=Math.max(0,Math.min(1,wetness));
  return Array.from({length:strength>0?Math.round(10+strength*24):0},()=>({
    x:random(),y:random(),radius:.008+random()*.043,stretch:1.1+random()*1.6,tilt:(random()-.5)*.6,
  }));
}
