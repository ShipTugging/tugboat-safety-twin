# TUGGUARD FastAPI 서버

현재 버전은 **prototype-temporal-v2.0**이다. 자세한 계산·관측 품질·정책 가정·검증 결과는 [위험 판단 V2](../docs/2026-09-16-risk-v2.md)에 정리했다. 실제 사고 확률을 출력하지 않는다.

Three.js 시뮬레이터 또는 실시간 카메라 프레임을 받아 YOLO-Seg 예인줄 마스크와 IMU를 결합하고, 예인줄 처짐·각도·위험 상태를 JSON으로 반환하는 서버다.

```text
브라우저 :5173 ── JSON + Base64 JPEG ──▶ FastAPI :8000
                                      ├─ YOLO-Seg (models/best.pt)
                                      └─ risk_pipeline.py
브라우저 ◀──────── 위험 상태 JSON ──────┘
```

## 준비

- Python 3.10 이상
- 첫 설치 시 PyTorch·Ultralytics 등 대용량 패키지 다운로드가 필요하다.
- 기본 YOLO 모델은 이 저장소의 [`models/best.pt`](models/best.pt)다.

## 설치와 실행

저장소 루트에서 실행한다.

```sh
python3 -m venv server/.venv
source server/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r server/requirements.txt
python server/integration_server.py
```

정상 기동하면 `0.0.0.0:8000`에서 요청을 받는다. 서버가 시작될 때 모델을 미리 로드하므로 첫 기동에는 시간이 걸릴 수 있다.

Windows PowerShell에서는 다음처럼 가상환경을 활성화한다.

```powershell
server\.venv\Scripts\Activate.ps1
python -m pip install -r server\requirements.txt
python server\integration_server.py
```

### 모델 경로 변경

기본 경로는 `server/models/best.pt`다. 다른 모델을 시험할 때만 환경변수로 덮어쓴다.

```sh
TUGGUARD_MODEL_PATH=/absolute/path/to/best.pt python server/integration_server.py
```

## 연결 확인

서버를 실행한 컴퓨터에서 먼저 확인한다.

```sh
curl http://127.0.0.1:8000/health
```

응답 예시:

```json
{"status":"ok","uptime_s":12.4}
```

다른 컴퓨터의 브라우저가 접속할 때는 `127.0.0.1`이 아니라 서버 컴퓨터의 LAN 주소를 사용한다.

```sh
curl http://192.168.45.42:8000/health
```

연결이 안 되면 두 컴퓨터가 같은 Wi-Fi인지, 공유기에서 기기 간 통신 차단(AP/client isolation)을 하지 않는지, macOS 방화벽이 Python의 외부 수신을 허용하는지 확인한다. 공개 배포에서는 임의의 `8000` 포트를 그대로 노출하지 말고 HTTPS와 인증·방화벽을 추가한다.

## API

### `GET /health`

서버 생존 확인용이다.

### `POST /analyze`

`Content-Type: application/json`으로 보낸다.

```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "roll_deg": 1.9,
  "roll_rate_deg_s": 0.2,
  "frame_id": "2:41",
  "captured_at_ms": 1789290000000
}
```

| 필드 | 필수 | 설명 |
|---|---:|---|
| `image_base64` | 예 | data URL 또는 순수 Base64 JPEG/이미지. 실제 YOLO-Seg 추론 입력이다. |
| `roll_deg` | 예 | 해당 촬영 시점 IMU 횡경사(deg). |
| `roll_rate_deg_s` | 예 | 해당 촬영 시점 IMU 롤 속도(deg/s). |
| `frame_id`, `captured_at_ms` | 아니오 | 프론트엔드 프레임 상관관계용 메타데이터. 구버전 서버는 무시할 수 있다. |

`confidence`, `sag_ratio_hint`, `angle_hint_deg` 같은 프론트 계산값은 받지 않는다. 이미지가 없으면 요청 검증 단계에서 거부한다.

V2는 session_id(미지정 legacy), captured_at_ms 또는 timestamp_ms, frame_id, camera_context를 지원한다. 값이 없는 구버전 timestamp만 서버 도착 시각을 사용하며 clock 출처를 반환한다. 기존 각도 보정 필드 `towline_angle_corrected_deg`는 V2에서 null이고, 실제 3D 각도로 표시하지 않는다. `angle_delta_deg`는 초기 저운동 이미지 기준각 대비 편차다. 응답에 reason_codes, thresholds, policy_version, observation_status, geometry 품질 및 vision binary PNG가 추가된다. mask 좌표는 원본 영상과 같으며 foreground는 255다.

정상적으로 예인줄이 검출된 응답:

```json
{
  "timestamp": 4.281,
  "fusion_mode": "vision_imu_fused",
  "confidence": 0.914,
  "sag_ratio": 0.0534,
  "towline_angle_pixel_deg": 74.88,
  "towline_angle_corrected_deg": null,
  "roll_deg": 21.3,
  "roll_rate_deg_s": 0.0,
  "risk_state": "Loaded"
}
```

예인줄이 검출되지 않으면 observation_status=missing이며, 확인된 IMU 위험이 없을 때 UNKNOWN이다. 큰 횡경사가 지속되면 영상 없이도 Critical 등을 반환한다. 미검출은 안전을 의미하지 않는다. 비전 값은 null이며 fusion_mode는 imu_only다. 확인된 위험은 미검출만으로 해제하지 않는다.

```json
{
  "timestamp": 5.017,
  "fusion_mode": "imu_only",
  "confidence": 0.0,
  "sag_ratio": null,
  "towline_angle_pixel_deg": null,
  "towline_angle_corrected_deg": null,
  "roll_deg": 2.1,
  "roll_rate_deg_s": 0.3,
  "risk_state": "UNKNOWN"
}
```

`risk_state`의 의미는 다음과 같다.

- `Normal`: 정상 범위
- `Loaded`: 예인줄이 팽팽한 하중 상태
- `GirtingRisk`: 거팅 위험
- `Developing`: 위험으로 진행 중
- `Critical`: 즉시 대응이 필요한 임계 상태
- `UNKNOWN`: 예인줄 미검출·관측 불가. 정상으로 간주하면 안 된다.

### `POST /reset`

서버가 유지하는 최근 프레임 위험 상태 이력을 초기화한다. 새 시나리오를 시작할 때 사용한다.

```sh
curl -X POST http://127.0.0.1:8000/reset \
  -H 'Content-Type: application/json' \
  -d '{}'
```

V2 판정기는 session_id별로 분리된다. 초기화 body의 session_id가 가리키는 이력만 지운다. 미지정 구버전 요청은 공용 legacy 세션을 사용한다. 동시 요청은 세션당 하나이고 공유 모델 추론은 직렬화한다. 다중 사용자 운영 인증은 별도 설계가 필요하다.

## 프론트엔드에서 사용

1. 루트에서 `npm install` 후 `npm run dev -- --host 0.0.0.0`을 실행한다.
2. 브라우저에서 `http://localhost:5173`을 연다.
3. 관제 패널의 **Python 서버 분석** 주소에 `http://127.0.0.1:8000`을 입력한다. 다른 컴퓨터에서 접속하면 서버 컴퓨터의 IP를 입력한다.
4. **연결·분석 시작**을 누르면 실제 YOLO-Seg 분석이 시작된다.
5. 카메라는 `CCTV · 예인줄 감시(Sag)`를 선택한다. 시나리오 프리셋을 누르면 위치가 함께 바뀔 수 있으므로, 선수·선미 등 원하는 예인 위치는 프리셋 선택 후 마지막에 다시 지정한다.
6. 상태 카드에서 서버 판정, 신뢰도, Sag, 영상 각도, 롤을 확인한다.

프론트엔드는 Three.js에서 계산한 Sag·각도 힌트를 전송하지 않는다. 서버가 CCTV 이미지의 YOLO-Seg 마스크에서 해당 값을 계산한다.

## 운영 메모

- CORS는 데모를 위해 모든 origin을 허용한다. 운영 시 `allow_origins`를 실제 프론트엔드 origin으로 제한한다.
- Vercel에 프론트엔드를 배포해도 Python 서버가 자동으로 배포되지는 않는다. 서버는 별도 호스트에서 계속 실행되어야 한다.
- HTTPS 페이지에서 HTTP `192.168.x.x:8000`으로 요청하면 브라우저의 Mixed Content 정책에 막힐 수 있다. 운영은 프론트엔드와 API 모두 HTTPS를 사용한다.
- 서버 오류·타임아웃은 `Normal`로 바꾸지 않는다. 프론트엔드는 마지막 수신 결과와 현재 서버 상태를 구분해 표시한다.
- 이 서버와 시뮬레이터의 물리식·위험 임계값은 교육·시연용이다. 실제 선박 운항 판단이나 안전 인증에 사용하지 않는다.
