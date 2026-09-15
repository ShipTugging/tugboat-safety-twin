"""
TUGGUARD - 예인선 거딩 위험 감지 파이프라인 (강영한 담당 파트)

흐름:
  Mask (YOLO-Seg 출력, 지금은 더미로 생성)
    -> Skeleton 추출
    -> SagRatio 계산
    -> Towline Angle(픽셀 기준, beta) 계산
    -> IMU Roll(alpha)로 보정 -> 실제 3D 각도(gamma)
    -> Confidence 기반 Vision/IMU Fusion
    -> 위험 상태 분류 (Normal -> Loaded -> Girting Risk -> Developing -> Critical)
    -> JSON 출력 (이후 파이프라인/UI로 전달될 형태)

지금은 실제 YOLO-Seg가 아니라 더미 mask 생성기로 전체 흐름이 끊김 없이
동작하는지만 확인한다. 나중에 generate_dummy_mask() 자리에 실제
YOLO-Seg 추론 결과(mask, confidence)를 꽂아 넣으면 된다.
"""

import base64
import io
import json
import math
from collections import deque

import numpy as np
from PIL import Image
from skimage.morphology import skeletonize


# ---------------------------------------------------------------------------
# 0. 더미 Mask 생성기 (실제로는 YOLO-Seg가 이 자리를 대체함)
# ---------------------------------------------------------------------------
def generate_dummy_mask(sag_ratio: float, angle_deg: float,
                         shape=(480, 640), thickness: int = 3) -> np.ndarray:
    """
    처짐 정도(sag_ratio)와 화면상 각도(angle_deg)를 지정해서
    그럴듯한 예인줄 모양의 binary mask를 만든다.
    (실제 파이프라인에서는 이 함수 대신 YOLO-Seg의 출력 mask를 사용)
    """
    h, w = shape
    mask = np.zeros((h, w), dtype=np.uint8)

    # 화면 하단 중앙(예인선 선미)에서 화면 위쪽(상선 쪽)으로 줄이 뻗어나간다고 가정
    start = np.array([w * 0.5, h * 0.95])
    length = h * 0.7
    angle_rad = math.radians(angle_deg)
    end = start + np.array([math.sin(angle_rad), -math.cos(angle_rad)]) * length

    n_points = 200
    t = np.linspace(0, 1, n_points)
    # 직선 보간
    line = start[None, :] * (1 - t[:, None]) + end[None, :] * t[:, None]
    # 중앙이 sag_ratio 만큼 옆으로 처지는 포물선 형태 추가
    perp = np.array([-(end - start)[1], (end - start)[0]])
    perp = perp / (np.linalg.norm(perp) + 1e-6)
    bow = 4 * t * (1 - t)  # 0->1->0, 중앙에서 최대
    sag_pixels = sag_ratio * length
    curve = line + perp[None, :] * (bow[:, None] * sag_pixels)

    for x, y in curve:
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < w and 0 <= yi < h:
            mask[max(0, yi - thickness):yi + thickness,
                 max(0, xi - thickness):xi + thickness] = 1

    return mask


# ---------------------------------------------------------------------------
# 1. Mask -> Skeleton
# ---------------------------------------------------------------------------
def extract_skeleton_points(mask: np.ndarray) -> np.ndarray:
    """binary mask를 1픽셀 폭 skeleton으로 깎고, 좌표(y,x) 배열로 반환."""
    skeleton = skeletonize(mask.astype(bool))
    ys, xs = np.nonzero(skeleton)
    points = np.stack([xs, ys], axis=1)  # (N, 2) -> (x, y)
    return points


def order_points_along_line(points: np.ndarray) -> np.ndarray:
    """
    skeleton 좌표들의 주성분(PCA, 분산이 가장 큰 방향)을 구해서 그 축에
    투영한 값 기준으로 정렬한다. 예인줄의 화면상 방향(세로/가로/대각선
    등)에 관계없이 "선을 따라가는 순서"를 안정적으로 근사한다.

    (기존에는 y좌표만 보고 정렬했는데, 이는 예인줄이 대체로 세로
    방향이라는 가정에 의존한다. camera.mp4 기준 실측 데이터에서 예인줄이
    대각선/가로에 가깝게 뻗어있는 프레임이 확인되어, 방향에 무관하게
    동작하도록 일반화했다.)

    PCA(SVD)로 구한 주축은 부호(+/-)가 프레임마다 임의로 뒤집힐 수 있다
    (축 자체는 유일하지만 방향은 수학적으로 동등한 두 선택지가 있음).
    이를 그대로 두면 points[0]/points[-1]이 프레임마다 임의로 뒤바뀌어
    compute_towline_angle_pixel()이 계산하는 각도가 프레임 간 약 180도씩
    튀는 문제가 생긴다. 이를 막기 위해 정렬 후 항상 points[-1](예인선
    쪽 끝)의 y좌표가 points[0](상선 쪽 끝)보다 크도록(화면에서 더
    아래) 방향을 고정한다 -- 카메라가 예인선에 설치되어 있어 예인줄이
    연결된 쪽이 항상 화면 하단에 더 가깝다는 촬영 구도를 이용한
    기준점 고정이다.
    """
    if len(points) < 2:
        return points

    centered = points - points.mean(axis=0)
    _, _, vt = np.linalg.svd(centered)
    main_axis = vt[0]
    projections = centered @ main_axis
    order = np.argsort(projections)
    ordered = points[order]

    if ordered[-1, 1] < ordered[0, 1]:
        ordered = ordered[::-1]

    return ordered


# ---------------------------------------------------------------------------
# 2. SagRatio 계산
# ---------------------------------------------------------------------------
def compute_sag_ratio(points: np.ndarray) -> float:
    """
    SagRatio = MaxDeviation / EndpointDistance
    - 양 끝점을 잇는 직선 대비, skeleton이 가장 많이 벗어난 거리(MaxDeviation)
    - EndpointDistance: 양 끝점 사이 거리
    """
    if len(points) < 2:
        return 0.0

    p1, p2 = points[0].astype(float), points[-1].astype(float)
    line_vec = p2 - p1
    line_len = np.linalg.norm(line_vec)
    if line_len < 1e-6:
        return 0.0
    line_unit = line_vec / line_len

    # 점-직선 거리 (외적의 크기)
    rel = points.astype(float) - p1[None, :]
    proj_len = rel @ line_unit
    proj_point = p1[None, :] + proj_len[:, None] * line_unit[None, :]
    dist = np.linalg.norm(points.astype(float) - proj_point, axis=1)

    max_deviation = float(np.max(dist))
    return max_deviation / line_len


# ---------------------------------------------------------------------------
# 3. Towline Angle 계산 (픽셀 기준, beta)
# ---------------------------------------------------------------------------
def compute_towline_angle_pixel(points: np.ndarray) -> float:
    """
    skeleton 양 끝점을 잇는 방향과, 예인선 중심축(화면 기준 수직 방향, y축)
    사이의 각도(도)를 반환. 0도 = 정중앙(centerline)과 일치.
    """
    if len(points) < 2:
        return 0.0
    # points는 y 오름차순 정렬 상태 -> points[-1]이 화면 하단(예인선 쪽, 시작점),
    # points[0]이 화면 상단(상선 쪽, 끝점)
    p1, p2 = points[-1].astype(float), points[0].astype(float)
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    # 화면 기준 수직(위쪽) 방향을 0도 기준으로 잡음
    beta = math.degrees(math.atan2(dx, -dy))
    return beta


# ---------------------------------------------------------------------------
# 4. IMU Roll 보정 (JMSE 2020 논문 공식 기반)
#    tan(gamma) = (y0*tan(alpha) - y0*tan(beta)) / (z0 + z0*tan(beta)*tan(alpha))
# ---------------------------------------------------------------------------
def correct_roll(beta_deg: float, roll_deg: float,
                  y0: float = 10.0, z0: float = 70.0) -> float:
    """
    Zou et al., "A Novel Vision-Based Towing Angle Estimation for
    Maritime Towing Operations" (JMSE 2020), Eq. (11) 구현.

    tan(gamma) = (y0*tan(alpha) - y0*tan(beta)) / (z0 + z0*tan(beta)*tan(alpha))

    전제:
    - 예인줄 부착점(P1)이 예인선 선수(bow) 중심축(centerline) 위에 있다고
      가정 (x0=0). 논문 원본은 카메라를 선미(stern)에 달았지만, 우리
      TUGGUARD 시나리오에서는 카메라/부착점이 선수(bow)에 위치함 —
      공식 자체는 축 정의만 일관되면 되는 일반식이라 그대로 적용 가능.
    - Pitch는 작다고 가정, Roll(alpha)만 보정 대상으로 삼음
    - beta_deg는 raw 픽셀 좌표 차분으로 계산된 각도 — 카메라 초점거리/
      오프셋은 두 점 차분 과정에서 소거되므로 별도 캘리브레이션 없이 사용 가능

    beta_deg: 화면(픽셀)에서 잰 예인줄 각도
    roll_deg: IMU에서 받은 배의 Roll 각도 (alpha)
    y0, z0  : 카메라 설치 높이/거리 (m 단위, 배포 시 실측 캘리브레이션 필요)
    반환값  : Roll 왜곡을 보정한 3D 세계좌표계 상의 실제 예인줄 각도(gamma, 도)
    """
    beta = math.radians(beta_deg)
    alpha = math.radians(roll_deg)

    denom = z0 + z0 * math.tan(beta) * math.tan(alpha)
    if abs(denom) < 1e-6:
        return beta_deg  # 특이점 방지, 보정 없이 원값 반환

    tan_gamma = (y0 * math.tan(alpha) - y0 * math.tan(beta)) / denom
    gamma = math.degrees(math.atan(tan_gamma))
    return gamma


# ---------------------------------------------------------------------------
# 5. Confidence 기반 Vision/IMU Fusion 모드 결정
# ---------------------------------------------------------------------------
def decide_fusion_mode(confidence: float) -> str:
    if confidence > 0.7:
        return "vision_imu_fused"      # 정상 융합
    elif confidence > 0.3:
        return "imu_primary"           # 비전은 보조 신호만
    else:
        return "imu_only"              # 비전 배제, IMU 단독


# ---------------------------------------------------------------------------
# 6. 위험 상태 분류 (최근 프레임 이력 기반)
# ---------------------------------------------------------------------------
class RiskStateClassifier:
    """
    최근 N프레임의 SagRatio / Towline Angle(gamma) / Roll rate를 보고
    Normal -> Loaded -> GirtingRisk -> Developing -> Critical 단계를 판단.

    보정 근거: 김태희 팀원 제공 risk_transition_logs 시뮬레이션 데이터
    (normal_steady, normal_to_girting_fast/slow, 2026-09-11) 분석 결과.

    핵심 발견 3가지:
    1. 정상 운항 시 예인줄 각도(gamma)는 0도가 아니라 설치 기준각
       (baseline) 부근에서 유지됨 (실측 baseline ~= 22.4도). 즉
       "절대각도"가 아니라 "기준각 대비 편차(Δ)"가 진짜 위험 지표임.
    2. fast/slow 시나리오 모두 "기준각 대비 약 56도 벗어나면 WARNING급,
       약 87도 벗어나면 CRITICAL급"으로 *동일한 각도값*에서 전이됨.
       즉 시뮬레이터 판정은 변화 "속도"가 아니라 각도의 절대 편차로
       결정되는 구조로 확인됨.
    3. SagRatio는 단독 위험 지표로 부적합: slow 시나리오는 WARNING이
       뜨기 한참 전에 이미 SagRatio가 0에 근접(완전히 팽팽해짐) ->
       "얼마나 팽팽한지"만으론 위험 단계를 구분 못 함. 따라서 SagRatio는
       "Loaded(당겨지기 시작함)" 1차 신호로만 사용하고, 실제 위험 단계
       판정은 각도(Δ)가 맡는다. Roll rate도 WARNING 시점 값이 시나리오간
       크게 달라(25.4 vs 3.5 deg/s) 단독 threshold로는 신뢰 불가하여
       vision 있는 모드에서는 사용하지 않음 (imu_only 백업 모드에서만 사용).

    주의: 위 threshold는 태희의 시뮬레이터 "내부 모델" 기준값이며,
    시뮬레이터 산출물에 "Synthetic model data. No real-vessel safety
    thresholds implied."라고 명시되어 있듯 실제 조선소 실측 데이터로
    추후 재보정이 필요함.
    """

    STATES = ["Normal", "Loaded", "GirtingRisk", "Developing", "Critical"]

    # 시뮬레이터 실측 기반 threshold (risk_transition_logs, 2026-09-11 분석)
    BASELINE_ANGLE_DEG = 22.4        # 정상 운항 시 기준각 (배포 시 실측 캘리브레이션 필요)
    ANGLE_DELTA_RISK_DEG = 30.0      # 기준각 대비 이 이상 벗어나면 주의 단계
    ANGLE_DELTA_WARNING_DEG = 56.0   # 실측: fast/slow 모두 이 근처에서 WARNING 전이
    ANGLE_DELTA_CRITICAL_DEG = 87.0  # 실측: fast/slow 모두 이 근처에서 CRITICAL 전이
    SAG_LOADED_THRESHOLD = 0.05      # 이 이하면 "팽팽해짐(Loaded)" 1차 신호

    def __init__(self, window: int = 5, baseline_angle_deg: float = None):
        self.window = window
        self.sag_history: deque = deque(maxlen=window)
        self.angle_history: deque = deque(maxlen=window)
        # 배포 환경마다 실측값으로 덮어쓸 수 있도록 옵션 제공
        self.baseline_angle_deg = (
            baseline_angle_deg if baseline_angle_deg is not None
            else self.BASELINE_ANGLE_DEG
        )

    def update(self, sag_ratio: float, gamma_deg: float,
               roll_rate_deg_s: float, fusion_mode: str) -> str:
        self.sag_history.append(sag_ratio)
        self.angle_history.append(gamma_deg)

        sag_now = self.sag_history[-1]
        angle_delta = abs(abs(gamma_deg) - self.baseline_angle_deg)

        # IMU 단독 모드일 때는 비전 값(sag, angle) 대신 Roll rate만으로 보수적으로 판단
        if fusion_mode == "imu_only":
            if abs(roll_rate_deg_s) > 5.0:
                return "Developing"
            elif abs(roll_rate_deg_s) > 2.0:
                return "GirtingRisk"
            return "Normal"

        # --- 시뮬레이터 실측 기반 threshold (기준각 대비 편차 중심 판단) ---
        if angle_delta > self.ANGLE_DELTA_CRITICAL_DEG:
            return "Critical"
        if angle_delta > self.ANGLE_DELTA_WARNING_DEG:
            return "Developing"
        if angle_delta > self.ANGLE_DELTA_RISK_DEG:
            return "GirtingRisk"
        if sag_now < self.SAG_LOADED_THRESHOLD:
            return "Loaded"
        return "Normal"


# ---------------------------------------------------------------------------
# 7. 프레임 단위 처리 함수 (전체 파이프라인 한 번 실행)
# ---------------------------------------------------------------------------
def process_frame(mask: np.ndarray, confidence: float, roll_deg: float,
                   roll_rate_deg_s: float, classifier: RiskStateClassifier,
                   timestamp: float) -> dict:
    fusion_mode = decide_fusion_mode(confidence)

    if fusion_mode == "imu_only":
        # 비전 값을 신뢰하지 않고 IMU만으로 판단
        sag_ratio, beta, gamma = None, None, None
    else:
        points = extract_skeleton_points(mask)
        points = order_points_along_line(points)
        sag_ratio = compute_sag_ratio(points)
        beta = compute_towline_angle_pixel(points)
        gamma = correct_roll(beta, roll_deg)
        if fusion_mode == "imu_primary":
            # 비전 값은 참고만 하고, 각도 신뢰도를 낮춰 표시 (예: 절반 가중)
            gamma = gamma * 0.5

    risk_state = classifier.update(
        sag_ratio if sag_ratio is not None else 0.0,
        gamma if gamma is not None else 0.0,
        roll_rate_deg_s,
        fusion_mode,
    )

    result = {
        "timestamp": timestamp,
        "fusion_mode": fusion_mode,
        "confidence": round(confidence, 3),
        "sag_ratio": round(sag_ratio, 4) if sag_ratio is not None else None,
        "towline_angle_pixel_deg": round(beta, 2) if beta is not None else None,
        "towline_angle_corrected_deg": round(gamma, 2) if gamma is not None else None,
        "roll_deg": round(roll_deg, 2),
        "roll_rate_deg_s": round(roll_rate_deg_s, 2),
        "risk_state": risk_state,
    }
    return result


# ---------------------------------------------------------------------------
# 7.5 synchronized.jsonl (실 데이터) 처리
# ---------------------------------------------------------------------------
def decode_mask_base64(mask_base64: str, width: int, height: int) -> np.ndarray:
    """
    synchronized.jsonl의 vision.mask_base64 필드(PNG를 base64 인코딩한
    문자열)를 디코딩해서 (height, width) 형태의 grayscale numpy 배열로
    반환한다.

    synchronization-risk_pipeline_handoff/visualize_frame.py 등에서 이미
    검증된 것과 동일한 디코딩 방식(PIL로 PNG를 열고 L 모드로 통일해
    numpy 배열화)을 그대로 재사용한다 -- 새로 발명하지 않는다.
    """
    raw = base64.b64decode(mask_base64)
    img = Image.open(io.BytesIO(raw))
    if img.mode != "L":
        img = img.convert("L")
    img.load()

    mask = np.array(img)
    assert mask.shape == (height, width), (
        f"decoded mask shape {mask.shape} != expected (height, width)=({height}, {width})"
    )
    return mask


def process_synchronized_record(record: dict, classifier: RiskStateClassifier,
                                 roll_rate_deg_s: float = 0.0) -> dict:
    """
    synchronized.jsonl의 record 하나를 처리한다. process_frame()과 흐름은
    동일하지만, 실제 synchronized.jsonl 스키마(vision.mask_base64,
    vision.towline_detected, vision.confidence, imu.roll_deg)를 직접
    입력으로 받고, README_DOWNSTREAM.md에 명시된 대로
    towline_detected == False를 SAFE가 아니라 UNKNOWN으로 처리하는 로직,
    그리고 skeleton 점이 너무 적어 geometry 계산이 불가능한 경우를
    UNAVAILABLE로 처리하는 로직을 추가한 버전이다.

    decode_mask_base64 / extract_skeleton_points / order_points_along_line /
    compute_sag_ratio / compute_towline_angle_pixel / correct_roll /
    decide_fusion_mode / classifier.update는 process_frame()과 완전히
    동일하게 그대로 재사용한다 -- 이 함수는 이들을 "연결"할 뿐 계산
    방식 자체를 바꾸지 않는다.
    """
    vision = record["vision"]
    imu = record["imu"]
    timestamp_ms = record["timestamp_ms"]
    confidence = vision["confidence"]

    result = {
        "timestamp_ms": timestamp_ms,
        "towline_detected": vision["towline_detected"],
        "confidence": round(confidence, 3) if confidence is not None else None,
        "fusion_mode": None,
        "skeleton_point_count": None,
        "sag_ratio": None,
        "towline_angle_pixel_deg": None,
        "towline_angle_corrected_deg": None,
        "roll_deg": round(imu["roll_deg"], 2),
        "roll_rate_deg_s": round(roll_rate_deg_s, 2),
        "risk_state": None,
    }

    # README_DOWNSTREAM.md: towline_detected == False는 SAFE가 아니라
    # invalid state(UNKNOWN)로 처리해야 함 -- geometry 계산 자체를
    # 시도하지 않는다.
    if not vision["towline_detected"]:
        result["risk_state"] = "UNKNOWN"
        return result

    fusion_mode = decide_fusion_mode(confidence)
    result["fusion_mode"] = fusion_mode

    if fusion_mode == "imu_only":
        # process_frame()과 동일: confidence가 너무 낮아 비전 값을
        # 신뢰하지 않는 경우, geometry 계산 자체를 하지 않는다.
        result["risk_state"] = classifier.update(0.0, 0.0, roll_rate_deg_s, fusion_mode)
        return result

    mask = decode_mask_base64(vision["mask_base64"], vision["mask_width"], vision["mask_height"])
    points = extract_skeleton_points(mask)
    result["skeleton_point_count"] = len(points)

    # skeleton이 너무 부실해서(2점 미만) 직선/각도 계산이 애초에 불가능한 경우.
    # towline_detected는 True였지만 geometry를 못 뽑는 케이스라 UNKNOWN과
    # 구분해서 UNAVAILABLE로 분류한다.
    if len(points) < 2:
        result["risk_state"] = "UNAVAILABLE"
        return result

    points = order_points_along_line(points)
    sag_ratio = compute_sag_ratio(points)
    beta = compute_towline_angle_pixel(points)
    gamma = correct_roll(beta, imu["roll_deg"])
    if fusion_mode == "imu_primary":
        # process_frame()과 동일: 비전 값은 참고만 하고 각도 신뢰도를 낮춤
        gamma = gamma * 0.5

    risk_state = classifier.update(sag_ratio, gamma, roll_rate_deg_s, fusion_mode)

    result.update({
        "sag_ratio": round(sag_ratio, 4),
        "towline_angle_pixel_deg": round(beta, 2),
        "towline_angle_corrected_deg": round(gamma, 2),
        "risk_state": risk_state,
    })
    return result


def process_synchronized_jsonl(jsonl_path: str) -> list[dict]:
    """
    synchronized.jsonl의 모든 record에 대해 mask decode -> skeleton 추출
    -> sag_ratio/angle 계산 -> roll 보정 -> risk state 분류까지 전부
    수행하고, 프레임별 결과 리스트를 반환한다.

    - vision.towline_detected == False인 프레임: geometry 계산을 시도하지
      않고 risk_state="UNKNOWN"으로 분류 (README_DOWNSTREAM.md 요구사항).
    - skeleton 점이 2개 미만이라 직선/각도 계산이 애초에 불가능한 프레임:
      risk_state="UNAVAILABLE"로 분류.
    - 예상치 못한 예외가 발생한 프레임: 파이프라인 전체를 죽이지 않고
      risk_state="ERROR"로 기록하고 나머지 프레임 처리를 계속한다 (예외
      처리만 추가한 것이며, geometry 계산 로직 자체는 바꾸지 않았다).

    roll_rate_deg_s는 synchronized.jsonl에 직접 제공되지 않아, 연속된
    두 record의 roll_deg 차이를 timestamp 간격(초)으로 나눠 근사한다
    (첫 프레임은 이전 값이 없어 0.0).
    """
    results = []
    classifier = RiskStateClassifier(window=5)
    prev_roll_deg = None
    prev_timestamp_ms = None

    with open(jsonl_path, "r") as f:
        for line_number, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            timestamp_ms = record["timestamp_ms"]
            roll_deg = record["imu"]["roll_deg"]

            if prev_timestamp_ms is not None:
                dt_s = (timestamp_ms - prev_timestamp_ms) / 1000.0
                roll_rate_deg_s = (roll_deg - prev_roll_deg) / dt_s if dt_s > 1e-9 else 0.0
            else:
                roll_rate_deg_s = 0.0

            try:
                result = process_synchronized_record(record, classifier, roll_rate_deg_s)
            except Exception as exc:  # noqa: BLE001 -- deliberately broad: one bad frame must not kill the 480-frame batch
                result = {
                    "timestamp_ms": timestamp_ms,
                    "towline_detected": record.get("vision", {}).get("towline_detected"),
                    "confidence": None,
                    "fusion_mode": None,
                    "skeleton_point_count": None,
                    "sag_ratio": None,
                    "towline_angle_pixel_deg": None,
                    "towline_angle_corrected_deg": None,
                    "roll_deg": round(roll_deg, 2),
                    "roll_rate_deg_s": round(roll_rate_deg_s, 2),
                    "risk_state": "ERROR",
                    "error": f"{type(exc).__name__}: {exc}",
                }

            result["frame_index"] = line_number
            results.append(result)

            prev_roll_deg = roll_deg
            prev_timestamp_ms = timestamp_ms

    return results


# ---------------------------------------------------------------------------
# 8. 더미 시나리오로 전체 파이프라인 끊김 없이 도는지 확인
# ---------------------------------------------------------------------------
def run_dummy_scenario():
    classifier = RiskStateClassifier(window=5)

    # 시간에 따라 줄이 점점 팽팽해지고(sag 감소) 각도가 커지는(거딩 진행) 시나리오
    n_frames = 12
    sag_values = np.linspace(0.25, 0.02, n_frames)       # 점점 팽팽해짐
    # 기준각(baseline ~22.4도) 근처에서 시작해 위험 방향(편차 증가)으로 이동
    angle_values = np.linspace(20, 95, n_frames)         # Δ가 0 -> 약 73까지 커짐
    roll_values = np.linspace(0, 12, n_frames)           # 배가 점점 기움
    confidences = [0.9] * 8 + [0.5, 0.5, 0.2, 0.2]       # 후반부에 시야 나빠짐(안개 가정)

    print(f"{'t':>3} | {'mode':<16} | {'conf':>5} | {'sag':>6} | "
          f"{'beta':>7} | {'gamma':>7} | {'roll':>5} | risk")
    print("-" * 80)

    for i in range(n_frames):
        mask = generate_dummy_mask(sag_values[i], angle_values[i])
        roll_rate = roll_values[i] - (roll_values[i - 1] if i > 0 else 0)

        result = process_frame(
            mask=mask,
            confidence=confidences[i],
            roll_deg=roll_values[i],
            roll_rate_deg_s=roll_rate,
            classifier=classifier,
            timestamp=i * 0.5,
        )

        print(f"{i:>3} | {result['fusion_mode']:<16} | "
              f"{result['confidence']:>5} | "
              f"{str(result['sag_ratio']):>6} | "
              f"{str(result['towline_angle_pixel_deg']):>7} | "
              f"{str(result['towline_angle_corrected_deg']):>7} | "
              f"{result['roll_deg']:>5} | {result['risk_state']}")

    # 마지막 프레임 결과를 JSON 형태로 출력 (UI/파이프라인으로 넘길 실제 형태)
    print("\n마지막 프레임 JSON 출력 예시:")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    run_dummy_scenario()