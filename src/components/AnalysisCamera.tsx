import { useEffect, useState } from 'react';
import type { ServerAnalysis } from '../hooks/useServerAnalysis';

/** The mask and RGB always come from the same completed analysis response. */
export function AnalysisCamera({analysis:a,large=false}:{analysis:ServerAnalysis;large?:boolean}) {
  const [age,setAge]=useState(0);
  useEffect(()=>{setAge(0);const started=Date.now();const timer=setInterval(()=>setAge(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer);},[a.result]);
  const r=a.result?.response;
  const stale=a.state!=='running'||a.paused||age>=3;
  const observation=!r?'분석 시작 후 표시':r.observation_status==='valid'?'예인줄 감지됨':r.vision?.towline_detected?'예인줄 감지 불안정':'예인줄 감지되지 않음';
  return <div className={large?'service-camera-wrap':'demo-camera-wrap'}>
    <div className={'analysis-camera server-camera '+(large?'large-camera':'demo-camera')}>
      {a.result?<><img src={a.result.frame.jpeg} alt="AI가 분석한 예인줄 CCTV"/>{r?.vision?.mask_base64&&<div className="server-mask" role="img" aria-label="예인줄 감지 영역" style={{maskImage:`url(data:image/png;base64,${r.vision.mask_base64})`}}/>}</>:<div className="camera-placeholder"><span>CCTV 예인줄 감시</span><small>분석 시작 후 영상과 감지 영역이 표시됩니다</small></div>}
      <span className="camera-caption">{r&&stale?`마지막 분석 영상 (${age}초 전)`:observation}</span>
    </div>
    {large&&<div className="service-feed-heading"><strong>CCTV 예인줄 감시</strong><span>{a.state==='running'&&!stale?'분석 영상 수신 중':'분석 영상 대기'}</span></div>}
  </div>;
}
