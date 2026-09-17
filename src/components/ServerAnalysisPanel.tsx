import type {ServerAnalysis} from '../hooks/useServerAnalysis';
import {fusionLabel,riskReasonLabel,riskLabel} from '../server/protocol';
const number=(v:number|null|undefined,digits=2)=>v==null?'관측 없음':v.toFixed(digits);
const angle=(v:number|null)=>v===null?'관측 없음':`${number(v)}°`;
export function ServerAnalysisPanel({analysis:a}:{analysis:ServerAnalysis}){
 const locked=a.state==='running'||a.state==='connecting',r=a.result?.response;
 return <section className="server-analysis" aria-label="Python 서버 분석">
  <h3>Python 서버 분석</h3>
  <label>서버 주소<input aria-label="분석 서버 주소" value={a.url} disabled={locked} onChange={e=>a.setUrl(e.target.value)} placeholder="https://server.example.com"/></label>
  <p>실제 YOLO-Seg 추론 / CCTV 이미지와 IMU만 서버로 전송</p>
  <div className="risk-log-actions"><button onClick={locked?a.stop:a.connect} disabled={!locked&&a.paused}>{locked?'분석 중지':'연결·분석 시작'}</button><button onClick={a.reset} disabled={locked||a.paused}>서버 초기화</button></div>
  <p role="status">{a.paused?'데이터 생성 중 / 서버 전송 일시 중지':a.message}</p>
  {r&&a.result&&<>
   <div className={'server-risk '+(a.state==='running'&&!a.paused?r.risk_state:'is-stale')}>서버 판정 / {riskLabel(r.risk_state)}{a.state!=='running'||a.paused?' / 마지막 결과':''}</div>
   <div className="server-camera"><img src={a.result.frame.jpeg} alt="이 서버 응답에 대응하는 예인선 CCTV 입력 이미지"/>{r.vision?.mask_base64&&<div className="server-mask" role="img" aria-label="실제 YOLO 예측 마스크" style={{maskImage:`url(data:image/png;base64,${r.vision.mask_base64})`}}/>}</div>
   <p>프레임 {a.result.id} / 왕복 {a.result.latency}ms / {fusionLabel(r.fusion_mode)}</p>
   <div className="server-metrics"><span>신뢰도 <b>{number(r.confidence)}</b></span><span>Sag <b>{number(r.sag_ratio,4)}</b></span><span>영상 각도 <b>{angle(r.towline_angle_pixel_deg)}</b></span><span>{r.policy_version?'초기 대비 각도':'보정 각도'} <b>{angle(r.policy_version?(r.angle_delta_deg??null):r.towline_angle_corrected_deg)}</b></span><span>롤 <b>{number(r.roll_deg)}°</b></span><span>롤 속도 <b>{number(r.roll_rate_deg_s)}°/s</b></span></div>
   {r.policy_version&&<div className="server-reasons"><strong>{r.policy_version} / 시연용 정책</strong><span>Sag 변화율 {number(r.sag_ratio_rate_per_s,4)}/s / 초기 각도 대비 {angle(r.angle_delta_deg??null)}</span>{[...(r.reason_codes??[]),...(r.geometry?.flags??[])].map(code=><span key={code}>{riskReasonLabel(code)}</span>)}</div>}
   <details><summary>응답 JSON / 동기화 정보</summary><pre>{JSON.stringify({frame_id:a.result.id,captured_at_ms:a.result.frame.timestamp,...r,vision:r.vision?{...r.vision,mask_base64:r.vision.mask_base64?'[PNG 마스크 표시 중]':null}:undefined},null,2)}</pre></details>
   <p>{r.policy_version?'녹색 영역은 YOLO 예측입니다. 영상 각도는 3D 실제 예인각이 아니며, 임계값은 실선 검증 전 시연용입니다.':'현 서버는 감지 마스크·판단 근거를 반환하지 않습니다.'}</p>
  </>}
  <small>최대 5fps / 초기화 시 현재 V2 세션의 기준각과 이력을 지웁니다. 서버 V1에서는 공용 이력이 초기화됩니다.</small>
 </section>;
}
