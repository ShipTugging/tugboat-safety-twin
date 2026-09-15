export const RISK_STATES=['Normal','Loaded','GirtingRisk','Developing','Critical','UNKNOWN'] as const;
export interface RiskResponse {
 timestamp:number;fusion_mode:'vision_imu_fused'|'imu_primary'|'imu_only'|null;confidence:number;
 sag_ratio:number|null;towline_angle_pixel_deg:number|null;towline_angle_corrected_deg:number|null;
 roll_deg:number;roll_rate_deg_s:number;risk_state:typeof RISK_STATES[number];
 policy_version?:string;observation_status?:string;calibration_status?:string;
 reason_codes?:string[];sag_ratio_rate_per_s?:number|null;angle_delta_deg?:number|null;baseline_angle_deg?:number|null;
 geometry?:{valid:boolean;flags:string[]};
 vision?:{towline_detected:boolean;mask_base64:string|null;mask_width:number;mask_height:number};
}
export interface AnalysisFrame {jpeg:string;timestamp:number;rollDeg:number;rollRateDegS:number;cameraContext?:string}
export function fusionLabel(mode:RiskResponse['fusion_mode']):string { return mode??'관측 불가'; }
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
    !(validFusionModes.includes(String(fusionMode))||(riskState==='UNKNOWN'&&fusionMode===null)))throw Error('서버 상태 또는 신뢰도 형식 오류');
 for(const key of ['sag_ratio_rate_per_s','angle_delta_deg','baseline_angle_deg'])if(r[key]!==undefined&&r[key]!==null&&(typeof r[key]!=='number'||!Number.isFinite(r[key])))throw Error(`서버 진단 ${key} 오류`);
 for(const key of ['policy_version','observation_status','calibration_status'])if(r[key]!==undefined&&typeof r[key]!=='string')throw Error(`서버 진단 ${key} 오류`);
 if(r.reason_codes!==undefined&&(!Array.isArray(r.reason_codes)||r.reason_codes.some(v=>typeof v!=='string')))throw Error('판단 근거 형식 오류');
 if(r.geometry!==undefined){const g=r.geometry as RiskResponse['geometry'];if(!g||typeof g.valid!=='boolean'||!Array.isArray(g.flags)||g.flags.some(v=>typeof v!=='string'))throw Error('Geometry 품질 형식 오류');}
 if(r.vision!==undefined){const v=r.vision as NonNullable<RiskResponse['vision']>;if(!v||typeof v.towline_detected!=='boolean'||!Number.isInteger(v.mask_width)||!Number.isInteger(v.mask_height)||v.mask_width<1||v.mask_height<1||v.mask_width>4096||v.mask_height>4096||(v.mask_base64!==null&&(typeof v.mask_base64!=='string'||v.mask_base64.length>12000000||!/^[A-Za-z0-9+/=]+$/.test(v.mask_base64))))throw Error('마스크 계약 오류');}
 return r as unknown as RiskResponse;
}
export function makeAnalyzeRequest(frame:AnalysisFrame,frameId:string,sessionId?:string){
 return {image_base64:frame.jpeg,roll_deg:frame.rollDeg,roll_rate_deg_s:frame.rollRateDegS,frame_id:frameId,captured_at_ms:frame.timestamp,...(sessionId?{session_id:sessionId}:{}),...(frame.cameraContext?{camera_context:frame.cameraContext}:{})};
}

const REASONS:Record<string,string>={ROLL_CRITICAL:'큰 횡경사 지속',ROLL_DEVELOPING:'횡경사 증가',ROLL_RISK:'횡경사 주의',ROLL_RISING:'기울어지는 속도 증가',ROLL_RISING_FAST:'빠르게 기울어짐',SAG_LOADED:'예인줄이 팽팽함',RAPID_TIGHTENING:'처짐이 빠르게 감소',ANGLE_CHANGE:'초기 영상 각도에서 변화',ANGLE_AND_ROLL:'각도 변화와 횡경사 동반',VISION_MISSING:'예인줄 미검출',VISION_DEGRADED:'마스크 품질 부족',VISION_INVALID:'유효하지 않은 마스크',RISK_HELD:'기존 위험 유지 · 회복 확인 중',BASELINE_PENDING:'안정 구간에서 초기 각도 수집 중',TIMESTAMP_GAP:'촬영 간격 단절 · 변화율 재수집',CONFIRMING:'지속 여부 확인 중',WITHIN_POLICY:'현재 정책 기준 이내',CAMERA_CONTEXT_CHANGED:'카메라 조건 변경 · 초기 각도 재수집',SMALL_MASK:'예인줄이 작게 보임',CLIPPED_MASK:'화면 경계에 잘림',FRAGMENTED_MASK:'마스크가 여러 조각으로 분리',BRANCHED_CENTERLINE:'중심선 분기',SHORT_CHORD:'예인줄 길이 부족',LOW_CONFIDENCE:'감지 신뢰도 부족',NO_CENTERLINE:'중심선 없음',IMPLAUSIBLE_GEOMETRY:'형상 품질 부족'};
export const riskReasonLabel=(code:string)=>REASONS[code]??code;
