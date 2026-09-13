# Python 통합 서버 연결

## 사용

1. 팀의 integration_server.py를 실행하고 브라우저에서 접근할 서버 주소를 확보한다.
2. 관제 패널의 **Python 서버 분석**에 주소 입력. `/analyze`가 아닌 서버 기본 주소를 입력한다.
3. 현재 feat/risk_pipeline 서버에는 **더미 서버 통신 테스트**를 켠다. 이는 YOLO 성능 시험이 아니다.
4. **연결·분석 시작** 클릭. `/health`가 ok면 960×540 TUG_SAG_CAM 이미지와 동기 IMU를 최대 5Hz로 전송한다.
5. CCTV, 신뢰도, Sag, 영상 각도, 보정 각도, 롤·롤 속도, 융합 모드, 서버 위험 상태를 확인한다.
6. 더미 신뢰도 0.9/0.5/0.2로 융합 모드 전환을 시험한다. **분석 중지** 후 **서버 초기화** 가능.

실제 모델을 연결한 서버에서는 테스트 모드를 끄면 된다. 이때 confidence/sag_ratio_hint/angle_hint_deg는 전송하지 않는다. 체크 해제가 서버에 YOLO를 설치하거나 활성화하는 것은 아니다. 현재 서버는 image_base64를 무시하므로 실제 모델 연결은 서버 담당자의 작업이다.

## 요청/응답 계약

POST /analyze, Content-Type application/json:

```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "roll_deg": 1.9,
  "roll_rate_deg_s": 0.2,
  "frame_id": "2:1",
  "captured_at_ms": 1789290000000
}
```

더미 모드만 confidence/sag_ratio_hint/angle_hint_deg를 추가한다. hint는 카메라에 투영된 시뮬레이션 줄 중심선에서 계산하며 실제 감지가 아니다. 줄 분리 시 더미 confidence=0.

응답 필수: timestamp, fusion_mode, confidence, sag_ratio, towline_angle_pixel_deg, towline_angle_corrected_deg, roll_deg, roll_rate_deg_s, risk_state. 비전 값은 null을 허용해 관측 없음으로 표시한다. risk_state는 Normal/Loaded/GirtingRisk/Developing/Critical만 허용한다.

구버전 서버는 frame_id/captured_at_ms를 무시한다. 클라이언트는 단일 요청의 이미지와 응답을 묶고, 서버가 frame_id를 반환하면 일치 여부도 확인한다. 서버 timestamp는 서버 가동 후 경과 초이므로 촬영 시각과 동일하다고 가정하지 않는다. IMU는 현재 Three.js 모델의 합성 롤·롤 속도이며 실물 센서가 아니다.

## 표시와 실패 처리

- 별도 카메라로 캡처 후 화면 크기·DPR·원래 뷰를 복원한다. 이미지에 DOM UI는 포함하지 않는다.
- 한 번에 요청 하나만 허용하며 5초가 지나면 중단한다. 중지/재연결 전의 늦은 응답은 반영하지 않는다.
- 데이터셋/연속 로그 생성 중 새 요청을 멈추고 마지막 결과를 회색으로 표시한다. 작업 후 자동 재개한다.
- 서버 오류를 안전으로 바꾸지 않는다. 기존 시뮬레이터 경고와 서버 판정은 출처가 다르므로 별도 표시한다.
- 현 서버는 마스크·판정 근거·Sag 변화율을 반환하지 않는다. 해당 값이나 감지 오버레이를 만들어 표시하지 않는다.
- `/reset`은 현 서버 전역 판정기를 초기화한다. 단일 사용자 시험용이며 다중 접속은 서버 session_id 분리가 필요하다.
- Vercel은 웹 UI를 배포한다. Python 서버는 별도 실행되어 있어야 한다. 공개 웹에서는 HTTPS 서버 및 허용 CORS origin을 사용한다. localhost는 접속자의 PC를 뜻한다.

## 검증

- 제공된 브랜치 4aa60cc의 서버를 변경 없이 로컬 127.0.0.1:8011에서 실행.
- 실제 웹→/health→/analyze→CCTV/Loaded 결과 표시 확인. 0.2 신뢰도에서 imu_only/Normal과 null 비전 값 확인.
- 연속 로그 재생 중 프레임 번호가 고정되고 전송 일시 중지 표시 확인. 중지·명시적 /reset 성공 확인.
- 서버 주소 검사, null/비정상 숫자·상태 거부, 실제 모드에서 정답 힌트 제외 등 포함 68개 테스트 통과. TypeScript·Vite 빌드 통과.
- 코드 리뷰에서 차단 문제 없음. 기존 서버 알고리즘의 각도/임계값 문제는 서버 담당자가 별도 수정해야 한다.
- 데스크톱 1440×1000에서 기존 좌우 배치와 실제 CCTV 표시 확인. DOM 이미지 원본 960×540 확인. 연결 실패 후 재연결 성공 확인.

## 트러블슈팅

카메라 중심선 후처리의 기존 Point2는 [x,y] 배열이 아닌 {x,y} 객체다. 타입 검사에서 이를 발견해 공용 함수 계약에 맞췄다. 렌더링은 DatasetCaptureBridge 이후 priority 2에서 캡처해 현재 장면 변환과 IMU props를 함께 사용한다.

브라우저 시각 검증에서 판정 색상 클래스의 접두사 불일치를 발견해 수정했다. 실제 Normal 응답의 계산된 색상 rgb(112,201,187)을 확인했다.
