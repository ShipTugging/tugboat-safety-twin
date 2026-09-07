# 예인줄 Sag 분할 데이터셋 (1차 목표: 거팅 감지)

팀 노션 「1차 목표 제안」을 시뮬레이터에 반영한 기록이다. 거팅(girting) 경보의 핵심 입력인 **"towline이 팽팽한가?"** 를 카메라 영상으로 답하기 위해, 예인줄 처짐(sag)을 분할(segmentation)로 찾고 SagRatio를 계산하는 학습 데이터를 자동 생성한다.

## 노션 요구사항 ↔ 구현

| 노션 제안 | 구현 |
|---|---|
| 예인선 안에서 towline과 상선을 바라보는 시점 고정 (train/valid/test 동일 구도) | `TUG_SAG_CAM` 카메라 모드. 예인선 좌측 브리지 윙 마운트(선체 좌표 −3.6, 5.2, −3.2)에서 두 연결점의 이등분 방향을 바라본다. 위치 ±0.35 m, 회전 ±4° 지터. 큰 조향각에서 양 끝점이 모두 들어오도록 FOV만 최소한으로 넓힌다. |
| Sag 5단계 (Level 0 매우 팽팽함 ~ Level 4 매우 느슨함) | `SagRatio = 최대 처짐 / 양끝 거리`. 경계 0.006 / 0.02 / 0.04 / 0.065. 렌더된 3D 곡선에서 직접 계산하며 라벨 클래스 0~4가 그 단계다. |
| 렌더링 시 정답 자동 생성: rope mask, sag ratio | `masks/frame_XXXX.png` 픽셀 단위 마스크(장면 깊이 버퍼를 채운 뒤 로프만 흰색으로 재렌더 → 가려진 부분 자동 제외). `labels/*.txt` YOLO-Seg 폴리곤(튜브 실루엣 투영, 레이캐스트로 가려진 구간 분리). `metadata.json`·`sag_labels.csv`에 3D SagRatio, 영상 좌표 SagRatio, 처짐·현 길이, 가시 비율. |
| 조건 랜덤화: 바다·하늘·조명·시간대·선박 색·rope 색·rope 두께·카메라 거리/높이/회전·wave·fog·blur | 시간대 3종, 태양 강도, 안개 밀도, 파고, 상선 선체 색 8종, 로프 색 8종, 로프 반경 0.06~0.13 m, 카메라 지터·회전, FOV 52~70°, 30% 확률 0.4~1.4 px 블러(JPEG에만, 마스크는 선명). |
| 같은 sag 값도 여러 환경으로 | 인덱스 `i % 5`가 목표 단계. 각 단계 밴드 안에서 목표 비율을 뽑고, 정착된 물리 상태(현 길이·장력)에 맞춰 여유 로프 `ropeSlackM`을 역산해 정확히 그 비율을 렌더한다. |
| YOLO-Seg fine-tuning | ZIP에 `data.yaml` 포함. 학습/검증은 서로 다른 시드로 따로 캡처한다. |
| mask → 중심선 → SagRatio | `scripts/sag_from_mask.py` 가 마스크에서 열(또는 행) 평균 중심선을 얻고 현에서의 최대 편차를 계산한다. `--compare` 로 시뮬레이터 정답과 비교. |

## 처짐 모델

- 현 길이 `S`(상선 초크 ↔ 예인선 스테이플), 여유 로프 `e`. 포물선 근사로 `d_geo = sqrt(3·S·e/8)`.
- 물에 잠기는 깊이 제한: 낮은 연결점 + 2 m 를 상한으로 부드럽게 포화(70%까지 선형, 이후 tanh).
- 장력 반영: `d = d_geo · (1 − T/320)`; 320 kN 이상 또는 CRITICAL은 기존 규칙대로 완전히 직선(L0).
- 라이브 화면의 여유 로프는 `towLineLength − S − 2 m`(물리가 스테이플이 아닌 선체를 로프 길이에 두므로 보정). 데이터셋은 `ropeSlackM`을 직접 지정한다.
- 3D SagRatio는 시점 무관한 물리 정답, 영상 SagRatio는 모델이 실제로 보는 값이다. 두 값은 강한 단조 관계(검증 캡처에서 상관 0.99+)이며 원근 때문에 영상 값이 더 크다.

## 산출물

```text
towline_sag_seg_dataset.zip
├─ images/frame_0001.jpg      960×540, 블러 증강 포함
├─ labels/frame_0001.txt      YOLO-Seg: class x1 y1 x2 y2 ... (0~4 로프 단계, 5 선미 박스 폴리곤)
├─ masks/frame_0001.png       로프 픽셀 마스크(흰색)
├─ classes.txt / data.yaml
├─ sag_labels.csv             회귀·분류 학습용 표
└─ metadata.json              프레임별 환경·텔레메트리·카메라·sag 정답
```

## 검증

```sh
npm test                                     # 39 tests: 처짐 모델, 역산, 단계 도달성(3 시드×150), 카메라 프레이밍, 폴리곤 투영, 라벨 포맷
python scripts/verify-dataset.py towline_sag_seg_dataset.zip --preview preview.png
python scripts/sag_from_mask.py towline_sag_seg_dataset.zip --compare
```

`verify-dataset.py`는 폴리곤을 래스터화해 픽셀 마스크와 IoU를 비교한다(기본 하한 0.45; 헤드리스 검증 캡처에서 평균 0.85). 마스크 기반 중심선 SagRatio와 투영 중심선 SagRatio의 평균 절대 오차는 약 0.01이었다.

## 한계와 다음 단계

- 시뮬레이터 정답은 렌더 지오메트리 기준이다. 실제 영상의 조명·로프 질감·카메라 왜곡은 포함하지 않으므로 실선 데이터로 별도 검증이 필요하다.
- 폴리곤은 튜브 실루엣의 선형 근사라 마스크와 완전히 같지는 않다(IoU 0.8대). 픽셀 정확도가 필요하면 `masks/`를 학습에 사용한다.
- 프레임 단위 "빠르게 팽팽해지는가"(sag 감소 속도)는 아직 정적 프레임만 생성한다. 시퀀스 캡처(같은 시드로 시간축 진행)가 다음 단계다.
- 거팅 원인인 횡방향 인장은 IMU 횡경사와 결합해야 한다. 라이브 패널의 Sag 파이프라인 카드가 두 입력을 함께 표시한다.
