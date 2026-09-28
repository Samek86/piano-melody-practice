import React, { useEffect, useRef, useState } from 'react';
import { allSongs } from '../data/songIndex';
import { useAppStore } from '../store/appStore';
import type { Song } from '../types';
import { EditorStaff } from './EditorStaff';
import { createPreviewPlayer, type PreviewPlayer } from '../modules/editor/playback';
import { useOverrideIds, useSongCatalog, clearOverride, saveOverride } from '../modules/editor/songOverrides';
import {
  DURATION_VALUES,
  EDITOR_KEYS,
  blankSong,
  cloneSnapshot,
  countMeasureProblems,
  describeCursor,
  durationLabel,
  formatBeat,
  insertEvent,
  makeEvent,
  removeEvent,
  respellForKey,
  shiftDiatonic,
  snapshotToSong,
  songToSnapshot,
  splitMeasures,
  stepNear,
  type AccidentalChoice,
  type DurationValue,
  type EditorSnapshot,
  type StaffEvent
} from '../modules/editor/staffModel';
import '../styles/staff-editor.css';

interface Tool {
  duration: DurationValue;
  dotted: boolean;
  rest: boolean;
}

const TIME_NUMS = [2, 3, 4, 5, 6, 7, 8, 9, 12];
const TIME_DENS = [2, 4, 8, 16];

const ACCIDENTALS: Array<{ id: AccidentalChoice; label: string; testId: string }> = [
  { id: '#', label: '♯', testId: 'acc-sharp' },
  { id: 'b', label: '♭', testId: 'acc-flat' },
  { id: 'n', label: '♮', testId: 'acc-natural' },
  { id: 'none', label: '없음', testId: 'acc-none' }
];

function toolFrom(event: StaffEvent): Tool {
  const duration = (DURATION_VALUES as number[]).includes(event.duration)
    ? (event.duration as DurationValue)
    : 4;
  return { duration, dotted: event.dotted, rest: event.rest };
}

function initialSnapshot(songs: Song[]): EditorSnapshot {
  const song = songs.find((item) => item.id === 'school-bell') ?? songs[0] ?? blankSong();
  return songToSnapshot(song);
}

export const StaffEditor: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const catalog = useSongCatalog();
  const overrideIds = useOverrideIds();
  const selectSong = useAppStore((state) => state.selectSong);
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(() => initialSnapshot(catalog));
  const [tool, setTool] = useState<Tool>({ duration: 4, dotted: false, rest: false });
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [historyTick, setHistoryTick] = useState(0);
  const stateRef = useRef(snapshot);
  const toolRef = useRef(tool);
  const past = useRef<EditorSnapshot[]>([]);
  const future = useRef<EditorSnapshot[]>([]);
  const dragBase = useRef<EditorSnapshot | null>(null);
  const historyField = useRef<string | null>(null);
  const playerRef = useRef<PreviewPlayer | null>(null);
  stateRef.current = snapshot;
  toolRef.current = tool;

  const player = () => {
    playerRef.current ??= createPreviewPlayer();
    return playerRef.current;
  };

  useEffect(() => () => playerRef.current?.stop(), []);

  const bumpHistory = () => setHistoryTick((tick) => tick + 1);

  function commit(
    recipe: (draft: EditorSnapshot) => void,
    options?: { history?: boolean; dirty?: boolean }
  ) {
    playerRef.current?.stop();
    setPlayingIndex(-1);
    const current = stateRef.current;
    const next = cloneSnapshot(current);
    recipe(next);
    if (options?.history !== false) {
      past.current.push(cloneSnapshot(current));
      future.current = [];
      bumpHistory();
    }
    stateRef.current = next;
    setSnapshot(next);
    if (options?.dirty !== false) setDirty(true);
  }

  function editField(field: string, recipe: (draft: EditorSnapshot) => void) {
    const record = historyField.current !== field;
    historyField.current = field;
    commit(recipe, { history: record });
  }

  const selected = snapshot.cursor >= 0 ? snapshot.events[snapshot.cursor] : undefined;

  useEffect(() => {
    if (!selected) return;
    setTool(toolFrom(selected));
  }, [snapshot.cursor, selected?.duration, selected?.dotted, selected?.rest]);

  useEffect(() => {
    const host = document.querySelector('[data-testid="score-host"]');
    const el = host?.querySelector(`[data-note-index="${snapshot.cursor}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [snapshot.cursor]);

  function confirmDiscard(): boolean {
    if (!dirty) return true;
    return window.confirm('저장하지 않은 편집이 있습니다. 버리고 계속할까요?');
  }

  function loadSong(song: Song, force = false, dirtyAfter = false) {
    if (!force && !confirmDiscard()) return;
    playerRef.current?.stop();
    setPlayingIndex(-1);
    const next = songToSnapshot(song);
    past.current = [];
    future.current = [];
    dragBase.current = null;
    stateRef.current = next;
    setSnapshot(next);
    setDirty(dirtyAfter);
    setMessage(null);
    bumpHistory();
    if (next.events[next.cursor]) setTool(toolFrom(next.events[next.cursor]));
  }

  function applyToSelection(patch: (event: StaffEvent) => StaffEvent) {
    if (stateRef.current.cursor < 0) return;
    commit((draft) => {
      const event = draft.events[draft.cursor];
      if (!event) return;
      draft.events[draft.cursor] = patch(event);
    });
  }

  function selectIndex(index: number) {
    commit((draft) => {
      draft.cursor = index;
    }, { history: false, dirty: false });
  }

  function moveCursor(delta: number) {
    const current = stateRef.current;
    if (current.events.length === 0) return;
    const start = current.cursor < 0 ? 0 : current.cursor;
    const next = Math.max(0, Math.min(current.events.length - 1, start + delta));
    if (next === current.cursor) return;
    selectIndex(next);
  }

  function shiftPitch(delta: number) {
    const event = stateRef.current.events[stateRef.current.cursor];
    if (!event || event.rest) return;
    commit((draft) => {
      const current = draft.events[draft.cursor];
      draft.events[draft.cursor] = { ...current, step: shiftDiatonic(current.step, delta) };
    });
  }

  function setDuration(duration: DurationValue) {
    setTool((current) => ({ ...current, duration }));
    applyToSelection((event) => ({ ...event, duration }));
  }

  function toggleDotted() {
    const dotted = !toolRef.current.dotted;
    setTool((current) => ({ ...current, dotted }));
    applyToSelection((event) => ({ ...event, dotted }));
  }

  function toggleRest() {
    const rest = !toolRef.current.rest;
    setTool((current) => ({ ...current, rest }));
    applyToSelection((event) => ({ ...event, rest, tie: rest ? false : event.tie }));
  }

  function setAccidental(accidental: AccidentalChoice) {
    const event = stateRef.current.events[stateRef.current.cursor];
    if (!event || event.rest) return;
    applyToSelection((current) => ({ ...current, accidental }));
  }

  function toggleTie() {
    const event = stateRef.current.events[stateRef.current.cursor];
    if (!event || event.rest) return;
    applyToSelection((current) => ({ ...current, tie: !current.tie }));
  }

  function addNote(at?: number) {
    commit((draft) => {
      const index = at ?? (draft.cursor < 0 ? draft.events.length : draft.cursor + 1);
      const step = stepNear(draft.events, Math.min(index, draft.events.length) - 1);
      draft.events = insertEvent(draft.events, index, makeEvent(toolRef.current, step));
      draft.cursor = Math.max(0, Math.min(index, draft.events.length - 1));
    });
  }

  function deleteSelected() {
    if (stateRef.current.cursor < 0) return;
    commit((draft) => {
      const removed = removeEvent(draft.events, draft.cursor);
      draft.events = removed.events;
      draft.cursor = removed.cursor;
    });
  }

  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    playerRef.current?.stop();
    setPlayingIndex(-1);
    future.current.push(cloneSnapshot(stateRef.current));
    stateRef.current = prev;
    setSnapshot(prev);
    setDirty(true);
    bumpHistory();
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    playerRef.current?.stop();
    setPlayingIndex(-1);
    past.current.push(cloneSnapshot(stateRef.current));
    stateRef.current = next;
    setSnapshot(next);
    setDirty(true);
    bumpHistory();
  }

  function onPitchDelta(index: number, deltaSteps: number, phase: 'move' | 'end') {
    if (!dragBase.current) {
      playerRef.current?.stop();
      setPlayingIndex(-1);
      dragBase.current = cloneSnapshot(stateRef.current);
    }
    const base = dragBase.current;
    const origin = base.events[index];
    if (!origin || origin.rest) {
      if (phase === 'end') dragBase.current = null;
      return;
    }
    const step = shiftDiatonic(origin.step, deltaSteps);
    const next = cloneSnapshot(base);
    next.events[index] = { ...origin, step };
    next.cursor = index;
    if (phase === 'end') {
      if (step !== origin.step) {
        past.current.push(cloneSnapshot(base));
        future.current = [];
        setDirty(true);
        bumpHistory();
      }
      dragBase.current = null;
    }
    stateRef.current = next;
    setSnapshot(next);
  }

  function preparedSong(): Song | null {
    const song = snapshotToSong(stateRef.current);
    if (song.notes.length === 0) {
      setMessage('음표가 하나 이상 있어야 저장할 수 있습니다.');
      return null;
    }
    if (!Number.isFinite(song.tempo) || song.tempo < 30 || song.tempo > 240) {
      setMessage('템포는 30에서 240 사이로 맞춰 주세요.');
      return null;
    }
    return song;
  }

  function saveToBrowser(): Song | null {
    const song = preparedSong();
    if (!song) return null;
    saveOverride(song);
    const next = { ...stateRef.current, base: song };
    stateRef.current = next;
    setSnapshot(next);
    setDirty(false);
    setMessage(`이 브라우저에 저장했습니다. 곡 목록의 「${song.titleKo}」로 연습할 수 있습니다. 배포된 원본 파일은 바뀌지 않습니다.`);
    return song;
  }

  function exportJson() {
    const song = preparedSong();
    if (!song) return;
    const blob = new Blob([`${JSON.stringify(song, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${song.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('JSON 파일을 내려받았습니다. 저장소에 반영하려면 해당 곡 파일을 이 내용으로 교체하면 됩니다.');
  }

  function revertOverride() {
    const id = stateRef.current.id;
    const stock = allSongs.find((song) => song.id === id);
    clearOverride(id);
    if (stock) {
      loadSong(stock, true, false);
      setMessage('브라우저 수정을 지우고 수록곡 원본으로 되돌렸습니다.');
      return;
    }
    const fallback = allSongs.find((song) => song.id === 'school-bell') ?? allSongs[0];
    if (fallback) loadSong(fallback, true, false);
    setMessage('브라우저에만 있던 곡을 삭제했습니다.');
  }

  function play(fromCursor: boolean) {
    const current = stateRef.current;
    const song = snapshotToSong(current);
    const from = fromCursor ? Math.max(0, current.cursor) : 0;
    player().play(song.notes, song.tempo, from, (index) => setPlayingIndex(index));
  }

  function exit() {
    if (!confirmDiscard()) return;
    playerRef.current?.stop();
    onExit();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveCursor(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveCursor(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        shiftPitch(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        shiftPitch(-1);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickup = snapshot.pickupBeats > 0 ? snapshot.pickupBeats : undefined;
  const notes = snapshotToSong(snapshot).notes;
  const measures = splitMeasures(snapshot.events, snapshot.timeSignature, pickup);
  const problems = countMeasureProblems(measures);
  const info = describeCursor(snapshot.events, snapshot.cursor, snapshot.timeSignature, pickup, snapshot.key);
  const statusClass = info.status === 'over' ? 'warn-over' : info.status === 'under' ? 'warn-under' : 'warn-ok';
  const statusLabel = { ok: '맞음', over: '넘침', under: '부족', empty: '비어 있음' }[info.status];
  const keyOptions = EDITOR_KEYS.includes(snapshot.key as (typeof EDITOR_KEYS)[number])
    ? [...EDITOR_KEYS]
    : [snapshot.key, ...EDITOR_KEYS];
  const songOptions = catalog.some((song) => song.id === snapshot.id)
    ? catalog
    : [snapshotToSong(snapshot), ...catalog];

  return (
    <div className="staff-editor" data-testid="staff-editor">
      <div className="editor-bar">
        <div className="editor-row">
          <span className="editor-heading">악보 편집</span>
          <label>
            곡
            <select
              aria-label="곡"
              value={snapshot.id}
              onChange={(event) => {
                const song = songOptions.find((item) => item.id === event.target.value);
                if (song) loadSong(song);
              }}
            >
              {songOptions.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.titleKo}
                  {overrideIds.has(song.id) ? ' (편집본)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="tool-btn" onClick={() => loadSong(blankSong(), false, true)}>
            새 곡
          </button>
          <button type="button" className="tool-btn" onClick={exit}>
            연습 화면
          </button>
        </div>

        <div className="editor-row">
          <label>
            제목
            <input
              aria-label="한글 제목"
              type="text"
              value={snapshot.titleKo}
              onFocus={() => {
                historyField.current = null;
              }}
              onChange={(event) => editField('titleKo', (draft) => {
                draft.titleKo = event.target.value;
              })}
            />
          </label>
          <label>
            영문
            <input
              aria-label="영문 제목"
              type="text"
              value={snapshot.title}
              onFocus={() => {
                historyField.current = null;
              }}
              onChange={(event) => editField('title', (draft) => {
                draft.title = event.target.value;
              })}
            />
          </label>
          <label>
            템포
            <input
              aria-label="템포"
              type="number"
              min={30}
              max={240}
              value={snapshot.tempo}
              onFocus={() => {
                historyField.current = null;
              }}
              onChange={(event) => {
                const tempo = Number(event.target.value);
                if (!Number.isFinite(tempo)) return;
                editField('tempo', (draft) => {
                  draft.tempo = tempo;
                });
              }}
            />
          </label>
          <label>
            박자
            <select
              aria-label="박자 분자"
              value={snapshot.timeSignature[0]}
              onChange={(event) => {
                const value = Number(event.target.value);
                commit((draft) => {
                  draft.timeSignature = [value, draft.timeSignature[1]];
                });
              }}
            >
              {TIME_NUMS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="박자 분모"
              value={snapshot.timeSignature[1]}
              onChange={(event) => {
                const value = Number(event.target.value);
                commit((draft) => {
                  draft.timeSignature = [draft.timeSignature[0], value];
                });
              }}
            >
              {TIME_DENS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            조표
            <select
              aria-label="조표"
              value={snapshot.key}
              onChange={(event) => {
                const key = event.target.value;
                if (key === stateRef.current.key) return;
                commit((draft) => {
                  draft.events = respellForKey(draft.events, draft.key, key);
                  draft.key = key;
                });
              }}
            >
              {keyOptions.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </label>
          <label>
            못갖춘마디
            <input
              aria-label="못갖춘마디 박"
              type="number"
              min={0}
              max={12}
              step={0.5}
              value={snapshot.pickupBeats}
              onFocus={() => {
                historyField.current = null;
              }}
              onChange={(event) => {
                const pickupBeats = Number(event.target.value);
                if (!Number.isFinite(pickupBeats)) return;
                editField('pickup', (draft) => {
                  draft.pickupBeats = Math.max(0, pickupBeats);
                });
              }}
            />
          </label>
        </div>

        <div className="editor-tools">
          {DURATION_VALUES.map((duration) => (
            <button
              key={duration}
              type="button"
              className={`tool-btn ${tool.duration === duration ? 'active' : ''}`}
              data-testid={`duration-${duration}`}
              onClick={() => setDuration(duration)}
            >
              {duration === 1 ? '온' : `${duration}분`}
            </button>
          ))}
          <span className="sep" />
          <button
            type="button"
            className={`tool-btn ${tool.dotted ? 'active' : ''}`}
            data-testid="tool-dot"
            onClick={toggleDotted}
          >
            점
          </button>
          <button
            type="button"
            className={`tool-btn ${tool.rest ? 'active' : ''}`}
            data-testid="tool-rest"
            onClick={toggleRest}
          >
            {tool.rest ? '쉼표' : '음표'}
          </button>
          <span className="sep" />
          {ACCIDENTALS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tool-btn ${selected && !selected.rest && selected.accidental === item.id ? 'active' : ''}`}
              data-testid={item.testId}
              onClick={() => setAccidental(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`tool-btn ${selected?.tie ? 'active' : ''}`}
            data-testid="tool-tie"
            onClick={toggleTie}
          >
            붙임줄
          </button>
          <span className="sep" />
          <button type="button" className="tool-btn" data-testid="btn-add" onClick={() => addNote()}>
            추가
          </button>
          <button
            type="button"
            className="tool-btn"
            data-testid="btn-delete"
            onClick={deleteSelected}
            disabled={!selected}
          >
            삭제
          </button>
          <button type="button" className="tool-btn" data-testid="btn-undo" onClick={undo} disabled={historyTick < 0 || past.current.length === 0}>
            실행취소
          </button>
          <button type="button" className="tool-btn" data-testid="btn-redo" onClick={redo} disabled={historyTick < 0 || future.current.length === 0}>
            다시실행
          </button>
        </div>

        <div className="editor-row">
          <button type="button" className="tool-btn" data-testid="btn-play" onClick={() => play(false)}>
            처음부터
          </button>
          <button type="button" className="tool-btn" data-testid="btn-play-cursor" onClick={() => play(true)}>
            커서부터
          </button>
          <button
            type="button"
            className="tool-btn"
            data-testid="btn-stop"
            onClick={() => {
              player().stop();
              setPlayingIndex(-1);
            }}
          >
            정지
          </button>
          <button type="button" className="btn btn-primary" data-testid="btn-save" onClick={() => saveToBrowser()}>
            연습에 적용
          </button>
          <button type="button" className="btn btn-secondary" data-testid="btn-export" onClick={exportJson}>
            JSON 내보내기
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={() => {
              const song = saveToBrowser();
              if (!song) return;
              selectSong(song);
              onExit();
            }}
          >
            적용 후 연습
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={revertOverride}
            disabled={!overrideIds.has(snapshot.id)}
          >
            수정 지우기
          </button>
        </div>
        {message && (
          <p className="editor-message" role="status">{message}</p>
        )}
      </div>

      <div className="editor-canvas">
        <EditorStaff
          notes={notes}
          timeSignature={snapshot.timeSignature}
          pickupBeats={pickup}
          songKey={snapshot.key}
          selectedIndex={snapshot.cursor}
          playingIndex={playingIndex}
          onSelect={selectIndex}
          onInsert={(index) => addNote(index)}
          onPitchDelta={onPitchDelta}
        />
      </div>

      <div className="editor-info" data-testid="info-strip">
        <span>마디 {info.measureNumber || '-'} / {info.measureCount || measures.length}</span>
        <span>박 {info.beatLabel}</span>
        <span>{info.pitchLabel}</span>
        <span>{selected ? durationLabel(selected) : info.durationLabel}</span>
        <span className={statusClass}>
          이 마디 {info.capacity ? `${formatBeat(info.beatCount)}/${formatBeat(info.capacity)}박` : '-'} · {statusLabel}
        </span>
        {(problems.over > 0 || problems.under > 0) && (
          <span className={problems.over > 0 ? 'warn-over' : 'warn-under'}>
            전체 {problems.over > 0 ? `넘침 ${problems.over}` : ''}
            {problems.over > 0 && problems.under > 0 ? ' · ' : ''}
            {problems.under > 0 ? `부족 ${problems.under}` : ''}
          </span>
        )}
        <span className="editor-hint">클릭 선택 · 위아래 드래그로 음높이 · ← → 이동 · 빈 자리 클릭 또는 추가로 삽입 · Delete 삭제</span>
      </div>
    </div>
  );
};
