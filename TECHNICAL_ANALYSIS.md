# iPhone 가로 모드 악보 표시 버그 분석 및 수정

## 근본 원인 분석

### 버그 1: 마디 페어링 윈도우 로직
**위치**: `ScoreRenderer.ts:324-344` (updateMeasureWindow)

**문제 코드**:
```typescript
const newWindow = Math.floor(noteInfo.measureIdx / 2) * 2;
```

**문제점**:
- 마디를 2개씩 묶어서 (0-1, 2-3, 4-5...) 윈도우를 생성
- 0번 마디 → window 0 (measures 0-1)
- 1번 마디 → window 0 (measures 0-1) ← 아직 안 넘어감!
- 2번 마디 → window 2 (measures 2-3)
- 3번 마디 → window 2 (measures 2-3) ← 아직 안 넘어감!

**결과**:
- 사용자가 8개 음표(마디 2개)를 연주할 때까지 화면이 고정됨
- 좁은 화면에서 2개 마디가 겹쳐서 읽기 불가능

**해결**:
```typescript
const newWindow = noteInfo.measureIdx; // 슬라이딩 윈도우
```
- 현재 음표의 마디를 기준으로 즉시 이동
- 좁은 화면: 1개 마디만 표시 (`measuresPerWindow = isNarrow ? 1 : 2`)
- 넓은 화면: 현재 + 다음 마디 (2개) 표시

---

### 버그 2: 부적절한 스태프 너비 계산
**위치**: `ScoreRenderer.ts:142` (render)

**문제 코드**:
```typescript
const staveWidth = (width - 40) / measuresToRender.length;
```

**문제점**:
- 전체 너비를 마디 개수로 단순 나눔
- 첫 마디의 음자리표(40px) + 박자표(40px) 공간 미고려
- 좁은 화면(844px)에서 2개 마디:
  - 각 마디: (844 - 40) / 2 = 402px
  - 첫 마디: 402px - 80px(clef+time) = 322px 실제 음표 공간
  - 4개 음표 + 손가락 번호 → 겹침 발생

**해결**:
```typescript
const clefTimeWidth = 80;
const availableWidth = width - 2 * marginX;

if (measuresToRender.length === 1) {
  staveWidth = actualMeasureIdx === 0 ? availableWidth - clefTimeWidth : availableWidth;
} else {
  // 첫 마디 55%, 두번째 45% (첫 마디에 clef 공간 필요)
  currentStaveWidth = idx === 0 ? availableWidth * 0.55 : availableWidth * 0.45;
}

const formatterWidth = currentStaveWidth - (actualMeasureIdx === 0 ? clefTimeWidth : 30);
new Formatter().joinVoices([voice]).format([voice], formatterWidth);
```

---

### 버그 3: 취약한 하이라이트 인덱스 계산
**위치**: `ScoreRenderer.ts:206-227` (applyStateColors), `ScoreRenderer.ts:268-276` (highlightNote)

**문제 코드**:
```typescript
// applyStateColors
let vexNoteIndex = 0;
for (let m = startMeasure; m < endMeasure; m++) {
  for (let i = 0; i < measure.notes.length; i++) {
    const globalIndex = measure.startIndex + i;
    const noteHead = noteHeads[vexNoteIndex]; // ← 취약한 가정
    vexNoteIndex++;
  }
}

// highlightNote
let noteOffset = 0;
for (let i = startMeasure; i < noteInfo.measureIdx; i++) {
  noteOffset += this.measures[i].notes.length;
}
const targetNoteIndex = noteOffset + noteInfo.noteIdx;
const noteHead = noteHeads[targetNoteIndex]; // ← DOM 순서 불일치 가능
```

**문제점**:
- `.vf-notehead` DOM 순서가 렌더링 순서와 일치한다고 가정
- VexFlow 내부 렌더링 최적화나 미래 버전 변경 시 깨짐
- 마디 재렌더링 시 인덱스 오프셋 계산 오류 가능

**해결**:
```typescript
// 렌더링 시 명시적 속성 부여
vexNotes.forEach((_, vexIdx) => {
  const globalNoteIndex = measure.startIndex + vexIdx;
  const renderBatchOffset = measuresToRender.slice(0, idx).reduce((sum, m) => sum + m.notes.length, 0);
  const svgElement = vfStaveNotes[renderBatchOffset + vexIdx];
  if (svgElement) {
    svgElement.setAttribute('data-note-index', String(globalNoteIndex));
  }
});

// 사용 시 명시적 조회
const staveNote = svg.querySelector(`.vf-stavenote[data-note-index="${index}"]`);
const noteHead = staveNote.querySelector('.vf-notehead');
```

**장점**:
- DOM 순서와 무관하게 정확한 노트 매핑
- VexFlow 버전 변경에 강인함
- 디버깅 용이 (DevTools에서 data-note-index 확인 가능)

---

### 버그 4: iPhone Safe Area 미지원
**위치**: `index.html:6`, `app.css`

**문제**:
```html
<!-- 기존 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

**문제점**:
- iPhone X 이상 모델의 노치/Dynamic Island 영역 고려 안 함
- 가로 모드: 좌우 라운드 코너 영역에 UI 요소 겹침
- 키보드 하단이 화면 밖으로 잘림

**해결**:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

```css
body {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

.practice-header {
  padding-top: max(12px, env(safe-area-inset-top));
}

.practice-footer {
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}
```

**safe-area-inset 값 예시**:
- iPhone 14 Pro 가로:
  - top: 59px (Dynamic Island)
  - left/right: 47px (라운드 코너)
  - bottom: 21px (홈 인디케이터)

---

### 버그 5: 화면 회전 미대응
**위치**: `PracticeScreen.tsx:33-69`

**문제**:
- 컴포넌트 마운트 시 한 번만 ScoreRenderer 생성
- 기기 회전 (세로 ↔ 가로) 시 컨테이너 크기 변경되지만 악보 재렌더링 안 됨
- 가로→세로: 마디 2개가 더 좁은 공간에 억지로 표시됨

**해결**:
```typescript
React.useEffect(() => {
  // ... 초기 렌더링 ...

  const resizeObserver = new ResizeObserver(() => {
    if (container.clientWidth > 0 && container.clientHeight > 0 && scoreRendererRef.current) {
      scoreRendererRef.current.updateConfig({
        width: container.clientWidth,
        height: container.clientHeight
      });
    }
  });

  resizeObserver.observe(container);

  return () => {
    resizeObserver.disconnect();
    scoreRendererRef.current?.destroy();
  };
}, [currentSong, settings]);
```

**동작**:
- 컨테이너 크기 변경 감지 시 즉시 updateConfig 호출
- updateConfig → render() → 새 너비 기준으로 마디 개수 재계산
- 세로: 좁은 너비 → 1개 마디
- 가로: 넓은 너비 → 2개 마디

---

## 가로 모드 키보드 최적화
**위치**: `app.css:353-409`

**변경**:
```css
@media (orientation: landscape) {
  .key {
    min-width: 28px;    /* 32px → 28px */
    height: 60px;        /* 80px → 60px */
    padding: 4px 2px;    /* 6px 4px → 4px 2px */
  }
  
  .key-label {
    font-size: 0.65rem;  /* 0.75rem → 0.65rem */
  }
}
```

**효과**:
- 키보드 높이 25% 감소 (80px → 60px)
- 악보 표시 영역 증가
- 터치 타겟은 여전히 28×60px = 1680px² (권장 44×44pt = 1936pt² 근접)

---

## 테스트 시나리오

### 시나리오 1: 마디 슬라이딩 (학교 종이 땡땡땡)
```
조건: iPhone 14 Pro 가로 (844×390), 테스트 모드

1. 초기 화면: 마디 1 (G-G-A-A)
2. G-G-A-A 연주 → 완료
3. 화면 전환: 마디 2 (G-G-E-half)
4. G-G 연주
5. E(반음) 연주 → 2박 후 완료
6. 화면 전환: 마디 3 (G-G-E-E) ← 핵심 검증!
7. 확인: 마디 1, 2는 사라지고 마디 3만 표시
```

### 시나리오 2: 하이라이트 정확도
```
각 음표에서:
1. 하단 "목표: X" 텍스트 확인
2. 악보에서 X 위치의 음표가 파란색(current)인지 확인
3. 정답 연주 → 초록색(completed)으로 변경 확인
4. 오답 연주 → 빨간색(wrong) 300ms 깜빡임 확인
```

### 시나리오 3: Safe Area
```
1. iPhone 14 Pro 시뮬레이터 or 실기기
2. Safari에서 http://localhost:5173 접속
3. 가로 모드 회전
4. 확인:
   - 상단 헤더 "학교 종이 땡땡땡"이 Dynamic Island 영역 피해서 표시
   - 좌측 "일시정지" 버튼이 라운드 코너 안쪽에 위치
   - 하단 키보드 완전히 보임 (홈 인디케이터 영역 고려)
```

### 시나리오 4: 회전 대응
```
1. 세로 모드에서 연습 시작 → 마디 1 표시
2. 가로 모드로 회전
3. 확인: 악보 즉시 재렌더링, 레이아웃 깨지지 않음
4. 다시 세로 모드 회전
5. 확인: 현재 마디 유지, 크기만 조정
```

---

## 성능 고려사항

### ResizeObserver 디바운싱 불필요
- `updateConfig` → `render()`는 이미 동기적
- 회전은 1회성 이벤트 (연속 트리거 안 됨)
- VexFlow 렌더링 시간: ~10-30ms (측정 필요)
- 사용자 체감 지연 없음

### data-note-index 속성 오버헤드
- 속성 개수: 곡당 평균 20-40개
- 메모리 영향: 무시 가능 (~2KB)
- 조회 성능: `querySelector` O(n), n=2-8 (현재 윈도우 음표 개수)
- 총 시간: < 1ms

---

## 호환성

| 기능 | iOS Safari | Chrome | Firefox |
|------|-----------|--------|---------|
| viewport-fit=cover | 11.0+ | 84+ | 91+ |
| env(safe-area-inset-*) | 11.0+ | 69+ | 69+ |
| ResizeObserver | 13.4+ | 64+ | 69+ |
| data-* attributes | 전체 | 전체 | 전체 |

**최소 지원**: iOS 13.4+ (2020년 3월, iPhone 6s 이상)
