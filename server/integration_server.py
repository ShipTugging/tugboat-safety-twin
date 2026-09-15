"""
TUGGUARD - 통합 파이프라인 서버 (강영한 담당)

역할: Three.js 시뮬레이터/실카메라가 보낸 이미지+IMU 데이터를 받아서,
     제원이의 실제 YOLO-Seg 모델(models/best.pt, 클래스: {0: 'towline'})
     추론 결과와 risk_pipeline.py를 거쳐 위험판단 JSON을 만들고,
     다시 클라이언트로 돌려준다.

[Client] --POST(image, imu)--> [이 서버] --JSON--> [Client]

/analyze는 image_base64를 필수로 받고 실제 YOLO 추론(run_yolo_seg)만 수행한다.
"""

import base64
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO

from risk_pipeline import process_frame, RiskStateClassifier


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 첫 /analyze 요청에서 로딩 지연이 생기지 않도록 서버 기동 시점에 미리 로드
    get_model()
    yield


app = FastAPI(title="TUGGUARD Integration Server", lifespan=lifespan)

# Three.js(브라우저)에서 다른 포트로 요청이 오니까 CORS 허용 필요
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 데모 단계라 전체 허용, 배포 시엔 좁혀야 함
    allow_methods=["*"],
    allow_headers=["*"],
)

# 위험 상태는 "최근 프레임 이력"을 기억해야 하므로, 서버가 켜져있는 동안
# 하나의 시나리오만 돈다고 가정하고 전역으로 하나만 둔다.
# (여러 클라이언트/시뮬레이션을 동시에 돌리려면 session_id별로 나눠야 함 - 지금은 범위 밖)
classifier = RiskStateClassifier(window=5)
_start_time = time.time()

# 저장소에 함께 넣은 기본 모델을 사용한다. 외부 모델을 시험할 때만
# TUGGUARD_MODEL_PATH 환경변수로 경로를 덮어쓸 수 있다.
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "models" / "best.pt"
MODEL_PATH = Path(os.getenv("TUGGUARD_MODEL_PATH", str(DEFAULT_MODEL_PATH))).expanduser()
_yolo_model: YOLO | None = None


def get_model() -> YOLO:
    """모델을 최초 1회만 로드하고 이후 재사용 (매 요청마다 로드하면 느려짐)."""
    global _yolo_model
    if _yolo_model is None:
        _yolo_model = YOLO(str(MODEL_PATH))
    return _yolo_model


class FrameRequest(BaseModel):
    """클라이언트가 매 프레임 보내는 데이터 형태."""
    image_base64: str                 # data:image/jpeg;base64,... 또는 순수 base64
    roll_deg: float = 0.0
    roll_rate_deg_s: float = 0.0


def decode_image_base64(image_base64: str) -> np.ndarray:
    """data URL 접두사(data:image/...;base64,) 유무에 상관없이 BGR 이미지로 디코딩."""
    if image_base64.startswith("data:") and "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]
    raw = base64.b64decode(image_base64)
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("image_base64를 이미지로 디코딩하지 못했습니다.")
    return image


def run_yolo_seg(image: np.ndarray) -> tuple[np.ndarray | None, float]:
    """
    제원이의 YOLO-Seg 모델(단일 클래스 'towline')로 추론.

    반환: (mask, confidence)
      - mask: image와 동일한 원본 해상도 (H, W), nonzero == towline.
        towline이 검출되지 않으면 None.
      - confidence: 검출 confidence (0.0 ~ 1.0). 미검출 시 0.0.

    mask 해상도 복원 방법: r.masks.xy(이미 원본 해상도 기준 polygon 좌표)를
    cv2.fillPoly로 새 (H, W) 배열에 직접 그린다 (r.masks.data를 cv2.resize로
    확대하는 방법 대비 채택). camera.mp4 프레임 0/120/240/360/479에서 두
    방법을 synchronized.jsonl의 검증된 mask와 비교했을 때, resize는 960x544
    -> 1280x720 보간 과정에서 skeleton 경계가 흐트러져 sag_ratio/각도 오차가
    더 컸고, polygon 재작도 방식이 대부분의 프레임에서 ground-truth에 더
    가까웠다 (세부 비교는 handoff 문서 참고).
    """
    model = get_model()
    results = model(image, verbose=False)
    r = results[0]

    if r.masks is None or r.boxes is None or len(r.boxes.conf) == 0:
        return None, 0.0

    h, w = image.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    polygon = r.masks.xy[0].astype(np.int32)
    cv2.fillPoly(mask, [polygon], 1)

    confidence = float(r.boxes.conf[0])
    return mask, confidence


@app.get("/health")
def health_check():
    """서버가 살아있는지 확인하는 용도. Three.js에서 연결 전 핑 날려보기 좋음."""
    return {"status": "ok", "uptime_s": round(time.time() - _start_time, 1)}


@app.post("/analyze")
def analyze_frame(req: FrameRequest):
    """클라이언트 이미지에 실제 YOLO-Seg와 위험 파이프라인을 실행한다."""
    timestamp = round(time.time() - _start_time, 3)
    image = decode_image_base64(req.image_base64)
    mask, confidence = run_yolo_seg(image)

    if mask is None:
        # towline 미검출: geometry 계산을 시도하지 않고 UNKNOWN으로 분류한다.
        # (risk_pipeline.process_synchronized_record가 synchronized.jsonl의
        # towline_detected == False를 다루는 것과 동일한 컨벤션 -- SAFE가 아님)
        return {
            "timestamp": timestamp,
            "fusion_mode": None,
            "confidence": round(confidence, 3),
            "sag_ratio": None,
            "towline_angle_pixel_deg": None,
            "towline_angle_corrected_deg": None,
            "roll_deg": round(req.roll_deg, 2),
            "roll_rate_deg_s": round(req.roll_rate_deg_s, 2),
            "risk_state": "UNKNOWN",
        }

    result = process_frame(
        mask=mask,
        confidence=confidence,
        roll_deg=req.roll_deg,
        roll_rate_deg_s=req.roll_rate_deg_s,
        classifier=classifier,
        timestamp=timestamp,
    )
    return result


@app.post("/reset")
def reset_classifier():
    """새 시나리오를 처음부터 돌릴 때, 위험 상태 이력을 초기화."""
    global classifier
    classifier = RiskStateClassifier(window=5)
    return {"status": "reset"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
