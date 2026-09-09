export function worldToRadarPoint(point:[number,number,number],centerX:number,centerY:number,scale:number):[number,number] {
  return [centerX+point[0]*scale,centerY-point[2]*scale];
}
