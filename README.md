# 피아노 멜로디 연습 (Piano Melody Practice)

초보자를 위한 브라우저 기반 피아노 학습 웹앱입니다. 태블릿이나 스마트폰을 실제 피아노 앞에 놓고, 화면에 표시되는 동요를 따라 연주하며 자연스럽게 악보 읽기와 음감을 배울 수 있습니다.

## ✨ 주요 기능

- **🎤 실시간 음 감지**: 마이크로 연주한 음을 실시간 감지 (YIN 알고리즘)
- **🎵 전문 악보 렌더링**: VexFlow 5 기반의 정확한 오선지와 음표 표시
- **📱 가로 화면 최적화**: 태블릿/스마트폰 가로 모드에서 2마디씩 표시
- **🖐️ 손가락 번호 표시**: 각 음표 위에 권장 손가락 번호(1-5) 표시
- **🇰🇷🇯🇵 한국·일본 동요**: 22곡의 친숙한 동요 (입문 21곡 + 초급 1곡)
- **⌨️ 테스트 모드**: 피아노 없이 키보드로 연습 가능
- **📱 PWA 지원**: 오프라인에서도 사용 가능
- **🎯 즉각적 피드백**: 올바른 음을 누르면 초록색으로 표시하고 자동 진행

## 🎹 수록곡 (23곡)

### 입문 (21곡) - 매우 간단한 멜로디

**한국 동요 (10곡)**
- 학교 종이 땡땡땡 (3음만 사용!)
- 반짝반짝 작은 별
- 나비야
- 곰 세 마리
- 산토끼
- 둥글게 둥글게
- 올챙이와 개구리
- 여우야 여우야
- 메리의 어린 양
- 생일 축하합니다

**일본 동요 (11곡)**
- 튤립 (チューリップ)
- 개 순경님 (いぬのおまわりさん)
- 도토리 데굴데굴 (どんぐりころころ)
- 눈 (ゆき)
- 토끼와 거북이 (うさぎとかめ)
- 맑음 인형 (てるてるぼうず)
- 개구리 노래 (かえるのうた)
- 빨간 잠자리 (あかとんぼ)
- 바다 (うみ)
- 저녁 노을 (ゆうやけこやけ)
- 고향 (ふるさと)
- 단풍잎 (もみじ)

### 초급 (1곡)
- 섬집 아기

## 🚀 시작하기

### 사전 요구사항

- Node.js 18+ 및 npm
- 최신 웹 브라우저 (Chrome, Safari, Edge)
- **HTTPS 환경** (마이크 접근을 위해 필수, `localhost`는 예외)

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/Samek86/piano-melody-practice.git
cd piano-melody-practice

# 의존성 설치
npm install

# 개발 서버 시작
npm run dev
```

앱이 http://localhost:5173 에서 실행됩니다.

### 프로덕션 빌드

```bash
npm run build
npm run preview
```

## 🎮 사용 방법

### 1. 곡 선택
- **입문 (모든 노래)**: 한국+일본 동요 전체
- **🇰🇷 한국 동요**: 한국 전통 동요만
- **🇯🇵 일본 동요**: 일본 동요만
- **초급**: 조금 더 어려운 곡

### 2. 마이크 또는 테스트 모드 선택
- **🎤 마이크 사용하기**: 실제 피아노로 연주
- **⌨️ 테스트 모드**: 화면 키보드 또는 컴퓨터 키보드(A-K)로 테스트

### 3. 연주하기
- **📱 가로 화면 권장**: 태블릿이나 스마트폰을 가로로 놓으면 더 큰 악보를 볼 수 있습니다
- **2마디씩 표시**: 현재 연주 위치에 따라 악보가 자동으로 넘어갑니다
- 파란색 테두리 = 현재 연주할 음
- 초록색 = 성공!
- 빨간색 = 틀린 음 (다시 시도)
- 손가락 번호가 음표 위에 표시됩니다

### 4. 완주!
- 모든 음표를 정확히 연주하면 완료 화면으로 이동
- 통계 확인 및 다시 연습 또는 다른 곡 선택

## 🔧 기술 스택

- **프론트엔드**: Vite + React 18 + TypeScript
- **상태 관리**: Zustand
- **피치 감지**: PitchFinder (YIN 알고리즘)
- **오디오**: Web Audio API
- **악보 렌더링**: VexFlow 5 (전문 음악 표기법 라이브러리)
- **PWA**: Service Worker + Manifest

## 📱 모바일 / iOS 사용 시 주의사항

### 화면 방향
- ✅ **가로 화면 권장**: 악보가 더 크고 읽기 쉽습니다
- ✅ **2마디씩 표시**: 자동으로 진행에 따라 악보가 넘어갑니다

### iOS Safari
- ⚠️ **HTTPS 필수**: `http://`로는 마이크 접근 불가 (`localhost` 제외)
- ⚠️ **사용자 제스처 필요**: "마이크 사용하기" 버튼을 직접 눌러야 함
- ⚠️ **백그라운드 제한**: 다른 앱으로 전환 시 오디오 일시정지

### Android Chrome
- ✅ HTTPS에서 정상 작동
- ✅ 마이크 권한 요청 시 "허용" 선택

### 테스트 모드 (피아노 없이)
- 화면 키보드 또는 A, S, D, F, G, H, J, K 키 사용
- 마이크 없이도 앱 체험 가능

## 🎯 주요 매개변수

### 음 감지 설정
- **허용 오차**: ±50 cents (약 반음의 절반, 초보자 친화적)
- **지속 시간**: 200ms (정확한 음을 이 시간 이상 유지해야 인정)
- **분석 간격**: 50ms (초당 20회 분석)

### UI 설정
- **음이름 표시**: 기본 활성화 (도, 레, 미...)
- **손가락 번호**: 기본 활성화 (1-5)
- **테스트 모드**: 수동 활성화

## 📂 프로젝트 구조

```
piano-melody-practice/
├── public/
│   ├── manifest.json         # PWA 매니페스트
│   ├── sw.js                 # Service Worker
│   └── *.svg/png             # 아이콘
├── src/
│   ├── components/           # React 컴포넌트
│   │   ├── SongSelection.tsx
│   │   ├── PracticeScreen.tsx
│   │   ├── SoftKeyboard.tsx
│   │   └── ...
│   ├── modules/              # 핵심 모듈
│   │   ├── audio/
│   │   │   ├── AudioCapture.ts
│   │   │   └── PitchDetector.ts
│   │   ├── game/
│   │   │   └── NoteMatcher.ts
│   │   └── ui/
│   │       └── ScoreRenderer.ts
│   ├── data/                 # 곡 데이터
│   │   ├── songs/
│   │   │   ├── beginner/    # 입문 21곡
│   │   │   └── easy/        # 초급 1곡
│   │   └── songIndex.ts
│   ├── store/
│   │   └── appStore.ts       # Zustand 스토어
│   ├── styles/
│   │   └── app.css
│   ├── types.ts              # TypeScript 타입
│   ├── utils.ts              # 유틸리티 함수
│   ├── App.tsx
│   └── main.tsx
├── docs/                     # 설계 문서
│   ├── DESIGN.md
│   ├── ARCHITECTURE.md
│   └── SONGS.md
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 🎼 곡 데이터 형식

각 곡은 JSON 형식으로 저장됩니다:

```json
{
  "id": "school-bell",
  "title": "School Bell",
  "titleKo": "학교 종이 땡땡땡",
  "origin": "korean",
  "difficulty": "beginner",
  "tempo": 100,
  "timeSignature": [4, 4],
  "key": "C",
  "notes": [
    { "pitch": 64, "duration": 4, "finger": 2 },
    { "pitch": 64, "duration": 4, "finger": 2 },
    { "pitch": 67, "duration": 4, "finger": 5 }
  ],
  "tags": ["동요", "한국", "입문"]
}
```

- `pitch`: MIDI 노트 번호 (60 = C4 = 가운데 도)
- `duration`: 4 = 4분음표, 2 = 2분음표
- **`finger`**: 권장 손가락 번호 (1-5, 1=엄지, 5=새끼손가락)

## 🧪 테스트 방법

### 1. 키보드 테스트 (피아노 없이)
1. 곡 선택
2. "테스트 모드" 선택
3. 화면 키보드 또는 A-K 키로 연주

### 2. 마이크 테스트 (실제 피아노)
1. HTTPS 환경 확인 (Vercel/Netlify 배포 또는 `localhost`)
2. 곡 선택
3. "마이크 사용하기" → 권한 허용
4. 피아노로 연주

### 브라우저 호환성
- ✅ Chrome/Edge (데스크톱, Android)
- ✅ Safari (macOS, iOS 11+)
- ✅ Firefox (데스크톱)

## 🚧 알려진 제약사항

- **HTTPS 필수**: 마이크 접근을 위해 HTTPS가 필요합니다 (`localhost` 제외)
- **단일 음만**: 화음은 지원하지 않습니다 (한 손 멜로디만)
- **리듬 채점 없음**: 음정만 확인하고 리듬은 느리게 연주해도 됩니다
- **배경 소음**: 조용한 환경에서 연습하세요

## 🔮 향후 계획 (v2.0)

- [ ] 더 많은 곡 추가 (중급/고급 단계)
- [ ] MIDI 키보드 지원
- [ ] 리듬 정확도 채점
- [ ] 사용자 계정 및 진도 저장
- [ ] 두 손 연주 (낮은음자리표)
- [ ] 커스텀 곡 업로드

## 📄 라이선스

MIT License

## 🙏 크레딧

- 동요 멜로디: 한국 및 일본 전통 동요 (퍼블릭 도메인)
- 피치 감지: [PitchFinder](https://github.com/peterkhayes/pitchfinder) (YIN 알고리즘)
- 악보 렌더링: [VexFlow](https://github.com/0xfe/vexflow) (음악 표기법 라이브러리)
- UI 영감: 초보자 학습 앱 모범 사례

## 📧 문의

이슈나 제안사항은 [GitHub Issues](https://github.com/Samek86/piano-melody-practice/issues)로 등록해주세요.

---

**즐거운 피아노 연습 되세요! 🎹🎵**
