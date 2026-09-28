import type { Note } from '../../types';
import { isRest, vexDuration } from '../../utils';
import { Accidental, Formatter, FretHandFinger, Modifier, Renderer, Stave, StaveNote, StaveTie, Voice } from 'vexflow';
import { attachDots } from './vexDots';
import { stavePreludeWidth, vexKeySignature } from './keySignature';
import { accidentalForNote, createMeasureState, midiToVexKeyForKey } from './accidentals';
import { splitMeasures, type MeasureInfo } from '../editor/staffModel';

export interface EditorScoreOptions {
  notes: Note[];
  timeSignature: [number, number];
  pickupBeats?: number;
  key?: string;
  selectedIndex: number;
  playingIndex: number;
}

const MEASURE_SLOT = 176;

export class EditorScore {
  private container: HTMLElement;
  private renderer: Renderer | null = null;
  private measures: MeasureInfo<Note>[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(options: EditorScoreOptions): void {
    const width = Math.floor(this.container.clientWidth);
    if (width < 32) return;

    this.measures = splitMeasures(options.notes, options.timeSignature, options.pickupBeats);
    const measureCount = Math.max(1, this.measures.length);
    const height = 24 + measureCount * MEASURE_SLOT;

    this.container.innerHTML = '';
    const host = document.createElement('div');
    this.container.appendChild(host);

    this.renderer = new Renderer(host, Renderer.Backends.SVG);
    this.renderer.resize(width, height);
    const context = this.renderer.getContext();
    context.setFillStyle('#111827');

    const marginX = 28;
    const staveWidth = Math.max(220, width - marginX - 16);
    const drawn: StaveNote[][] = [];

    const slots = this.measures.length > 0 ? this.measures : [null];
    slots.forEach((measure, index) => {
      const staveY = 28 + index * MEASURE_SLOT;
      const isFirst = index === 0;
      const stave = new Stave(marginX, staveY, staveWidth);
      stave.addClef('treble');
      const keySpec = vexKeySignature(options.key);
      if (keySpec) stave.addKeySignature(keySpec);
      if (isFirst) {
        stave.addTimeSignature(`${options.timeSignature[0]}/${options.timeSignature[1]}`);
      }
      stave.setContext(context).draw();

      const svg = this.container.querySelector('svg');
      const staveEl = svg?.querySelectorAll('.vf-stave')[index] as SVGElement | undefined;
      if (staveEl) {
        staveEl.setAttribute('data-measure-index', String(index));
        if (!measure) staveEl.setAttribute('data-insert-index', '0');
      }

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', '6');
      label.setAttribute('y', String(staveY + 36));
      label.setAttribute('fill', '#9ca3af');
      label.setAttribute('font-size', '13');
      label.setAttribute('font-family', 'sans-serif');
      label.textContent = String(index + 1);
      svg?.appendChild(label);

      if (!measure || measure.items.length === 0) {
        drawn.push([]);
        return;
      }

      const measureState = createMeasureState(options.key);
      const vexNotes = measure.items.map((note) => {
        const rest = isRest(note);
        const staveNote = new StaveNote({
          keys: [rest ? 'b/4' : midiToVexKeyForKey(note.pitch ?? 60, options.key)],
          duration: vexDuration(note),
          clef: 'treble'
        });
        attachDots(staveNote, note.dotted);
        if (!rest && note.pitch !== undefined) {
          const accidental = accidentalForNote(note.pitch, options.key, measureState);
          if (accidental) staveNote.addModifier(new Accidental(accidental), 0);
        }
        if (!rest && note.finger) {
          const fingering = new FretHandFinger(String(note.finger));
          fingering.setPosition(Modifier.Position.ABOVE);
          staveNote.addModifier(fingering, 0);
        }
        return staveNote;
      });

      const voice = new Voice({
        numBeats: Math.max(measure.beatCount, 1 / options.timeSignature[1]),
        beatValue: options.timeSignature[1]
      });
      voice.setStrict(false);
      voice.addTickables(vexNotes);
      const prelude = stavePreludeWidth({ key: options.key, isFirstMeasure: isFirst });
      const formatterWidth = Math.max(40, staveWidth - prelude - 16);
      new Formatter().joinVoices([voice]).format([voice], formatterWidth);
      voice.draw(context, stave);
      drawn.push(vexNotes);
    });

    const svg = this.container.querySelector('svg');
    if (svg) {
      const noteEls = svg.querySelectorAll('.vf-stavenote');
      let elIndex = 0;
      this.measures.forEach((measure, measureIndex) => {
        measure.items.forEach((_, noteIdx) => {
          const globalIndex = measure.startIndex + noteIdx;
          const el = noteEls[elIndex] as SVGElement | undefined;
          elIndex += 1;
          if (!el) return;
          el.setAttribute('data-note-index', String(globalIndex));
          el.setAttribute('data-measure-index', String(measureIndex));
        });
      });
      this.drawTies(context, options.notes, drawn);
      this.paint(options.selectedIndex, options.playingIndex);
      svg.style.display = 'block';
    }
  }

  private drawTies(context: ReturnType<Renderer['getContext']>, notes: Note[], drawn: StaveNote[][]): void {
    this.measures.forEach((measure, measureIndex) => {
      measure.items.forEach((note, noteIdx) => {
        if (!note.tie || isRest(note)) return;
        const nextIndex = measure.startIndex + noteIdx + 1;
        const next = notes[nextIndex];
        if (!next || isRest(next) || next.pitch !== note.pitch) return;
        const first = drawn[measureIndex]?.[noteIdx];
        let last: StaveNote | undefined;
        if (noteIdx < measure.items.length - 1) {
          last = drawn[measureIndex]?.[noteIdx + 1];
        } else {
          last = drawn[measureIndex + 1]?.[0];
        }
        if (!first || !last) return;
        try {
          new StaveTie({
            firstNote: first,
            lastNote: last,
            firstIndexes: [0],
            lastIndexes: [0]
          })
            .setContext(context)
            .draw();
        } catch (error) {
          console.warn('EditorScore: skipped a tie', error);
        }
      });
    });
  }

  private paint(selectedIndex: number, playingIndex: number): void {
    const notes = this.container.querySelectorAll<SVGElement>('.vf-stavenote[data-note-index]');
    notes.forEach((note) => {
      const index = Number(note.getAttribute('data-note-index'));
      note.classList.toggle('is-selected', index === selectedIndex);
      note.classList.toggle('is-playing', index === playingIndex && index !== selectedIndex);
      const glyph =
        (note.querySelector('.vf-notehead') as SVGElement | null) ??
        (note.querySelector('.vf-rest') as SVGElement | null) ??
        (note.querySelector('path') as SVGElement | null);
      if (!glyph) return;
      if (index === selectedIndex) {
        glyph.style.fill = '#2563eb';
        glyph.style.stroke = '#1d4ed8';
      } else if (index === playingIndex) {
        glyph.style.fill = '#059669';
        glyph.style.stroke = '#047857';
      } else {
        glyph.style.fill = '#111827';
        glyph.style.stroke = '#111827';
      }
    });
  }

  /**
   * VexFlow 5 note groups include a large invisible rect, and the SVG often has
   * pointer-events: none. Hit-test notehead centers instead of elementFromPoint.
   */
  hitTest(clientX: number, clientY: number): { kind: 'note'; index: number } | { kind: 'gap'; index: number } | null {
    const centers: Array<{ index: number; measure: number; cx: number; cy: number }> = [];
    const noteEls = this.container.querySelectorAll<SVGElement>('.vf-stavenote[data-note-index]');
    let bestIndex = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    noteEls.forEach((el) => {
      const center = this.noteCenter(el);
      if (!center) return;
      const index = Number(el.getAttribute('data-note-index'));
      const measure = Number(el.getAttribute('data-measure-index') ?? '-1');
      centers.push({ index, measure, ...center });
      const dist = Math.hypot(clientX - center.cx, clientY - center.cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestDist <= 28) return { kind: 'note', index: bestIndex };

    const staves = this.container.querySelectorAll<SVGGraphicsElement>('.vf-stave[data-measure-index]');
    for (const stave of staves) {
      const box = stave.getBoundingClientRect();
      if (clientX < box.left - 12 || clientX > box.right + 12) continue;
      if (clientY < box.top - 56 || clientY > box.bottom + 56) continue;
      const insertAt = stave.getAttribute('data-insert-index');
      if (insertAt != null) return { kind: 'gap', index: Number(insertAt) };

      const measureIndex = Number(stave.getAttribute('data-measure-index'));
      const inMeasure = centers
        .filter((note) => note.measure === measureIndex)
        .sort((a, b) => a.cx - b.cx);
      let index = inMeasure.length > 0 ? inMeasure[inMeasure.length - 1].index + 1 : 0;
      for (const note of inMeasure) {
        if (clientX < note.cx) {
          index = note.index;
          break;
        }
      }
      return { kind: 'gap', index };
    }
    return null;
  }

  private noteCenter(el: SVGElement): { cx: number; cy: number } | null {
    const glyph =
      (el.querySelector('.vf-notehead') as SVGGraphicsElement | null) ??
      (el.querySelector('.vf-rest') as SVGGraphicsElement | null) ??
      el;
    const box = glyph.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return null;
    return { cx: box.left + box.width / 2, cy: box.top + box.height / 2 };
  }

  pixelsPerDiatonicStep(): number {
    const svg = this.container.querySelector('svg');
    if (!svg) return 8;
    const attrH = Number(svg.getAttribute('height')) || 1;
    const rect = svg.getBoundingClientRect();
    return Math.max(6, 5 * (rect.height / attrH));
  }

  destroy(): void {
    this.container.innerHTML = '';
    this.renderer = null;
    this.measures = [];
  }
}
