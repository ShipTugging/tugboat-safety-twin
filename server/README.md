# TUGGUARD FastAPI 서버

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
| `image_base64` | 아니오 | data URL 또는 순수 Base64 JPEG/이미지. 있으면 실제 YOLO-Seg 추론을 수행한다. |
| `roll_deg` | 아니오 | IMU 횡경사(deg). 기본값 `0`. |
| `roll_rate_deg_s` | 아니오 | IMU 롤 속도(deg/s). 기본값 `0`. |
| `confidence` | 아니오 | 이미지가 없을 때 더미 추론 신뢰도. 기본값 `0.9`. |
| `sag_ratio_hint` | 아니오 | 이미지가 없을 때 더미 처짐 힌트. 기본값 `0.15`. |
| `angle_hint_deg` | 아니오 | 이미지가 없을 때 더미 각도 힌트. 기본값 `30`. |
| `frame_id`, `captured_at_ms` | 아니오 | 프론트엔드 프레임 상관관계용 메타데이터. 구버전 서버는 무시할 수 있다. |

`image_base64`가 있으면 `confidence`, `sag_ratio_hint`, `angle_hint_deg`는 사용하지 않는다. 이미지가 없을 때는 더미 마스크 폴백이 동작하므로 통신 구조만 먼저 시험할 수 있다.

정상적으로 예인줄이 검출된 응답:

```json
{
  "timestamp": 4.281,
  "fusion_mode": "vision_imu_fused",
  "confidence": 0.914,
  "sag_ratio": 0.0534,
  "towline_angle_pixel_deg": 74.88,
  "towline_angle_corrected_deg": -25.02,
  "roll_deg": 21.3,
  "roll_rate_deg_s": 0.0,
  "risk_state": "Loaded"
}
```

예인줄이 검출되지 않은 응답은 `UNKNOWN`이다. 이는 안전하다는 뜻이 아니며, 관측이 없으므로 비전 값과 `fusion_mode`가 `null`이다.

```json
{
  "timestamp": 5.017,
  "fusion_mode": null,
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

현재 판정기는 전역 하나이므로 단일 시연 세션을 기준으로 한다. 여러 선박·사용자가 동시에 접속하는 서비스에서는 `session_id`별 판정기와 인증을 별도로 설계해야 한다.

## 프론트엔드에서 사용

1. 루트에서 `npm install` 후 `npm run dev -- --host 0.0.0.0`을 실행한다.
2. 브라우저에서 `http://localhost:5173`을 연다.
3. 관제 패널의 **Python 서버 분석** 주소에 `http://127.0.0.1:8000`을 입력한다. 다른 컴퓨터에서 접속하면 서버 컴퓨터의 IP를 입력한다.
4. 실제 모델을 사용하려면 **더미 서버 통신 테스트**를 끄고 **연결·분석 시작**을 누른다.
5. 카메라는 `CCTV · 예인줄 감시(Sag)`를 선택한다. 시나리오 프리셋을 누르면 위치가 함께 바뀔 수 있으므로, 선수·선미 등 원하는 예인 위치는 프리셋 선택 후 마지막에 다시 지정한다.
6. 상태 카드에서 서버 판정, 신뢰도, Sag, 영상 각도, 롤을 확인한다.

더미 모드는 Python 서버가 살아있는지와 브라우저 요청·응답 계약을 빠르게 확인하는 용도다. 실제 YOLO-Seg 검증은 더미 체크를 끈 상태에서 카메라 이미지를 전송할 때 수행된다.

## 운영 메모

- CORS는 데모를 위해 모든 origin을 허용한다. 운영 시 `allow_origins`를 실제 프론트엔드 origin으로 제한한다.
- Vercel에 프론트엔드를 배포해도 Python 서버가 자동으로 배포되지는 않는다. 서버는 별도 호스트에서 계속 실행되어야 한다.
- HTTPS 페이지에서 HTTP `192.168.x.x:8000`으로 요청하면 브라우저의 Mixed Content 정책에 막힐 수 있다. 운영은 프론트엔드와 API 모두 HTTPS를 사용한다.
- 서버 오류·타임아웃은 `Normal`로 바꾸지 않는다. 프론트엔드는 마지막 수신 결과와 현재 서버 상태를 구분해 표시한다.
- 이 서버와 시뮬레이터의 물리식·위험 임계값은 교육·시연용이다. 실제 선박 운항 판단이나 안전 인증에 사용하지 않는다.
