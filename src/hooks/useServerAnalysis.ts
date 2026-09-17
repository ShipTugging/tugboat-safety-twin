import {useCallback,useEffect,useRef,useState} from 'react';
import {makeAnalyzeRequest,normalizeServerUrl,parseRiskResponse,type AnalysisFrame,type RiskResponse} from '../server/protocol';
const describeError=(e:unknown)=>e instanceof TypeError?'연결 실패 / 서버 주소, CORS 및 HTTPS 설정을 확인하세요.':e instanceof Error?e.message:'서버 요청 실패';
export function useServerAnalysis(paused:boolean){
 const [url,setUrl]=useState('http://127.0.0.1:8000');
 const [state,setState]=useState<'off'|'connecting'|'running'|'error'>('off'),[message,setMessage]=useState('서버 주소를 입력하고 연결하세요.');
 const [result,setResult]=useState<{frame:AnalysisFrame;response:RiskResponse;latency:number;id:string}|null>(null);
 const active=useRef(false),controller=useRef<AbortController|null>(null),generation=useRef(0),next=useRef(0),sequence=useRef(0);
 const sessionId=useRef('');
 const config=useRef({url,paused});config.current={url,paused};
 const stop=useCallback(()=>{active.current=false;generation.current++;controller.current?.abort();controller.current=null;setState('off');setMessage('중지 / 마지막 수신 결과');},[]);
 useEffect(()=>()=>{active.current=false;generation.current++;controller.current?.abort();},[]);
 const request=async(base:string,path:string,signal:AbortSignal,body?:unknown)=>{
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
  if(!response.ok)throw Error(`서버 HTTP ${response.status}`);return response.json();
 };
 const connect=async(reset=false)=>{
  stop();const id=generation.current,c=new AbortController();controller.current=c;setState('connecting');setMessage(reset?'서버 초기화 중':'서버 연결 확인 중');
  const timer=setTimeout(()=>c.abort(),5000);
  try{
   // getRandomValues also works on HTTP LAN pages where randomUUID is unavailable.
   if(!sessionId.current)sessionId.current='web-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
   const base=normalizeServerUrl(config.current.url);
   const health=await request(base,reset?'/reset':'/health',c.signal,reset?{session_id:sessionId.current}:undefined);
   if(health.status!==(reset?'reset':'ok'))throw Error('서버 상태 응답 형식 오류');
   if(generation.current!==id)return;
   setResult(null);sequence.current=0;next.current=0;
   active.current=!reset;setState(reset?'off':'running');setMessage(reset?'서버 초기화 완료':'연결됨 / 최대 5fps, 단일 요청');
  }catch(e){if(generation.current===id){active.current=false;setState('error');setMessage(c.signal.aborted?'연결 시간 초과':describeError(e));}}
  finally{clearTimeout(timer);if(controller.current===c)controller.current=null;}
 };
 const wantsFrame=useCallback(()=>active.current&&!config.current.paused&&!controller.current&&performance.now()>=next.current,[]);
 const onFrame=useCallback(async(frame:AnalysisFrame)=>{
  if(!wantsFrame())return;
  const id=generation.current,c=new AbortController();controller.current=c;next.current=performance.now()+200;
  const frameId=`${id}:${++sequence.current}`,started=performance.now(),settings={...config.current};
  const timer=setTimeout(()=>c.abort(),5000);
  try{
   const raw=await request(normalizeServerUrl(settings.url),'/analyze',c.signal,makeAnalyzeRequest(frame,frameId,sessionId.current));
   if(raw.frame_id!==undefined&&raw.frame_id!==frameId)throw Error('응답 프레임 번호 불일치');
   if(raw.session_id!==undefined&&raw.session_id!==sessionId.current)throw Error('응답 세션 불일치');
   if(raw.captured_at_ms!==undefined&&raw.captured_at_ms!==frame.timestamp)throw Error('응답 촬영 시각 불일치');
   const response=parseRiskResponse(raw);
   if(generation.current===id&&active.current)setResult({frame,response,latency:Math.round(performance.now()-started),id:frameId});
  }catch(e){if(generation.current===id){active.current=false;setState('error');setMessage(c.signal.aborted?'응답 시간 초과 / 분석 중지':describeError(e));}}
  finally{clearTimeout(timer);if(controller.current===c)controller.current=null;}
 },[wantsFrame]);
 const captureError=useCallback((error:Error)=>{stop();setState('error');setMessage(error.message);},[stop]);
 return {url,setUrl,state,message,result,paused,connect:()=>connect(),reset:()=>connect(true),stop,wantsFrame,onFrame,captureError};
}
export type ServerAnalysis=ReturnType<typeof useServerAnalysis>;
