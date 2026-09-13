# Python 서버 연동 계획

사용자 승인 범위: 기존 통합 서버에 이미지·IMU POST, 응답 기반 표시. 서버 알고리즘과 YOLO 모델 자체는 수정하지 않는다.

- [x] 엄격한 JSON 응답 검사, URL 검사, 더미/서버 추론 요청 생성 테스트.
- [x] 기존 학습용 카메라로 960×540 RGB와 동일 순간 IMU 캡처. 라이브 화면 복원, 최대 5Hz·단일 요청.
- [x] 서버 주소·연결·시작/중지·명시적 초기화·더미 신뢰도 제어·CCTV·판정 JSON 표시.
- [x] 데이터셋/연속 로그 작업 중 서버 캡처 일시 중지, 오류/중지 후 늦은 응답 무시.
- [x] 제공된 Python 서버를 로컬 실행해 실제 요청·응답과 브라우저 확인.
- [x] 문서/README 갱신, 테스트·빌드·리뷰, GitHub push 및 기존 Vercel 배포.

계약 기준: ShipTugging/tugboat-safety feat/risk_pipeline 4aa60cc의 integration_server.py. 현재 image_base64는 무시되고 dummy mask 사용. 요청은 JSON이며 roll_deg/roll_rate_deg_s를 사용한다. 추가 frame_id/captured_at_ms는 구버전에서 무시될 수 있으므로 클라이언트가 단일 요청의 이미지와 응답을 결합한다. timestamp는 서버 시계로 별도 표시한다. 위험 상태와 기존 시뮬레이터 위험은 서로 다른 출처로 표시한다. 마스크/판단 이유는 현 서버에서 제공되지 않으므로 만들어서 표시하지 않는다.
