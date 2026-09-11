# 피아노 멜로디 연습 앱 - 설계 문서

## 1. 제품 비전

완전 초보자가 실제 피아노 앞에 태블릿이나 스마트폰을 놓고, 화면에 표시되는 간단한 멜로디를 따라 연주하면서 자연스럽게 음감과 악보 읽기를 배울 수 있는 브라우저 기반 학습 도구입니다.

### 핵심 가치 제안

- **즉각적인 시작**: 앱 설치나 복잡한 설정 없이 브라우저에서 바로 사용
- **실시간 피드백**: 올바른 음을 연주하면 즉시 초록색으로 표시
- **점진적 학습**: 친숙한 동요부터 시작하여 자신감 형성
- **자율 학습**: 강사 없이도 혼자 연습 가능

## 2. 사용자 플로우

```
[홈 화면]
    ↓
[곡 선택] ← 25-30개의 동요 목록
    ↓
[마이크 권한 요청] ← 브라우저 권한 대화상자
    ↓
[연습 화면]
    ├─ 오선지 (한 줄, 높은음자리표)
    ├─ 현재 음표 강조 (파란색 테두리)
    ├─ 연주한 음 감지
    └─ 올바른 음 → 초록색 + 다음 음으로 자동 진행
    ↓
[완료 화면]
    ├─ 축하 메시지
    ├─ 통계 (소요 시간, 시도 횟수)
    └─ [다시 연습] / [다른 곡 선택]
```

### 2.1 세부 사용자 시나리오

**시나리오 1: 첫 사용자**
1. 사용자가 URL 접속
2. 간단한 안내 화면: "태블릿을 피아노 앞에 놓고 시작하세요"
3. 곡 목록에서 "반짝반짝 작은 별" 선택
4. 마이크 권한 요청 → 허용
5. 연습 화면 표시: 첫 음표(도)가 파란 테두리로 강조
6. 사용자가 피아노의 도(C4)를 누름
7. 음표가 초록색으로 변경, 다음 음표(도)가 강조
8. 계속 진행하여 완주

**시나리오 2: 틀린 음을 연주한 경우**
1. 현재 음표가 '미(E4)'인데 사용자가 '파(F4)'를 누름
2. 틀린 음은 빨간색으로 짧게 표시 (300ms)
3. 진행하지 않고 여전히 '미' 음표가 강조된 상태 유지
4. 올바른 '미' 음을 누를 때까지 대기

**시나리오 3: 피아노가 없는 테스트**
1. 설정 메뉴에서 "테스트 모드" 활성화
2. 화면에 가상 키보드 표시 (C4~C5 범위)
3. 클릭/터치로 음 입력 가능
4. 또는 컴퓨터 키보드 매핑 (A-L 키 → 도레미파솔라시도)

## 3. 피치 감지 (Pitch Detection)

### 3.1 Web Audio API 파이프라인

```
마이크 입력 (MediaStream)
    ↓
AudioContext.createMediaStreamSource()
    ↓
AnalyserNode (FFT 크기: 2048 또는 4096)
    ↓
getFloatTimeDomainData() → Float32Array
    ↓
피치 감지 알고리즘 (실시간, ~60fps)
    ↓
감지된 주파수 (Hz) → MIDI 노트 번호 변환
```

### 3.2 피치 감지 알고리즘 선택

**권장: YIN 알고리즘**

YIN은 autocorrelation 기반으로 단일 음(monophonic) 피치 감지에 매우 정확하며, 피아노 멜로디 연습에 적합합니다.

**구현 옵션:**
- **`pitchfinder` 라이브러리** (권장): YIN, AMDF, Dynamic Wavelet 등 제공
  ```typescript
  import PitchFinder from 'pitchfinder';
  const detectPitch = PitchFinder.YIN({ sampleRate: 44100 });
  const frequency = detectPitch(audioBuffer); // Hz 또는 null
  ```

**대안 고려:**
- **`ml5.js` PitchDetection**: 머신러닝 기반, 브라우저 친화적이지만 YIN보다 무겁고 초보자용으로는 과함
- **Autocorrelation 직접 구현**: 교육 목적으로는 좋으나 라이브러리가 더 최적화됨

**최종 결정**: `pitchfinder` + YIN 알고리즘 사용

### 3.3 감지 파라미터

```typescript
interface PitchDetectionConfig {
  // FFT 버퍼 크기 (높을수록 저음역 정확도 증가, 지연 증가)
  fftSize: 2048 | 4096;  // 권장: 2048 (균형)
  
  // 최소 신뢰도 임계값 (0-1)
  threshold: 0.9;  // YIN clarity threshold
  
  // 분석 간격 (ms)
  analysisInterval: 50;  // 약 20Hz (충분히 반응적)
  
  // 노이즈 게이트 (최소 볼륨)
  noiseGate: -60;  // dB, 이 값 이하는 무시
}
```

### 3.4 음 매칭 로직

```typescript
interface NoteMatchingConfig {
  // 허용 오차 (cents, 1 semitone = 100 cents)
  toleranceCents: 50;  // ±50 cents (약 1/2 semitone)
  
  // 지속 시간 (ms) - 정확한 음을 이 시간 이상 유지해야 인정
  sustainWindowMs: 200;
  
  // 디바운스 시간 (ms) - 다음 음 인식까지 최소 대기
  debounceMs: 100;
}

function isNoteMatch(
  detectedFreq: number,
  targetNote: MidiNote,
  config: NoteMatchingConfig
): boolean {
  const targetFreq = midiToFrequency(targetNote);
  const cents = 1200 * Math.log2(detectedFreq / targetFreq);
  return Math.abs(cents) <= config.toleranceCents;
}
```

### 3.5 노이즈 처리

**문제점:**
- 배경 소음 (TV, 대화)
- 페달 소음
- 연속 음 사이의 잔향

**해결책:**
1. **노이즈 게이트**: 최소 볼륨 이하 무시
2. **신뢰도 필터**: YIN의 clarity 점수가 임계값 이상일 때만 인정
3. **시간 윈도우**: 200ms 이상 안정적으로 감지되어야 인정
4. **주파수 범위 제한**: 피아노 범위(A0-C8)만 인정, 실제로는 C3-C6 주로 사용

## 4. 악보 렌더링 (Sheet Music Rendering)

### 4.1 렌더링 라이브러리 비교

| 라이브러리 | 장점 | 단점 | 초보자 UI 적합성 |
|-----------|------|------|----------------|
| **VexFlow** | - 성숙하고 안정적<br>- 정교한 음악 표기법 지원<br>- 큰 커뮤니티 | - 복잡한 API<br>- 번들 크기 큼 (~200KB) | ⭐⭐⭐ 보통 |
| **abcjs** | - ABC 표기법 사용 (텍스트)<br>- 가볍고 빠름 | - 제한적인 커스터마이징<br>- 실시간 상호작용 어려움 | ⭐⭐ 낮음 |
| **커스텀 SVG** | - 완전한 제어<br>- 최소 번들 크기<br>- 초보자 UI 최적화 | - 직접 구현 필요<br>- 복잡한 악보는 어려움 | ⭐⭐⭐⭐⭐ 최적 |

### 4.2 권장 접근: 하이브리드 전략

**MVP: 커스텀 SVG + 제한된 VexFlow**

```typescript
// 간단한 멜로디는 커스텀 SVG로 직접 렌더링
interface CustomStaffRenderer {
  // 한 줄 오선지 + 높은음자리표 + 음표만
  renderSimpleStaff(notes: Note[]): SVGElement;
  
  // 음표 강조 (현재 음)
  highlightNote(index: number, color: 'blue' | 'green' | 'red'): void;
  
  // 애니메이션 (부드러운 전환)
  animateProgress(from: number, to: number): void;
}

// 복잡한 악보 (나중에)는 VexFlow 사용
interface VexFlowRenderer {
  renderStaff(notes: VexFlowNote[]): void;
}
```

**초보자 UI 최적화:**
- **큰 음표**: 일반 악보보다 2배 크게
- **색상 구분**:
  - 회색: 아직 연주 안 함
  - 파란 테두리: 현재 연주할 음
  - 초록색: 성공
  - (빨간색 플래시: 틀린 음, 선택적)
- **음표 이름 표시** (옵션): 음표 아래에 "도", "레", "미" 표시
- **간격 조정**: 음표 사이 여백 충분히 (모바일 터치 고려)

### 4.3 악보 레이아웃

```
┌─────────────────────────────────────────┐
│  반짝반짝 작은 별                          │  ← 곡 제목
│                                         │
│  ♩ = 120                    [설정] [?]  │  ← 템포, 설정 버튼
│                                         │
│  ─────────────────────────────────────  │
│  ─────────────────────────────────────  │
│  ──o──o──o──o──o──o──o──────────────   │  ← 오선지 (한 줄)
│  ─────────────────────────────────────  │
│  ─────────────────────────────────────  │
│  𝄞                                       │  ← 높은음자리표
│  도 도 솔 솔 라 라 솔                     │  ← 음이름 (옵션)
│     ^                                   │  ← 현재 위치 표시
│                                         │
│  🎤 감지 중: 도 (C4)                     │  ← 현재 감지된 음
│                                         │
│  [일시정지] [처음부터]                    │  ← 컨트롤
└─────────────────────────────────────────┘
```

## 5. 곡 데이터 형식

### 5.1 JSON 스키마

```typescript
interface Song {
  id: string;
  title: string;
  titleKo: string;
  composer?: string;
  difficulty: 'beginner' | 'easy' | 'medium';
  tempo: number;  // BPM
  timeSignature: [number, number];  // [4, 4] = 4/4박자
  key: string;  // 'C', 'G', 'F' 등
  notes: Note[];
  tags: string[];  // ['동요', '가을', '추석']
}

interface Note {
  pitch: MidiNote;  // 60 = C4 (middle C)
  duration: number;  // 4 = quarter note, 8 = eighth note
  
  // 옵션 (나중에)
  dotted?: boolean;
  tie?: boolean;
}

type MidiNote = number;  // 21 (A0) ~ 108 (C8)

// 예시: 반짝반짝 작은 별 (첫 구절)
const twinkleTwinkle: Song = {
  id: 'twinkle-twinkle',
  title: 'Twinkle Twinkle Little Star',
  titleKo: '반짝반짝 작은 별',
  composer: 'Traditional',
  difficulty: 'beginner',
  tempo: 120,
  timeSignature: [4, 4],
  key: 'C',
  notes: [
    { pitch: 60, duration: 4 }, // 도
    { pitch: 60, duration: 4 }, // 도
    { pitch: 67, duration: 4 }, // 솔
    { pitch: 67, duration: 4 }, // 솔
    { pitch: 69, duration: 4 }, // 라
    { pitch: 69, duration: 4 }, // 라
    { pitch: 67, duration: 2 }, // 솔 (half note)
    // ... 계속
  ],
  tags: ['동요', '클래식', '입문']
};
```

### 5.2 데이터 저장 위치

```
src/
  data/
    songs/
      beginner/
        twinkle-twinkle.json
        school-bell.json
        mary-had-a-little-lamb.json
        ...
      easy/
        ...
    songIndex.ts  // 모든 곡의 메타데이터
```

## 6. 모바일 및 PWA 고려사항

### 6.1 iOS Safari 제약사항

**마이크 접근:**
- ✅ `getUserMedia()`는 iOS 11+ 지원
- ⚠️ **HTTPS 필수** (localhost는 예외)
- ⚠️ 사용자 제스처(탭/클릭) 후에만 마이크 활성화 가능
- ⚠️ 백그라운드에서 오디오 컨텍스트 일시정지됨

**해결책:**
```typescript
// 사용자 제스처 핸들러에서 초기화
button.addEventListener('click', async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });
  const audioContext = new AudioContext();
  // ... 설정
});

// AudioContext 재개 (iOS)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioContext.state === 'suspended') {
    audioContext.resume();
  }
});
```

### 6.2 PWA 매니페스트

```json
{
  "name": "피아노 멜로디 연습",
  "short_name": "피아노연습",
  "description": "초보자를 위한 피아노 학습 앱",
  "start_url": "/",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#ffffff",
  "theme_color": "#4A90E2",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**권장 화면 방향**: Landscape (가로) - 악보 표시에 더 적합

### 6.3 반응형 레이아웃

```typescript
// 브레이크포인트
const breakpoints = {
  mobile: 480,    // 세로 모드 스마트폰
  tablet: 768,    // 가로 모드 스마트폰, 세로 태블릿
  desktop: 1024   // 가로 태블릿, 데스크톱
};

// 악보 크기 조정
const staffWidth = Math.min(window.innerWidth * 0.9, 800);
const noteSize = window.innerWidth < 768 ? 'large' : 'medium';
```

## 7. 테스트 모드 (피아노 없이)

### 7.1 가상 키보드

```
┌─────────────────────────────────────────┐
│  [테스트 모드 활성화됨]                   │
├─────────────────────────────────────────┤
│  ─┬─┬──┬─┬─┬──┬─┬─                      │
│   │ │  │ │ │  │ │ │   (검은 건반)       │
│   │ │  │ │ │  │ │ │                     │
│   │ │  │ │ │  │ │ │                     │
│  ─┴─┴──┴─┴─┴──┴─┴─                      │
│  │  │  │  │  │  │  │  │  (흰 건반)      │
│  │도│레│미│파│솔│라│시│도                │
│  │C │D │E │F │G │A │B │C                │
│  └─┴──┴──┴──┴──┴──┴──┴─                 │
│    4           (옥타브)          5       │
│                                         │
│  키보드: A S D F G H J K                │
└─────────────────────────────────────────┘
```

### 7.2 테스트 톤 생성

```typescript
class TestToneGenerator {
  private audioContext: AudioContext;
  
  playNote(midiNote: number, duration: number = 0.5): void {
    const freq = this.midiToFrequency(midiNote);
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.type = 'sine';  // 피아노와 유사한 톤
    oscillator.frequency.value = freq;
    
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01, 
      this.audioContext.currentTime + duration
    );
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
  }
  
  private midiToFrequency(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}
```

## 8. 기술 스택 권장

### 8.1 프론트엔드 프레임워크

**권장: Vite + TypeScript + React**

**근거:**
- ✅ **Vite**: 매우 빠른 개발 서버, HMR, 최적화된 프로덕션 빌드
- ✅ **TypeScript**: 오디오 처리 로직의 타입 안정성 중요
- ✅ **React**: 컴포넌트 기반 UI, 상태 관리 용이
- ✅ 커뮤니티 크기 및 학습 자료 풍부

**대안 고려:**
- **Vanilla JS + Vite**: 번들 크기 최소화, 하지만 상태 관리 복잡
- **Svelte + Vite**: 작은 번들, 뛰어난 성능, 하지만 생태계 작음
- **Next.js**: SSR 불필요, 오버킬

**최종 결정**: Vite + TypeScript + React

### 8.2 상태 관리

**권장: Zustand**

```typescript
interface AppState {
  // 현재 곡
  currentSong: Song | null;
  currentNoteIndex: number;
  
  // 오디오 상태
  isListening: boolean;
  detectedPitch: number | null;
  
  // 진행 상태
  correctNotes: number;
  incorrectAttempts: number;
  startTime: number | null;
  
  // 액션
  selectSong: (song: Song) => void;
  startListening: () => void;
  stopListening: () => void;
  onNoteDetected: (pitch: number) => void;
  advanceNote: () => void;
  reset: () => void;
}

const useAppStore = create<AppState>((set) => ({
  // ... 구현
}));
```

**근거:**
- ✅ 간단한 API, 보일러플레이트 최소
- ✅ React 통합 자연스러움
- ✅ 작은 번들 크기 (~1KB)
- ✅ DevTools 지원

**대안**: Redux Toolkit (과함), Context API (성능 이슈), Jotai (Zustand와 유사)

### 8.3 스타일링

**권장: Tailwind CSS + CSS Modules**

- **Tailwind**: 빠른 프로토타이핑, 유틸리티 클래스
- **CSS Modules**: SVG 악보 렌더링의 세밀한 스타일링

### 8.4 오디오 라이브러리

```json
{
  "dependencies": {
    "pitchfinder": "^3.0.0",  // YIN 알고리즘
    "vexflow": "^4.2.0",      // 악보 렌더링 (선택적)
  }
}
```

### 8.5 배포

**권장: Vercel 또는 Netlify**

**요구사항:**
- ✅ HTTPS 필수 (마이크 접근)
- ✅ 빠른 CDN
- ✅ 자동 배포 (Git 푸시 시)
- ✅ 무료 티어 충분

## 9. MVP 범위 vs 향후 기능

### 9.1 MVP (v1.0) - 필수 기능

**구현할 것:**
- ✅ 25-30개 동요 라이브러리
- ✅ 한 줄 오선지 (높은음자리표)
- ✅ 실시간 피치 감지 (마이크)
- ✅ 순차적 음 매칭 (올바른 음만 진행)
- ✅ 시각적 피드백 (파란색 → 초록색)
- ✅ 곡 선택 UI
- ✅ 완료 화면 (통계)
- ✅ 테스트 모드 (가상 키보드)
- ✅ 반응형 디자인 (모바일/태블릿)
- ✅ PWA (오프라인 지원 기본)

**제외할 것 (v2.0 이후):**
- ❌ MIDI 입력 지원
- ❌ 화음 / 두 손 연주
- ❌ 리듬 정확도 채점
- ❌ 낮은음자리표 (왼손 악보)
- ❌ 사용자 계정 / 진도 저장
- ❌ 녹음 / 재생
- ❌ 소셜 기능 (공유, 순위)
- ❌ 커스텀 곡 업로드

### 9.2 기술적 의사결정 요약

| 선택 사항 | 결정 | 이유 |
|----------|------|------|
| 피치 감지 | YIN (pitchfinder) | 정확도, 단순성 |
| 악보 렌더링 | 커스텀 SVG (MVP) | 초보자 UI 최적화, 가벼움 |
| 프레임워크 | Vite + React + TS | 생산성, 안정성 |
| 상태 관리 | Zustand | 간결함, 충분한 기능 |
| 배포 | Vercel | HTTPS, 빠름, 무료 |
| 음 매칭 허용 오차 | ±50 cents | 초보자 친화적 (약간 관대) |
| 지속 시간 | 200ms | 의도적 연주 vs 우연 구분 |

## 10. 성능 및 최적화

### 10.1 오디오 처리 최적화

- **Web Worker**: 피치 감지 알고리즘을 메인 스레드에서 분리 (선택적, 필요시)
- **샘플레이트**: 44100 Hz (표준), 더 낮추면 배터리 절약하지만 정확도 감소
- **FFT 크기**: 2048 (균형점)

### 10.2 렌더링 최적화

- **가상화**: 긴 곡의 경우 보이는 영역만 렌더링 (나중에)
- **React.memo**: 불필요한 리렌더링 방지
- **SVG 최적화**: 불필요한 DOM 노드 최소화

### 10.3 번들 크기

**목표**: < 500 KB (gzipped)

- **코드 스플리팅**: 곡 데이터는 lazy loading
- **Tree shaking**: VexFlow 전체 대신 필요한 부분만
- **이미지 최적화**: WebP, 적절한 해상도

## 11. 접근성 (Accessibility)

### 11.1 키보드 네비게이션

- `Tab`: 포커스 이동 (곡 선택, 버튼)
- `Enter`: 곡 시작 / 재시작
- `Space`: 일시정지 / 재개
- `Esc`: 곡 선택 화면으로 돌아가기

### 11.2 스크린 리더

- 적절한 ARIA 레이블
- 진행 상황 아나운스: "5번째 음표 중 3번째 연주 완료"
- 에러 메시지: "마이크 접근 권한이 필요합니다"

### 11.3 시각

- **색맹 대응**: 색상 + 패턴 함께 사용 (예: 초록색 + 체크 마크)
- **고대비 모드**: 충분한 명암비 (WCAG AA 기준)
- **폰트 크기**: 조정 가능

## 12. 에러 처리

### 12.1 일반적인 에러 시나리오

**마이크 접근 거부:**
```typescript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    showError('마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.');
  } else if (error.name === 'NotFoundError') {
    showError('마이크를 찾을 수 없습니다. 기기를 연결해주세요.');
  }
}
```

**오디오 컨텍스트 실패:**
- iOS의 경우 사용자 제스처 필요 안내
- 브라우저 호환성 체크

**피치 감지 실패:**
- 너무 조용함: "좀 더 세게 눌러주세요"
- 배경 소음: "조용한 환경에서 연습해주세요"
- 인식 불가: "다시 한 번 눌러주세요"

### 12.2 폴백 전략

- Web Audio API 미지원 → 안내 메시지 + 지원 브라우저 목록
- 마이크 없음 → 테스트 모드 안내
- HTTPS 아님 → localhost 또는 HTTPS 필요 안내

## 13. 개발 로드맵

### Phase 1: 프로토타입 (2-3주 예상)
1. 기본 프로젝트 설정 (Vite + React + TS)
2. 오디오 캡처 + 피치 감지 PoC
3. 간단한 SVG 악보 렌더링 (5음)
4. 단일 곡 연습 플로우

### Phase 2: MVP 완성 (3-4주 예상)
1. 25-30곡 데이터 입력
2. 곡 선택 UI
3. 완료 화면 + 통계
4. 테스트 모드 (가상 키보드)
5. 모바일 최적화
6. PWA 설정

### Phase 3: 다듬기 (1-2주 예상)
1. 사용자 테스트 피드백 반영
2. 성능 최적화
3. 버그 수정
4. 문서 작성 (사용 가이드)

### Phase 4: 배포 (1주)
1. Vercel 배포
2. 도메인 설정
3. 분석 설정 (선택적)
4. 소프트 런칭

## 14. 리스크 및 완화 전략

| 리스크 | 영향 | 완화 전략 |
|--------|------|----------|
| 피치 감지 정확도 낮음 | 높음 | 여러 알고리즘 테스트, 파라미터 튜닝, 실제 피아노로 충분한 테스트 |
| iOS 마이크 제약 | 중간 | 명확한 사용자 안내, 테스트 모드 대안 제공 |
| 배경 소음 간섭 | 중간 | 노이즈 게이트, 신뢰도 임계값, 사용자 교육 |
| 악보 렌더링 복잡도 | 낮음 | 초기에는 간단한 멜로디만, 점진적 확장 |
| 브라우저 호환성 | 낮음 | 최신 Chrome/Safari/Edge 타겟, 명확한 요구사항 안내 |

## 15. 다음 단계

1. **프로토타입 구현**: 오디오 캡처 + 피치 감지 PoC 먼저 검증
2. **사용자 테스트**: 실제 초보자(어린이 포함)에게 테스트
3. **악보 데이터 수집**: 동요 멜로디 입력 작업
4. **반복 개선**: 피드백 기반 UX 조정

---

**작성일**: 2026-09-11  
**버전**: 1.0  
**상태**: 최초 설계 완료, 검토 대기
