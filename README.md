# TUG GUARD · 해양 안전 디지털 트윈

항만에서 본선과 ASD 예인선의 관계, 예인줄 장력, 거팅·후류·흡인 위험을 탐색하는 인터랙티브 시뮬레이터입니다.

- [공개 사이트](https://tugboat-safety-twin.vercel.app)
- 기술: React 18 · TypeScript · Vite 5 · Three.js · React Three Fiber · Tailwind CSS

## 화면과 기능

- 넓은 해양 장면, 접을 수 있는 관제 패널, 네 가지 시나리오를 고르는 하단 조작부
- 시간대별 바다·조명, 수면에 합성한 항적과 포말, 부두·크레인 배경
- 개별 적층 컨테이너, 골판 재질, 선체를 따르는 수선 띠, 창문·난간·예인선 방충재
- 자연 장면/위험 분석 레이어, 기존 다섯 시점 + 선미 덱/조타실 CCTV, 고품질/기본 화질
- 운항 개요·레이더·추이·센서 탭과 세부 파라미터
- 상시 접근 가능한 비상 예인줄 분리/재연결
- 실제 시뮬레이션 관측값을 기록하는 시나리오 점검창; 완료/취소 시 원래 설정 복원
- Normal Map 기반 수면, 맑음~해무 무작위화, 45RPM 이상 백색 후류(115RPM에서 방출량·크기 2배)
- AI 데이터 생성 모드: 예인줄 Sag 분할(YOLO-Seg + 픽셀 마스크) / 객체 탐지 박스 ZIP 자동 다운로드
- 예인줄 처짐 HUD와 센서 탭의 Sag 파이프라인 카드(SagRatio·5단계·장력·IMU 횡경사)
- 예인선 탑재 고정 시점 `CCTV · 예인줄 감시(Sag)`
- 예인 위치 프리셋: 선미·좌현·우현·선수, 위치별 연결점·방위·거리·카메라 연동

## 예인줄 Sag 분할 데이터셋 (기본)

팀 1차 목표(거팅 감지)에 맞춰, 예인선 탑재 고정 시점에서 예인줄 처짐(sag)을 분할하고 SagRatio를 학습하는 데이터를 만든다. 상세 설계와 노션 요구사항 대응표는 [docs/2026-09-07-towline-sag-dataset.md](docs/2026-09-07-towline-sag-dataset.md).

우측 패널 **AI 데이터 생성 모드** → **예인줄 Sag 분할** → 이미지 수·시드 → **AI 데이터셋 캡처**. 기본 100장, 1~500장, 960×540.

**캡처 위치**는 기본적으로 현재 운항 위치를 따릅니다. 선미·좌현·우현·선수를 직접 지정하거나 **네 방향 혼합**을 선택할 수 있습니다. 혼합 시 20장마다 네 방향 × Sag 5단계를 모두 포함합니다. 선택은 작업 시작 시 고정되며 완료·취소 후 기존 운항 설정과 카메라로 복귀합니다.

**렌즈 상태**는 맑음·흐림·물 튐 또는 자동 혼합을 지원합니다. 흐림은 1~4px Gaussian blur, 물 튐은 전체 약한 흐림과 물방울 영역의 강한 흐림·반사광을 적용합니다. 이미지 좌표를 휘게 만들지는 않으므로 깨끗한 기하학적 마스크/Sag 정답은 유지됩니다. `metadata.json`과 `sag_labels.csv`에 `towPosition`, `lensCondition`, `imageBlurPx`, `lensWetness`, `lensSeed`를 기록합니다(CSV는 snake_case 열 이름).

```text
towline_sag_seg_dataset.zip
├─ images/frame_0001.jpg      JPEG(선택한 렌즈 상태 증강)
├─ labels/frame_0001.txt      YOLO-Seg 폴리곤: class x1 y1 x2 y2 ...
├─ masks/frame_0001.png       로프 픽셀 마스크(가림 반영, 흰색 = 로프)
├─ imu/frame_0001.json        같은 시점 IMU + 직전 0.2초 구간
├─ imu.csv                   이미지당 IMU 1행
├─ imu_windows.csv           이미지당 100Hz IMU 21행
├─ imu_schema.json           축·단위·중력·타임스탬프 정의
├─ classes.txt / data.yaml    Ultralytics 학습 설정
├─ sag_labels.csv             프레임별 단계·SagRatio(3D/영상)·장력·환경
└─ metadata.json
```

| ID | 클래스 | SagRatio = 최대 처짐 / 양끝 거리 |
|---|---|---|
| 0 | Towline_Sag_L0 매우 팽팽함 | < 0.006 (320 kN 이상·CRITICAL은 항상 직선) |
| 1 | Towline_Sag_L1 약간 처짐 | 0.006 ~ 0.02 |
| 2 | Towline_Sag_L2 중간 | 0.02 ~ 0.04 |
| 3 | Towline_Sag_L3 많이 처짐 | 0.04 ~ 0.065 |
| 4 | Towline_Sag_L4 매우 느슨함 | ≥ 0.065 |
| 5 | Ship_Stern | 선미 영역 4점 박스 폴리곤 |

- 인덱스 `i % 5`가 목표 단계다. 정착된 물리 상태의 현 길이·장력에 맞춰 여유 로프를 역산하므로 라벨은 렌더된 곡선과 정확히 일치한다.
- 무작위화: 시간대·태양·안개·파고·상선 선체 색·로프 색·로프 두께·카메라 위치/회전 지터·FOV·렌즈 흐림·물 튐.
- 마스크는 장면 깊이 버퍼를 채운 뒤 로프만 다시 그려 만들기 때문에 선체·물에 가려진 부분이 자동으로 제외된다. 폴리곤은 튜브 실루엣의 근사(검증 캡처 IoU 평균 0.85)이며, 픽셀 정밀도가 필요하면 마스크를 사용한다.
- 3D SagRatio(물리 정답)와 영상 SagRatio(카메라가 보는 값)를 모두 기록한다.

```sh
npm test
python scripts/verify-dataset.py towline_sag_seg_dataset.zip --count 100 --preview preview.png
python scripts/sag_from_mask.py towline_sag_seg_dataset.zip --compare      # 마스크 → 중심선 → SagRatio
yolo segment train data=data.yaml model=yolo11n-seg.pt imgsz=960          # Ultralytics 예시
```

## 객체 탐지 박스 데이터셋

**객체 탐지 박스**를 선택하면 기존 방식으로 자유/CCTV 시점을 순환하며 YOLO 박스를 만든다(`synthetic_tug_dataset.zip`).

| ID | 클래스 | 기준 |
|---|---|---|
| 0 | Tugboat | 예인선. 자체 CCTV에서는 자선 라벨 제외 |
| 1 | Towline_Taut | 320kN 이상 또는 CRITICAL, 직선형 줄 |
| 2 | Towline_Slack | 나머지 연결 상태, 여유 로프·장력에 따른 처짐 |
| 3 | Ship_Stern | 대형선의 선미 영역(local Z ≤ -21) |

라벨 형식은 `class_id x_center y_center width height`입니다. Box3 투영 후 near/far 평면과 화면 경계를 잘라 0~1로 정규화합니다. 화면 밖·완전 가림 표본은 제외하며 부분 가림은 전체 3D 경계상자의 투영 영역을 사용합니다. 객체가 보이지 않는 이미지는 빈 라벨의 음성 표본으로 저장됩니다.

시드는 조명·안개·파도·조향·줄 길이·RPM·카메라·물리 상태를 재현합니다. GPU와 실시간 회전 부품 때문에 픽셀까지 동일함을 보장하지 않습니다. 학습/검증용 데이터는 서로 다른 시드와 수집 실행으로 분리하고 실제 영상으로 별도 검증해야 합니다. AI 모델 학습과 실제 센서 연결은 이 내보내기 기능에 포함되지 않습니다.

## 비전 + IMU 동기 데이터

Sag와 객체 탐지 모드 모두 IMU를 자동으로 함께 저장합니다. `frame_0001.jpg` ↔ `imu/frame_0001.json` ↔ `imu.csv`의 `frame_id=frame_0001`로 결합하세요. 이미지의 물리 시뮬레이션 타임스탬프와 IMU의 마지막 샘플 타임스탬프가 동일합니다.

- 3축 가속도: 모델 본체 좌표의 specific force, 단위 m/s², 중력 반영. 직립 정지 상태는 `[0,9.80665,0]`.
- 3축 각속도: 모델 본체 좌표, 단위 rad/s.
- 자세: quaternion `[x,y,z,w]` 및 Euler XYZ `[pitch,yaw,roll]` 도 단위.
- 촬영 직전 200ms부터 촬영 시점까지 100Hz(21개) 구간을 프레임별 JSON과 `imu_windows.csv`에 저장.
- 물 튐·흐림은 RGB에만 적용되어 같은 순간의 IMU와 함께 융합 학습에 사용할 수 있습니다.

IMU는 실제 장비 측정이 아닌 노이즈 없는 모델 기반 합성값입니다. 축은 Three.js 예인선 모델 좌표(+Y 위, +Z 선수)이며 하드웨어 좌표계와 자동 호환된다고 가정하면 안 됩니다. 각 이미지는 별도로 무작위화된 장면이므로 서로 다른 `frame_id`의 IMU 구간을 연속 항해 시계열처럼 이어 붙이지 마세요. 상세 내용은 [동기 IMU 설계와 검증](docs/2026-09-09-vision-imu.md)을 참고하세요.

## 연속 위험 전환 로그

관제 패널의 **연속 위험 전환 로그**에서 시나리오를 선택하고 **실행·로그 생성**을 누르세요. 20초를 100Hz로 계산해 2,001행 CSV와 그래프를 만들고 같은 궤적을 재생합니다. **3종 비교 ZIP**은 정상 유지·느린 전환·빠른 전환의 CSV 3개, SVG 그래프 3개, 조건 설명 `conditions.json`을 저장합니다. 현재 예인 위치(선미·좌현·우현·선수)와 환경을 사용합니다.

`time_s`를 기준으로 `sag_ratio`, `sag_ratio_rate_per_s`, `heading_rope_3d_deg`, `roll_deg`, `roll_rate_deg_per_s`와 6축 IMU를 함께 분석하세요. Sag는 렌더링에 사용한 3D 줄 처짐/양 끝 직선거리이며 YOLO 영상 추정값과 다릅니다. 실제 선수 방향–예인줄 각도(0–180°), 평면 각도, 예각도 별도 열입니다. `model_driver_angle_deg`와 `model_girting_status`는 기존 모델 입력·판정이므로 실제 위험 정답이나 검증된 임계값으로 취급하지 마세요.

전환은 5초부터 시작하며 느린 전환은 10초, 빠른 전환은 1초 동안 진행합니다. 줄 처짐은 0.3초 시정수의 모델을 사용하므로 변화율 임계값은 이 가정에 영향을 받습니다. 기존 무작위 이미지 데이터셋과 달리 하나의 물리 상태를 시간순으로 적분합니다. [설계·조건](docs/2026-09-10-continuous-risk-plan.md), [검증 기록](docs/2026-09-10-continuous-risk-validation.md)을 참고하세요.

## 실행

```sh
npm install
npm run dev
npm run test:physics
npm test
npm run build
npm run preview
```

개발 서버 기본 포트는 5173입니다. 별도 API 키나 외부 모델 다운로드 없이 실행됩니다.

## 조작

| 조작 | 기능 |
|---|---|
| 마우스 드래그 / 휠 | 자유 시점 회전 / 확대 |
| 1–5 | 자유 / 추적 / 선교 / 상공 / 시네마틱 |
| T | 주간 → 황혼 → 야간 |
| M | 음향 켜기/끄기 (초기 음소거) |
| F | 관제 패널 접기/열기 |
| Space | 예인줄 분리/재연결 |
| 카메라 선택 | CCTV · 예인줄 감시(Sag) = 데이터셋과 같은 고정 시점 |
| 운항 파라미터 → 예인 위치 | 선미 / 좌현 / 우현 / 선수 전환 |

입력 필드·버튼·점검창을 조작할 때는 전역 단축키가 개입하지 않습니다. 모바일에서는 상하 스크롤로 관제 패널을 이용합니다.

## 데이터와 검증 범위

이 프로젝트는 **시나리오 시뮬레이터**이며 실제 센서, 카메라, AI 추론, 선박 제어와 연결되어 있지 않습니다. 선박 명칭과 항만은 시각화를 위한 가상 설정입니다. 물리식과 위험 임계값은 교육·데모 목적이며 실제 운항 판단이나 인증을 대체하지 않습니다.

`npm test`는 실제 공용 물리 엔진, 처짐 모델과 여유 로프 역산, 단계 도달성, 폴리곤 투영, 카메라 프레이밍, 거품·아카이브를 검증합니다. 기존 `test:physics`는 계산식 복사본 검사로 유지합니다. 선체 근접 프리셋은 현재 엔진에서 약 12~13m 이격으로 나타나며 반드시 CRITICAL을 발생시키는 프리셋은 아닙니다.

고품질은 그림자와 높은 수면 분할을 사용하며 픽셀 비율을 최대 1.5로 제한합니다. 성능이 부족하면 기본 화질을 선택하세요. 실시간 선박 반사·완전한 부력 해석·실사 모델은 현재 구현 범위에 포함하지 않습니다.

## 문서

- [디자인 검토와 예상 문제](docs/2026-09-07-design-review.md)
- [구현 계획](docs/2026-09-07-implementation-plan.md)
- [트러블슈팅과 검증 기록](docs/2026-09-07-troubleshooting.md)
- [합성 데이터 설계](docs/2026-09-07-synthetic-dataset-plan.md)
- [합성 데이터 검증과 트러블슈팅](docs/2026-09-07-synthetic-dataset-validation.md)
- [예인선 위치 확장 설계와 검증](docs/2026-09-09-tow-positions.md)
- [전방향 데이터셋·물 튐 렌즈 검증](docs/2026-09-09-dataset-positions-lens.md)
- [비전·IMU 동기 데이터 설계](docs/2026-09-09-vision-imu.md)

.env 및 API 키 등 민감정보는 저장소에 추가하거나 푸시하지 않습니다.

## 라이선스

MIT License.
