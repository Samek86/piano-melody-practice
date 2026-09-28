import React, { useEffect, useRef } from 'react';
import type { Note } from '../types';
import { EditorScore } from '../modules/ui/EditorScore';

interface Props {
  notes: Note[];
  timeSignature: [number, number];
  pickupBeats?: number;
  songKey: string;
  selectedIndex: number;
  playingIndex: number;
  onSelect: (index: number) => void;
  onInsert: (index: number) => void;
  onPitchDelta: (index: number, deltaSteps: number, phase: 'move' | 'end') => void;
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

    const drag = {
      index: -1,
      startY: 0,
      px: 8,
      lastDelta: 0,
      moved: false,
      pointerId: -1
    };

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

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const hit = score.hitTest(event.clientX, event.clientY);
      if (!hit) return;
      if (hit.kind === 'gap') {
        propsRef.current.onInsert(hit.index);
        return;
      }
      event.preventDefault();
      propsRef.current.onSelect(hit.index);
      drag.index = hit.index;
      drag.startY = event.clientY;
      drag.px = score.pixelsPerDiatonicStep();
      drag.lastDelta = 0;
      drag.moved = false;
      drag.pointerId = event.pointerId;
      host.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (drag.pointerId !== event.pointerId || drag.index < 0) return;
      const delta = Math.round((drag.startY - event.clientY) / drag.px);
      if (!drag.moved) {
        if (Math.abs(event.clientY - drag.startY) < 4) return;
        drag.moved = true;
      }
      event.preventDefault();
      if (delta === drag.lastDelta) return;
      drag.lastDelta = delta;
      propsRef.current.onPitchDelta(drag.index, delta, 'move');
    };

    const endDrag = (event: PointerEvent) => {
      if (drag.pointerId !== event.pointerId) return;
      if (drag.moved) propsRef.current.onPitchDelta(drag.index, drag.lastDelta, 'end');
      drag.index = -1;
      drag.pointerId = -1;
      drag.moved = false;
    };

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);

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
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
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
