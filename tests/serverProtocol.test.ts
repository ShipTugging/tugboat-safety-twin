import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeServerUrl,parseRiskResponse,makeAnalyzeRequest} from '../src/server/protocol';
const valid={timestamp:1,fusion_mode:'imu_only',confidence:.2,sag_ratio:null,towline_angle_pixel_deg:null,towline_angle_corrected_deg:null,roll_deg:12,roll_rate_deg_s:2,risk_state:'Normal'};
test('legacy response retains missing vision values; rejects invalid states/numbers',()=>{
 assert.equal(parseRiskResponse(valid).sag_ratio,null);
 for(const patch of [{risk_state:'SAFE'},{confidence:2},{roll_deg:NaN},{sag_ratio:'0.1'},{fusion_mode:'other'},{timestamp:null}])assert.throws(()=>parseRiskResponse({...valid,...patch}));
});
test('real server no-detection response is accepted as UNKNOWN with no fusion mode',()=>{
 const response={...valid,fusion_mode:null,confidence:0,sag_ratio:null,towline_angle_pixel_deg:null,towline_angle_corrected_deg:null,risk_state:'UNKNOWN'};
 assert.equal(parseRiskResponse(response).risk_state,'UNKNOWN');
});
test('URL permits HTTP(S) base paths but excludes credentials and queries',()=>{
 assert.equal(normalizeServerUrl(' http://127.0.0.1:8000/ '),'http://127.0.0.1:8000');
 assert.equal(normalizeServerUrl('https://example.org/api/'),'https://example.org/api');
 for(const u of ['file:///tmp','https://user:secret@example.org','https://example.org?key=x','nonsense'])assert.throws(()=>normalizeServerUrl(u));
});
test('real inference does not send ground truth hints or client confidence',()=>{
 const frame={jpeg:'data:image/jpeg;base64,AA==',timestamp:123,rollDeg:4,rollRateDegS:2,sagRatio:.03,angleDeg:20,detached:false};
 const real=makeAnalyzeRequest(frame,'s:1',false,.9);
 assert.equal(real.image_base64,frame.jpeg);assert.equal(real.roll_rate_deg_s,2);
 assert.equal(real.frame_id,'s:1');assert.equal(real.captured_at_ms,123);
 assert.ok(!('confidence' in real));assert.ok(!('sag_ratio_hint' in real));
 const dummy=makeAnalyzeRequest({...frame,detached:true},'s:2',true,.9);
 assert.equal(dummy.confidence,0);assert.equal(dummy.sag_ratio_hint,.03);
});
