import type { TowPosition } from '../types/maritime';
export type CapturePosition='current'|'all'|TowPosition;
export function resolveCapturePosition(selection:CapturePosition,current:TowPosition,index:number):TowPosition {
  if(selection==='current')return current;
  if(selection==='all')return (['astern','port','starboard','ahead'] as const)[index%4];
  return selection;
}
