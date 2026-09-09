# 비전 프레임과 IMU 동기 내보내기

## 저장 규약

두 데이터셋 모드에 공통으로 `imu/frame_NNNN.json`, `imu.csv`, `imu_windows.csv`, `imu_schema.json`을 추가한다. 기존 JPEG/마스크/YOLO 라벨은 유지한다. metadata 버전은 4이며 프레임별 `frameId`, `timestampMs`, `imuFile`, `imu`를 제공한다.

각 JSON은 `image`, `label`, `mask`, `frameId`, `sequenceId`, `timestampMs`, `sample`, `samples`를 갖는다. `sample`은 정확한 영상 촬영 시점 샘플이고 `samples`의 마지막 원소와 같다. `imu.csv`는 이미지당 한 행, `imu_windows.csv`는 이미지당 21행이다. 100장 생성 시 이미지 100개, IMU JSON 100개, paired CSV 100행, window CSV 2,100행이다(헤더 제외).

## 시간과 좌표계

- 타임스탬프는 Unix/다운로드 시간이 아닌 시뮬레이션 ms다. 이미지의 `telemetry.timestamp`를 기준으로 offset 0 샘플에 실제 렌더된 자세·위치를 그대로 사용한다.
- 창 길이는 -200ms~0ms(10ms 간격). 각 프레임의 환경·운항 설정을 고정한 별도 시뮬레이션에서 직전 구간을 재구성한다. 라이브 물리 상태는 건드리지 않는다.
- 각 장면은 독립적이다. 파일 번호가 연속이어도 장면 간 시간 연속성을 의미하지 않는다. `sequenceId`는 프레임 ID와 같으며 다른 프레임의 창과 연결하지 않는다.
- 센서는 예인선 모델 원점에 정렬돼 있다. body XYZ는 모델 local XYZ, +Y 위, +Z 선수다. Euler는 XYZ 순서이고 표기는 pitch/yaw/roll이다. Quaternion은 body→world 변환이다.

## 합성 IMU 계산

인접 가상 자세를 10ms 간격으로 샘플링한다. 월드 선형 가속도는 중심 차분 `(p(t+dt)-2p(t)+p(t-dt))/dt²`, 가속도계는 `(a_world-g_world)`를 현재 body 좌표로 변환한 specific force다. 중력은 `[0,-9.80665,0]` m/s²다.

각속도는 `q(t+dt) * inverse(q(t-dt))`의 최단 회전각/축을 20ms로 나누고 현재 body 좌표로 변환한다. quaternion의 부호 동치 및 180° 경계로 생기는 점프를 방지한다. 기존 `imuRollRateDegS`는 별도 simulator 값으로 함께 기록한다.

이는 노이즈 없는 합성 센서 모델이며 하드웨어 바이어스, 지연, 온도 특성, 실제 IMU 통신은 구현하지 않는다. 중심 차분을 위해 미래 10ms의 가상 자세를 사용하지만 내보내는 관측 구간은 촬영 시점까지다. 렌즈 효과는 RGB 전용이며 IMU 좌표·시계에는 영향을 주지 않는다.

## 회귀 검증

- 정지 상태 중력, 선형 가속도, 회전된 body 좌표 변환, 180°를 지나는 각속도.
- 동일 시드·시각 결정성과 21개 샘플 간격/끝 시각.
- 두 ZIP 모드의 JPEG·IMU JSON·CSV·metadata 연결 및 실제 렌더 자세 일치.
- `verify-dataset.py`는 버전 4 이상에서 IMU 파일 수, frame ID, 타임스탬프, CSV 행 수, 유한 수치, Euler/영상 자세 일치를 추가 검사한다. 이전 ZIP도 계속 검사할 수 있다.
- Sag 네 방향 혼합 20장 ZIP 실제 생성 검사: JPEG 20 / IMU JSON 20 / 촬영 시점 CSV 20행 / 구간 CSV 420행이 일치했다. 첫 프레임 RGB·IMU 타임스탬프 모두 `71937.37825378776`ms. 이미지·마스크 검사도 통과했다.
- 신규/기존 테스트 총 58개 통과, 프로덕션 빌드 성공. 독립 리뷰에서 계산·동기화·취소 처리의 차단 문제 없음.
- 객체 탐지 네 방향 혼합 8장 ZIP도 실제 생성했다. IMU JSON 8개, 촬영 시점 CSV 8행, 구간 CSV 168행의 시간과 6축 수치 일치 검사 통과. 브라우저 JavaScript/WebGL 오류 없음.
