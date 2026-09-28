import React, { useEffect, useRef } from 'react';
import type { Note } from '../types';
import { isRest } from '../utils';
import { EditorScore } from '../modules/ui/EditorScore';
import {
  StaffPointerGesture,
  type StaffPointerPoint,
  type StaffPointerResult,
  type StaffPointerTarget
} from '../modules/editor/staffPointer';

interface Props {
  notes: Note[];
  timeSignature: [number, number];
  pickupBeats?: number;
  songKey: string;
  selectedIndex: number;
  playingIndex: number;
  onSelect: (index: number) => void;
  onInsert: (index: number) => void;
  onPitchDelta: (index: number, deltaSteps: number, phase: 'move' | 'end' | 'cancel') => void;
}

export const EditorStaff: React.FC<Props> = (props) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<EditorScore | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const score = new EditorScore(host);
    scoreRef.current = score;

    const gesture = new StaffPointerGesture();
    let listening = false;

    const render = () => {
      const current = propsRef.current;
      score.render({
        notes: current.notes,
        timeSignature: current.timeSignature,
        pickupBeats: current.pickupBeats,
        key: current.songKey,
        selectedIndex: current.selectedIndex,
        playingIndex: current.playingIndex
      });
    };

    const sample = (event: PointerEvent): StaffPointerPoint => ({
      pointerId: event.pointerId,
      button: event.button,
      altKey: event.altKey,
      clientX: event.clientX,
      clientY: event.clientY
    });

    const targetFrom = (
      hit: { kind: 'note'; index: number } | { kind: 'gap'; index: number } | null
    ): StaffPointerTarget | null => {
      if (!hit) return null;
      if (hit.kind === 'gap') return hit;
      const note = propsRef.current.notes[hit.index];
      return { kind: 'note', index: hit.index, rest: note ? isRest(note) : true };
    };

    const apply = (result: StaffPointerResult, event: PointerEvent) => {
      host.classList.toggle('is-pitch-drag', result.capturePointer);
      if (result.capturePointer) {
        event.preventDefault();
        if (event.type === 'pointerdown') {
          try {
            host.setPointerCapture(event.pointerId);
          } catch {
            /* The pointer can already be gone if the browser took the gesture. */
          }
        }
      } else {
        try {
          if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
        } catch {
          /* Ignore a pointer the browser already released. */
        }
      }
      const effect = result.effect;
      if (effect.type === 'select') propsRef.current.onSelect(effect.index);
      else if (effect.type === 'insert') propsRef.current.onInsert(effect.index);
      else if (effect.type === 'pitch') {
        propsRef.current.onPitchDelta(effect.index, effect.deltaSteps, effect.phase);
      }
      if (result.tracking && !listening) {
        listening = true;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);
      } else if (!result.tracking && listening) {
        stopWindow();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const hit = score.hitTest(event.clientX, event.clientY);
      const result = gesture.down(
        sample(event),
        targetFrom(hit),
        propsRef.current.selectedIndex,
        score.pixelsPerDiatonicStep()
      );
      apply(result, event);
    };

    const onPointerMove = (event: PointerEvent) => {
      apply(gesture.move(sample(event)), event);
    };

    const onPointerUp = (event: PointerEvent) => {
      apply(gesture.up(sample(event)), event);
    };

    const onPointerCancel = (event: PointerEvent) => {
      apply(gesture.cancel(sample(event)), event);
    };

    const stopWindow = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };

    host.addEventListener('pointerdown', onPointerDown);

    let lastWidth = -1;
    let resizeTimer = 0;
    const renderIfWidthChanged = () => {
      const next = host.clientWidth;
      if (next < 32 || Math.abs(next - lastWidth) < 2) return;
      lastWidth = next;
      render();
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderIfWidthChanged, 50);
    });
    observer.observe(host);
    renderIfWidthChanged();

    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      stopWindow();
      host.classList.remove('is-pitch-drag');
      host.removeEventListener('pointerdown', onPointerDown);
      score.destroy();
      scoreRef.current = null;
    };
  }, []);

  useEffect(() => {
    scoreRef.current?.render({
      notes: props.notes,
      timeSignature: props.timeSignature,
      pickupBeats: props.pickupBeats,
      key: props.songKey,
      selectedIndex: props.selectedIndex,
      playingIndex: props.playingIndex
    });
  }, [props.notes, props.timeSignature, props.pickupBeats, props.songKey, props.selectedIndex, props.playingIndex]);

  return <div ref={hostRef} className="editor-score-host" data-testid="score-host" />;
};
