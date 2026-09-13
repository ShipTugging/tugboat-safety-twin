import type { SimulationParams } from '../types/maritime';
import { createDroplets } from './lens';

/** RGB-only optical degradation; no coordinate warp, so masks stay aligned. */
function encodeDatasetImage(source:HTMLCanvasElement,params:SimulationParams,format:'image/jpeg'|'image/png'):string {
  const blur=Math.max(0,params.imageBlurPx??0),wetness=Math.max(0,Math.min(1,params.lensWetness??0));
  if(blur===0&&wetness===0)return source.toDataURL(format,.9);
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('렌즈 효과를 위한 Canvas를 생성하지 못했습니다.');
  // This exporter promises actual blur; fail rather than silently ignoring it.
  if(!('filter' in ctx))throw new Error('이 브라우저는 렌즈 흐림 효과를 지원하지 않습니다. 맑음 모드를 사용하세요.');
  const scale=source.width/960;
  ctx.filter=`blur(${blur*scale}px)`;ctx.drawImage(source,0,0);ctx.filter='none';
  if(wetness>0) {
    const softened=document.createElement('canvas');softened.width=source.width;softened.height=source.height;
    const soft=softened.getContext('2d');if(!soft)throw new Error('물 튐 프레임 생성 실패');
    soft.filter=`blur(${(3+wetness*5)*scale}px)`;soft.drawImage(source,0,0);
    for(const drop of createDroplets(params.lensSeed??0,wetness)) {
      const x=drop.x*canvas.width,y=drop.y*canvas.height,r=drop.radius*canvas.width;
      ctx.save();ctx.beginPath();ctx.ellipse(x,y,r,r*drop.stretch,drop.tilt,0,Math.PI*2);ctx.clip();
      ctx.globalAlpha=.75;ctx.drawImage(softened,0,0);ctx.globalAlpha=1;
      const glare=ctx.createRadialGradient(x-r*.3,y-r*.4,r*.05,x,y,r*drop.stretch);
      glare.addColorStop(0,'rgba(238,248,255,0.18)');glare.addColorStop(.55,'rgba(230,240,245,0.025)');glare.addColorStop(1,'rgba(6,24,35,0.22)');
      ctx.fillStyle=glare;ctx.fillRect(x-r*2,y-r*3,r*4,r*6);ctx.restore();
      ctx.save();ctx.beginPath();ctx.ellipse(x,y,r,r*drop.stretch,drop.tilt,Math.PI*.95,Math.PI*1.55);
      ctx.strokeStyle='rgba(245,252,255,0.28)';ctx.lineWidth=Math.max(.6,scale);ctx.stroke();ctx.restore();
    }
  }
  return canvas.toDataURL(format,.9);
}

export const encodeDatasetJpeg=(source:HTMLCanvasElement,params:SimulationParams)=>encodeDatasetImage(source,params,'image/jpeg');
export const encodeDatasetPng=(source:HTMLCanvasElement,params:SimulationParams)=>encodeDatasetImage(source,params,'image/png');
