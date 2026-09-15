import type {ServerAnalysis} from '../hooks/useServerAnalysis';
const number=(v:number|null|undefined,digits=2)=>v==null?'관측 없음':v.toFixed(digits);
const angle=(v:number|null)=>v===null?'관측 없음':`${number(v)}°`;
export function ServerAnalysisPanel({analysis:a}:{analysis:ServerAnalysis}){
 const locked=a.state==='running'||a.state==='connecting',r=a.result?.response;
 return <section className="server-analysis" aria-label="Python 서버 분석">
  <h3>Python 서버 분석</h3>
  <label>서버 주소<input aria-label="분석 서버 주소" value={a.url} disabled={locked} onChange={e=>a.setUrl(e.target.value)} placeholder="https://server.example.com"/></label>
  <p>실제 YOLO-Seg 추론 · CCTV 이미지와 IMU만 서버로 전송</p>
  <div className="risk-log-actions"><button onClick={locked?a.stop:a.connect} disabled={!locked&&a.paused}>{locked?'분석 중지':'연결·분석 시작'}</button><button onClick={a.reset} disabled={locked||a.paused}>서버 초기화</button></div>
  <p role="status">{a.paused?'데이터 생성 중 · 서버 전송 일시 중지':a.message}</p>
  {r&&a.result&&<>
   <div className={'server-risk '+(a.state==='running'&&!a.paused?r.risk_state:'is-stale')}>서버 판정 · {r.risk_state}{a.state!=='running'||a.paused?' · 마지막 결과':''}</div>
   <img src={a.result.frame.jpeg} alt="이 서버 응답에 대응하는 예인선 CCTV 입력 이미지"/>
   <p>프레임 {a.result.id} · 왕복 {a.result.latency}ms · {r.fusion_mode}</p>
   <div className="server-metrics"><span>신뢰도 <b>{number(r.confidence)}</b></span><span>Sag <b>{number(r.sag_ratio,4)}</b></span><span>영상 각도 <b>{angle(r.towline_angle_pixel_deg)}</b></span><span>보정 각도 <b>{angle(r.towline_angle_corrected_deg)}</b></span><span>롤 <b>{number(r.roll_deg)}°</b></span><span>롤 속도 <b>{number(r.roll_rate_deg_s)}°/s</b></span></div>
   <details><summary>응답 JSON · 동기화 정보</summary><pre>{JSON.stringify({frame_id:a.result.id,captured_at_ms:a.result.frame.timestamp,...r},null,2)}</pre></details>
   <p>현 서버는 감지 마스크·판단 근거를 반환하지 않습니다. 시뮬레이션 관측값과 별도 판정입니다.</p>
  </>}
  <small>최대 5fps · 전송 중 다음 요청 대기. 초기화는 서버의 공용 판정 이력을 지웁니다. 공개 사이트에는 HTTPS 서버 주소를 권장합니다.</small>
 </section>;
}
