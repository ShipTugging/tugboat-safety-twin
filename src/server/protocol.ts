export const RISK_STATES=['Normal','Loaded','GirtingRisk','Developing','Critical','UNKNOWN'] as const;
export interface RiskResponse {
 timestamp:number;fusion_mode:'vision_imu_fused'|'imu_primary'|'imu_only'|null;confidence:number;
 sag_ratio:number|null;towline_angle_pixel_deg:number|null;towline_angle_corrected_deg:number|null;
 roll_deg:number;roll_rate_deg_s:number;risk_state:typeof RISK_STATES[number];
}
export interface AnalysisFrame {jpeg:string;timestamp:number;rollDeg:number;rollRateDegS:number;sagRatio:number;angleDeg:number;detached:boolean}
export function normalizeServerUrl(value:string):string {
 const u=new URL(value.trim());
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('HTTP(S) 서버 주소만 입력하세요. 인증정보·쿼리는 포함할 수 없습니다.');
 return u.href.replace(/\/+$/,'');
}
export function parseRiskResponse(value:unknown):RiskResponse {
 if(!value||typeof value!=='object')throw Error('서버 응답이 JSON 객체가 아닙니다.');
 const r=value as Record<string,unknown>;
 for(const key of ['timestamp','confidence','roll_deg','roll_rate_deg_s'])if(typeof r[key]!=='number'||!Number.isFinite(r[key]))throw Error(`서버 응답 ${key} 오류`);
 for(const key of ['sag_ratio','towline_angle_pixel_deg','towline_angle_corrected_deg'])if(r[key]!==null&&(typeof r[key]!=='number'||!Number.isFinite(r[key])))throw Error(`서버 응답 ${key} 오류`);
 const riskState=r.risk_state as RiskResponse['risk_state'];
 const fusionMode=r.fusion_mode;
 const validFusionModes=['vision_imu_fused','imu_primary','imu_only'];
 if((r.confidence as number)<0||(r.confidence as number)>1||!RISK_STATES.includes(riskState)||
    (riskState==='UNKNOWN'?fusionMode!==null:!validFusionModes.includes(String(fusionMode))))throw Error('서버 상태 또는 신뢰도 형식 오류');
 return r as unknown as RiskResponse;
}
export function makeAnalyzeRequest(frame:AnalysisFrame,frameId:string,dummy:boolean,confidence:number){
 return {image_base64:frame.jpeg,roll_deg:frame.rollDeg,roll_rate_deg_s:frame.rollRateDegS,frame_id:frameId,captured_at_ms:frame.timestamp,
 ...(dummy?{confidence:frame.detached?0:confidence,sag_ratio_hint:frame.sagRatio,angle_hint_deg:frame.angleDeg}:{})};
}
