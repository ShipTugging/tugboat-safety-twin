# TUG-GUARD AI: 항만 예인선 안전 관제 3D 디지털 트윈 시스템

> **실시간 3D 디지털 트윈 & C2 관제 대시보드 (React, TypeScript, Three.js, React Three Fiber, Tailwind CSS)**  
> 🌐 **라이브 웹사이트**: [https://tugboat-safety-twin.vercel.app](https://tugboat-safety-twin.vercel.app)

---

## 📌 프로젝트 소개

본 프로젝트는 해양 경진대회 및 항만 안전 감사를 위해 개발된 **고정밀 3D 해양 디지털 트윈 및 실시간 안전 관제 시스템**입니다.  
단순한 파도 예측이 아닌, 실제 항만 예인선(Tugboat) 운항 시 발생하는 3대 치명적 해양 사고인 **거팅(Girting/전복)**, **프로펠러 후류 난류(Propeller Wash)**, **선체 유체 흡인력(Hydrodynamic Suction)**을 **Vision AI 광학 추적과 IMU 센서 퓨전** 기술로 실시간 감지하고 예방합니다.

---

## 🚀 주요 기능

### 1. 3D 해양 디지털 트윈 시뮬레이션 (`Scene3D.tsx`)
- **실제 유선형 선박 모델링**:
  - **66,000톤급 대형 컨테이너선**: 나이프 에지 선수, 플레어 외판, 구상선수, 앵커 포켓, 계단식 글로벌 선사 컨테이너 스택, 다단 선교 타워, 회전 레이더, 5엽 브론즈 스크루.
  - **ASD 호위 예인선**: 둥근 스푼형 선수(Spoon-bow), 말발굽형 특수 고무 방충재, 360° 다면체 휠하우스, H-비트 예인 윈치, 하부 코트 노즐 아지무스 추진기(ASD).
- **현실적인 파도 & 항적파**: 6중 주파수 거스트너 파도 셰이더, 태양광 스펙큘러 글린트, 선박 켈빈 항적파(Kelvin Wake) 및 포말.
- **3D 위험 반경 & 입체 레이저 벽**:
  - 프로펠러 후류 위험 원뿔(15m/30m/45m 링 및 상공 간판)
  - 5m 충돌 한계선 & 9m 안전 이격 수직 레이저 펜스
  - 예인선 전복 위험 부채꼴 및 실시간 거리 레이저 벡터.
- **다각도 카메라 뷰**: 자유 궤도(Orbit), 예인선 추적(Chase), 선교 내부(Bridge), 상공 부감(Tactical Top).

### 2. 센서 퓨전 위험 시뮬레이션 엔진 (`useMaritimePhysics.ts`)
- **거팅(전복) 위험 감지**: Vision AI 예인줄 횡인장 각도($\theta$) + IMU 롤/각속도 융합. 위험도 85% 도달 시 최대 25° 전복 롤링 발생 및 `CRITICAL: EMERGENCY RELEASE ACTIVE` 경보.
- **프로펠러 후류 난류 유입**: 선미 캐비테이션 후류 좌표 진입 시 고주파 랜덤 노이즈 진동 및 조타 불가 상태 시뮬레이션.
- **유체 흡인력 충돌 경보**: 5m 이내 근접 시 베르누이 흡인력(kN) 100% 급증 및 화면 테두리 붉은색 비네트 펄스.

### 3. 실시간 관제 대시보드 (`Dashboard.tsx`)
- **Vision AI 피드**: 스캔라인 카메라 뷰, 타겟 록온 바운딩 박스, `[선체 거리: XX.X m] [접근 속도: X.X m/s]`.
- **센서 퓨전 게이지**: 예인줄 각도 레이더 다이얼, IMU 인공수평선(PFD 자이로), 인장 하중계(kN).
- **원터치 제어 데스크**: 조향각/예인줄/속력/RPM 미세 조절 버튼, 4대 시나리오 프리셋, 비상 퀵 릴리즈 즉각 분리(Spacebar).
- **전자동 안전 감사 검증 모달**: 4단계 자동 벤치마크 테스트 및 적합성 인증.

---

## 🛠️ 기술 스택

- **Frontend Core**: React 18, TypeScript, Vite 5, Tailwind CSS
- **3D Graphics Engine**: Three.js, React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`)
- **Physics & Sensor Fusion**: Custom Kinematic Hydrodynamic Engine
- **Audio Engine**: Web Audio API Procedural Synthesizer
- **Deployment**: Vercel (Production CI/CD)

---

## 💻 로컬 실행 방법

```bash
# 1. 저장소 클론
git clone https://github.com/TaeHuiKKIM/tugboat-safety-twin.git
cd tugboat-safety-twin

# 2. 의존성 패키지 설치
npm install

# 3. 로컬 개발 서버 실행
npm run dev

# 4. 물리 엔진 검증 테스트 실행
npm run test:physics

# 5. 프로덕션 빌드
npm run build
```

---

## 📄 라이선스
MIT License.
