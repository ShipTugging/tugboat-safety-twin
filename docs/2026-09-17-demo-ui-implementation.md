# 시연 UI 구현 계획

- 승인된 기획: 2026-09-17-demo-ui-plan.md
- 목표: 1280×720에서 장면과 주요 분석·조작을 스크롤 없이 표시한다.
- 구조: App의 하단 도크를 오른쪽 DemoPanel로 대체한다. 기존 Dashboard와 ScenarioControlDock은 추가 도구 대화상자에 보존한다. 서버 훅과 물리·캡처 계약은 그대로 사용한다.
- [ ] 공통 한국어 위험·융합 표시와 compact DemoPanel 작성
- [ ] App 배치 변경, 키보드 접근 가능한 추가 도구 dialog 연결
- [ ] 720p·1080p·좁은 화면 검증, 실제 서버 연결 및 실패 상태 확인
- [ ] 테스트·빌드·README·회귀 기록 갱신, 명시 파일만 commit/push
- [ ] 기존 Vercel 프로젝트 배포와 공개 URL 확인
