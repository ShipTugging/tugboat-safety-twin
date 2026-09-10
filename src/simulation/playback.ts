export function playbackFrameIndex(elapsedSec:number,sampleRateHz:number,frameCount:number):number {
  return Math.min(frameCount-1,Math.max(0,Math.floor(elapsedSec*sampleRateHz)));
}
