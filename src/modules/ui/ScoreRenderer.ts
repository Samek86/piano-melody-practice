import { Note } from '../../types';
import { isRest, vexDuration } from '../../utils';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Modifier, FretHandFinger } from 'vexflow';
import { attachDots } from './vexDots';
import { stavePreludeWidth, vexKeySignature } from './keySignature';
import { midiToVexKeyForKey, createMeasureState, accidentalForNote } from './accidentals';

export interface RenderConfig {
  width: number;
  height: number;
  showNoteNames: boolean;
  showFingerNumbers: boolean;
}

type NoteState = 'pending' | 'current' | 'completed' | 'wrong';

interface NoteStateInfo {
  state: NoteState;
  measureIndex: number;
}

interface Measure {
  notes: Note[];
  startIndex: number;
  beatCount: number; // Actual beats in this measure (may be less than full for pickup or final measure)
}

export class ScoreRenderer {
  private container: HTMLElement;
  private renderer: Renderer | null = null;
  private notes: Note[];
  private config: RenderConfig;
  private measures: Measure[] = [];
  private noteStates: NoteStateInfo[] = [];
  private currentMeasureWindow: number = 0;
  private timeSignature: [number, number];
  private pickupBeats: number | undefined;
  private key: string | undefined;
  private noteToVexIndexMap: Map<number, { measureIdx: number; noteIdx: number }> = new Map();
  private isRendering: boolean = false;
  private pendingRenderConfig: Partial<RenderConfig> | null = null;

  constructor(
    container: HTMLElement,
    notes: Note[],
    config: RenderConfig,
    timeSignature: [number, number] = [4, 4],
    pickupBeats?: number,
    key?: string
  ) {
    this.container = container;
    this.notes = notes;
    this.config = config;
    this.timeSignature = timeSignature;
    this.pickupBeats = pickupBeats;
    this.key = key;
    this.splitIntoMeasures();
    this.initializeNoteStates();
    this.render();
  }

  private splitIntoMeasures(): void {
    const beatsPerMeasure = this.timeSignature[0];
    const beatValue = this.timeSignature[1];

    let currentMeasure: Note[] = [];
    let currentBeats = 0;
    let noteIndex = 0;
    let measureIndex = 0;

    for (const note of this.notes) {
      const noteBeats = (beatValue / note.duration) * (note.dotted ? 1.5 : 1);
      
      // Determine capacity for this measure
      const measureCapacity = measureIndex === 0 && this.pickupBeats !== undefined 
        ? this.pickupBeats 
        : beatsPerMeasure;
      
      if (currentBeats + noteBeats > measureCapacity && currentMeasure.length > 0) {
        this.measures.push({
          notes: currentMeasure,
          startIndex: noteIndex - currentMeasure.length,
          beatCount: currentBeats
        });
        currentMeasure = [];
        currentBeats = 0;
        measureIndex++;
      }

      currentMeasure.push(note);
      currentBeats += noteBeats;
      noteIndex++;
    }

    // Push final measure (may be incomplete, which is correct for anacrusis pieces)
    if (currentMeasure.length > 0) {
      this.measures.push({
        notes: currentMeasure,
        startIndex: noteIndex - currentMeasure.length,
        beatCount: currentBeats
      });
    }
  }

  private initializeNoteStates(): void {
    this.noteStates = this.notes.map((_, index) => {
      const measureIndex = this.measures.findIndex(m => 
        index >= m.startIndex && index < m.startIndex + m.notes.length
      );
      return {
        state: 'pending' as NoteState,
        measureIndex
      };
    });
  }

  private render(): void {
    // Guard against concurrent renders (iOS Safari rapid resize events)
    if (this.isRendering) {
      console.warn('ScoreRenderer: Render already in progress, will defer');
      return;
    }

    const width = this.config.width;
    const height = this.config.height;

    // Only reject truly invalid dimensions (iOS Safari reports 0 mid-rotation)
    // Keep threshold low: landscape mode can have score area ~60-90px tall
    if (width <= 0 || height <= 0 || width < 32 || height < 32) {
      console.warn('ScoreRenderer: Invalid dimensions, skipping render', { width, height });
      return;
    }

    this.isRendering = true;
    this.pendingRenderConfig = null; // Clear any pending request, we're rendering now

    try {
      // Safe cleanup: clear container before starting new render
      this.container.innerHTML = '';
      this.noteToVexIndexMap.clear();
      const div = document.createElement('div');
      this.container.appendChild(div);

      // Draw at default VexFlow proportions (spacing 10, default glyphs).
      // Then viewBox-zoom the WHOLE score so clef, time, notes, staff grow together.
      this.renderer = new Renderer(div, Renderer.Backends.SVG);
      this.renderer.resize(width, height);
      const context = this.renderer.getContext();
      context.setFillStyle('#000000');

      const measuresPerWindow = 1;
      const startMeasure = this.currentMeasureWindow;
      const endMeasure = Math.min(startMeasure + measuresPerWindow, this.measures.length);
      const measuresToRender = this.measures.slice(startMeasure, endMeasure);
      if (measuresToRender.length === 0) return;

      // Target ~3× zoom: stave ~250–280px wide (wider → notes fit; too wide → shrinks).
      const marginX = 24;
      const isFirstMeasure = startMeasure === 0;
      const preludeWidth = stavePreludeWidth({ key: this.key, isFirstMeasure });
      const notesInView = measuresToRender.reduce((n, m) => n + m.notes.length, 0);
      const noteSlot = 40; // room inside measure without killing ~3× zoom
      const endPad = 36; // space before right barline
      const contentW = preludeWidth + Math.max(1, notesInView) * noteSlot + endPad;
      const staveWidth = Math.min(width - 2 * marginX, contentW);
      const staveX = Math.max(marginX, (width - staveWidth) / 2);
      const staveY = Math.max(40, height / 2 - 30);

      measuresToRender.forEach((measure, idx) => {
        const actualMeasureIdx = startMeasure + idx;
        const stave = new Stave(staveX, staveY, staveWidth);

        stave.addClef('treble');
        const keySpec = vexKeySignature(this.key);
        if (keySpec) {
          stave.addKeySignature(keySpec);
        }
        if (actualMeasureIdx === 0) {
          stave.addTimeSignature(`${this.timeSignature[0]}/${this.timeSignature[1]}`);
        }

        stave.setContext(context).draw();

        // Create measure state for tracking accidentals
        const measureState = createMeasureState(this.key);

        const vexNotes: StaveNote[] = measure.notes.map((note, noteIdx) => {
          const rest = isRest(note);
          const keys = [rest ? 'b/4' : midiToVexKeyForKey(note.pitch ?? 60, this.key)];
          const duration = vexDuration(note);

          const staveNote = new StaveNote({
            keys,
            duration,
            clef: 'treble'
          });
          attachDots(staveNote, note.dotted);

          // Add accidental if needed (for non-rest notes)
          if (!rest && note.pitch !== undefined) {
            const accidental = accidentalForNote(note.pitch, this.key, measureState);
            if (accidental) {
              staveNote.addModifier(new Accidental(accidental), 0);
            }
          }

          if (!rest && this.config.showFingerNumbers && note.finger) {
            const fingering = new FretHandFinger(String(note.finger));
            fingering.setPosition(Modifier.Position.ABOVE);
            staveNote.addModifier(fingering, 0);
          }

          const globalNoteIndex = measure.startIndex + noteIdx;
          this.noteToVexIndexMap.set(globalNoteIndex, {
            measureIdx: actualMeasureIdx,
            noteIdx
          });

          return staveNote;
        });

        // Use actual beat count for this measure (handles pickup and incomplete final measures)
        const voice = new Voice({
          numBeats: measure.beatCount,
          beatValue: this.timeSignature[1]
        });
        voice.setStrict(false);
        voice.addTickables(vexNotes);

        const formatterWidth = staveWidth - preludeWidth - 12;
        new Formatter().joinVoices([voice]).format([voice], Math.max(40, formatterWidth));
        voice.draw(context, stave);

        const svg = this.container.querySelector('svg');
        if (svg) {
          const vfStaveNotes = svg.querySelectorAll('.vf-stavenote');
          vexNotes.forEach((_, vexIdx) => {
            const globalNoteIndex = measure.startIndex + vexIdx;
            const renderBatchOffset = measuresToRender
              .slice(0, idx)
              .reduce((sum, m) => sum + m.notes.length, 0);
            const svgElement = vfStaveNotes[renderBatchOffset + vexIdx];
            if (svgElement) {
              (svgElement as SVGElement).setAttribute('data-note-index', String(globalNoteIndex));
            }
          });
        }
      });

      this.applyStateColors();

      const svg = this.container.querySelector('svg') as SVGSVGElement;
      if (svg) {
        try {
          // Glyph groups (clef/notehead) report fake huge getBBox heights in VexFlow 5.
          // Zoom from stave lines only (+ padding). viewBox scales clef/notes/staff together.
          const staveEl = svg.querySelector('.vf-stave') as SVGGraphicsElement | null;
          const sb = staveEl?.getBBox();
          if (sb && sb.width > 0) {
            const lineGap = 10;
            const padX = Math.max(8, sb.width * 0.04);
            const padY = lineGap * 2.1; // enough for stems/clef, not so much empty space
            svg.setAttribute(
              'viewBox',
              `${sb.x - padX} ${sb.y - padY} ${sb.width + padX * 2} ${sb.height + padY * 2}`
            );
          } else {
            const bbox = svg.getBBox();
            svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${Math.max(1, bbox.width)} ${Math.max(1, bbox.height)}`);
          }
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.display = 'block';
          svg.style.transform = '';
        } catch (err) {
          console.warn('Could not zoom SVG content:', err);
        }
      }
    } catch (error) {
      console.error('ScoreRenderer: Failed to render score:', error);
      this.container.innerHTML = '<div style="padding: 20px; text-align: center; color: #e53e3e;">악보 렌더링 오류가 발생했습니다.</div>';
      throw error;
    } finally {
      this.isRendering = false;
      
      // Process pending render if one arrived while we were rendering
      if (this.pendingRenderConfig) {
        const pending = this.pendingRenderConfig;
        this.pendingRenderConfig = null;
        // Use setTimeout to avoid deep recursion and let the call stack clear
        setTimeout(() => {
          this.updateConfig(pending);
        }, 0);
      }
    }
  }

  private applyStateColors(): void {
    const svg = this.container.querySelector('svg');
    if (!svg) return;

    const staveNotes = svg.querySelectorAll('.vf-stavenote[data-note-index]');
    
    staveNotes.forEach((staveNote) => {
      const globalIndex = parseInt((staveNote as SVGElement).getAttribute('data-note-index') || '-1', 10);
      
      if (globalIndex >= 0 && globalIndex < this.noteStates.length) {
        const glyph = this.glyphElement(staveNote);
        if (glyph) {
          this.applyNoteStateStyle(glyph, this.noteStates[globalIndex].state);
        }
      }
    });
  }

  private applyNoteStateStyle(noteHead: SVGElement, state: NoteState): void {
    const styles = {
      pending: { fill: '#d1d5db', stroke: '#9ca3af', opacity: '1' },
      current: { fill: '#3b82f6', stroke: '#1d4ed8', opacity: '1' },
      completed: { fill: '#6b7280', stroke: '#4b5563', opacity: '0.5' },
      wrong: { fill: '#ef4444', stroke: '#dc2626', opacity: '1' }
    };

    const style = styles[state];
    noteHead.style.fill = style.fill;
    noteHead.style.stroke = style.stroke;
    noteHead.style.strokeWidth = '4';
    noteHead.style.opacity = style.opacity;
  }

  highlightNote(index: number, color: 'blue' | 'green' | 'red'): void {
    if (index < 0 || index >= this.notes.length) return;

    const stateMap = {
      blue: 'current' as NoteState,
      green: 'completed' as NoteState,
      red: 'wrong' as NoteState
    };

    this.noteStates[index].state = stateMap[color];

    const noteInfo = this.noteToVexIndexMap.get(index);
    
    // If note not in map, it's not currently rendered - trigger window update
    if (!noteInfo) {
      this.updateMeasureWindow(index);
      return;
    }

    const startMeasure = this.currentMeasureWindow;
    const measuresPerWindow = 1; // Always 1 measure per window now
    const endMeasure = Math.min(startMeasure + measuresPerWindow, this.measures.length);
    
    // Check if note's measure is in current window
    if (noteInfo.measureIdx < startMeasure || noteInfo.measureIdx >= endMeasure) {
      this.updateMeasureWindow(index);
      return;
    }

    const svg = this.container.querySelector('svg');
    if (!svg) return;

    // Use data-note-index attribute to find the correct note
    const staveNote = svg.querySelector(`.vf-stavenote[data-note-index="${index}"]`);
    if (!staveNote) return;

    const glyph = this.glyphElement(staveNote);
    if (!glyph) return;

    this.applyNoteStateStyle(glyph, this.noteStates[index].state);

    if (color === 'green') {
      glyph.style.transform = 'scale(1.15)';
      glyph.style.transformOrigin = 'center';
      glyph.style.transition = 'transform 0.3s ease';
      setTimeout(() => {
        glyph.style.transform = 'scale(1)';
      }, 300);
    }
  }

  clearHighlight(index: number): void {
    if (index < 0 || index >= this.noteStates.length) return;

    if (this.noteStates[index].state === 'current') {
      this.noteStates[index].state = 'pending';
    }

    const svg = this.container.querySelector('svg');
    if (!svg) return;

    // Use data-note-index attribute to find the correct note
    const staveNote = svg.querySelector(`.vf-stavenote[data-note-index="${index}"]`);
    if (!staveNote) return;

    const glyph = this.glyphElement(staveNote);
    if (glyph) {
      this.applyNoteStateStyle(glyph, this.noteStates[index].state);
      glyph.style.transform = 'scale(1)';
    }
  }

  private glyphElement(staveNote: Element): SVGElement | null {
    return (
      (staveNote.querySelector('.vf-notehead') as SVGElement | null) ??
      (staveNote.querySelector('.vf-rest') as SVGElement | null) ??
      (staveNote.querySelector('path') as SVGElement | null)
    );
  }

  private updateMeasureWindow(currentNoteIndex: number): void {
    const noteInfo = this.noteToVexIndexMap.get(currentNoteIndex);
    if (!noteInfo) {
      const measureIndex = this.noteStates[currentNoteIndex]?.measureIndex;
      if (measureIndex !== undefined && measureIndex >= 0) {
        // Sliding window: anchor on current measure
        const newWindow = measureIndex;
        if (newWindow !== this.currentMeasureWindow) {
          this.currentMeasureWindow = newWindow;
          this.render();
        }
      }
      return;
    }

    // Sliding window: anchor on current measure
    const newWindow = noteInfo.measureIdx;
    
    if (newWindow !== this.currentMeasureWindow) {
      this.currentMeasureWindow = newWindow;
      this.render();
    }
  }

  updateConfig(config: Partial<RenderConfig>): void {
    // Update config with new values
    this.config = { ...this.config, ...config };
    
    // If a render is in progress, queue this config for after it completes
    if (this.isRendering) {
      this.pendingRenderConfig = { ...this.pendingRenderConfig, ...config };
      return;
    }
    
    this.render();
  }

  destroy(): void {
    // Wait for any in-progress render to complete before destroying
    if (this.isRendering) {
      console.warn('ScoreRenderer: Destroying while render in progress');
    }
    
    try {
      this.container.innerHTML = '';
      this.noteToVexIndexMap.clear();
      this.renderer = null;
      this.isRendering = false;
    } catch (error) {
      console.error('ScoreRenderer: Error during destroy:', error);
    }
  }
}
