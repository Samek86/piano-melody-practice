import { Note } from '../../types';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Modifier, FretHandFinger, VexFlow } from 'vexflow';

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
  private noteToVexIndexMap: Map<number, { measureIdx: number; noteIdx: number }> = new Map();

  constructor(
    container: HTMLElement,
    notes: Note[],
    config: RenderConfig,
    timeSignature: [number, number] = [4, 4]
  ) {
    this.container = container;
    this.notes = notes;
    this.config = config;
    this.timeSignature = timeSignature;
    this.splitIntoMeasures();
    this.initializeNoteStates();
    this.render();
  }

  private splitIntoMeasures(): void {
    const beatsPerMeasure = this.timeSignature[0];
    const beatValue = this.timeSignature[1];
    const totalBeatsPerMeasure = beatsPerMeasure;

    let currentMeasure: Note[] = [];
    let currentBeats = 0;
    let noteIndex = 0;

    for (const note of this.notes) {
      const noteBeats = beatValue / note.duration;
      
      if (currentBeats + noteBeats > totalBeatsPerMeasure && currentMeasure.length > 0) {
        this.measures.push({
          notes: currentMeasure,
          startIndex: noteIndex - currentMeasure.length
        });
        currentMeasure = [];
        currentBeats = 0;
      }

      currentMeasure.push(note);
      currentBeats += noteBeats;
      noteIndex++;
    }

    if (currentMeasure.length > 0) {
      this.measures.push({
        notes: currentMeasure,
        startIndex: noteIndex - currentMeasure.length
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

  private midiToVexKey(midiNote: number): string {
    const noteNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = noteNames[midiNote % 12];
    return `${noteName}/${octave}`;
  }

  private durationToVex(duration: number): string {
    const durationMap: { [key: number]: string } = {
      1: 'w',
      2: 'h',
      4: 'q',
      8: '8',
      16: '16'
    };
    return durationMap[duration] || 'q';
  }

  private render(): void {
    this.container.innerHTML = '';
    this.noteToVexIndexMap.clear();

    const width = this.config.width;
    const height = this.config.height;

    if (width <= 0 || height <= 0) {
      console.warn('ScoreRenderer: Container has zero dimensions, deferring render');
      return;
    }

    try {
      const div = document.createElement('div');
      this.container.appendChild(div);
      
      this.renderer = new Renderer(div, Renderer.Backends.SVG);
      this.renderer.resize(width, height);
      const context = this.renderer.getContext();

      const SCALE = 4;
      const spacingBetweenLines = 10 * SCALE;

      // Always show 1 measure for better scaling on mobile
      const measuresPerWindow = 1;

      const startMeasure = this.currentMeasureWindow;
      const endMeasure = Math.min(startMeasure + measuresPerWindow, this.measures.length);
      const measuresToRender = this.measures.slice(startMeasure, endMeasure);

      if (measuresToRender.length === 0) return;

      const marginX = 30;
      const clefTimeWidth = 80;
      const availableWidth = width - 2 * marginX;
      
      const staveWidth = availableWidth;
      const staveY = height / 2 - 40;

      const originalFontScale = VexFlow.NOTATION_FONT_SCALE;
      
      try {
        VexFlow.NOTATION_FONT_SCALE = 39 * SCALE;

        measuresToRender.forEach((measure, idx) => {
          const actualMeasureIdx = startMeasure + idx;
          
          const x = marginX;
          const currentStaveWidth = staveWidth;
          
          const stave = new Stave(x, staveY, currentStaveWidth, { 
            spacingBetweenLinesPx: spacingBetweenLines 
          });
        
        // Only show clef+time signature on the first measure of the entire song
        if (actualMeasureIdx === 0) {
          stave.addClef('treble');
          stave.addTimeSignature(`${this.timeSignature[0]}/${this.timeSignature[1]}`);
        }
        
        stave.setContext(context).draw();

        const vexNotes: StaveNote[] = measure.notes.map((note, noteIdx) => {
          const keys = [this.midiToVexKey(note.pitch)];
          const duration = this.durationToVex(note.duration);
          
          const staveNote = new StaveNote({
            keys,
            duration,
            clef: 'treble'
          });

          if (keys[0].includes('#')) {
            staveNote.addModifier(new Accidental('#'), 0);
          }

          if (this.config.showFingerNumbers && note.finger) {
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

        const voice = new Voice({
          numBeats: this.timeSignature[0],
          beatValue: this.timeSignature[1]
        });
        voice.setStrict(false);
        voice.addTickables(vexNotes);

        // Give formatter adequate width
        const formatterWidth = currentStaveWidth - (actualMeasureIdx === 0 ? clefTimeWidth : 30);
        new Formatter().joinVoices([voice]).format([voice], formatterWidth);
        voice.draw(context, stave);

        // Attach data-note-index attributes to each note's SVG group for proper mapping
        const svg = this.container.querySelector('svg');
        if (svg) {
          const vfStaveNotes = svg.querySelectorAll('.vf-stavenote');
          vexNotes.forEach((_, vexIdx) => {
            const globalNoteIndex = measure.startIndex + vexIdx;
            const renderBatchOffset = measuresToRender.slice(0, idx).reduce((sum, m) => sum + m.notes.length, 0);
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
          const stavePaths = svg.querySelectorAll('.vf-stave path');
          const noteheadPaths = svg.querySelectorAll('.vf-notehead path');
          const relevantPaths = Array.from(stavePaths).concat(Array.from(noteheadPaths));
          
          if (relevantPaths.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            relevantPaths.forEach(path => {
              const bbox = (path as SVGGraphicsElement).getBBox();
              minX = Math.min(minX, bbox.x);
              minY = Math.min(minY, bbox.y);
              maxX = Math.max(maxX, bbox.x + bbox.width);
              maxY = Math.max(maxY, bbox.y + bbox.height);
            });
            
            const padding = 20;
            const viewBoxX = Math.max(0, minX - padding);
            const viewBoxY = Math.max(0, minY - padding);
            const viewBoxWidth = (maxX - minX) + 2 * padding;
            const viewBoxHeight = (maxY - minY) + 2 * padding;
            
            svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.display = 'block';
          }
        } catch (err) {
          console.warn('Could not compute viewBox from paths:', err);
        }
      }
      } finally {
        VexFlow.NOTATION_FONT_SCALE = originalFontScale;
      }
    } catch (error) {
      console.error('ScoreRenderer: Failed to render score:', error);
      this.container.innerHTML = '<div style="padding: 20px; text-align: center; color: #e53e3e;">악보 렌더링 오류가 발생했습니다.</div>';
      throw error;
    }
  }

  private applyStateColors(): void {
    const svg = this.container.querySelector('svg');
    if (!svg) return;

    const staveNotes = svg.querySelectorAll('.vf-stavenote[data-note-index]');
    
    staveNotes.forEach((staveNote) => {
      const globalIndex = parseInt((staveNote as SVGElement).getAttribute('data-note-index') || '-1', 10);
      
      if (globalIndex >= 0 && globalIndex < this.noteStates.length) {
        const noteHead = staveNote.querySelector('.vf-notehead') as SVGElement;
        if (noteHead) {
          this.applyNoteStateStyle(noteHead, this.noteStates[globalIndex].state);
        }
      }
    });
  }

  private applyNoteStateStyle(noteHead: SVGElement, state: NoteState): void {
    const styles = {
      pending: { fill: '#d1d5db', stroke: '#9ca3af' },
      current: { fill: '#3b82f6', stroke: '#1d4ed8' },
      completed: { fill: '#10b981', stroke: '#059669' },
      wrong: { fill: '#ef4444', stroke: '#dc2626' }
    };

    const style = styles[state];
    noteHead.style.fill = style.fill;
    noteHead.style.stroke = style.stroke;
    noteHead.style.strokeWidth = '4';
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

    const noteHead = staveNote.querySelector('.vf-notehead') as SVGElement;
    if (!noteHead) return;

    this.applyNoteStateStyle(noteHead, this.noteStates[index].state);

    if (color === 'green') {
      noteHead.style.transform = 'scale(1.15)';
      noteHead.style.transformOrigin = 'center';
      noteHead.style.transition = 'transform 0.3s ease';
      setTimeout(() => {
        noteHead.style.transform = 'scale(1)';
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

    const noteHead = staveNote.querySelector('.vf-notehead') as SVGElement;
    if (noteHead) {
      this.applyNoteStateStyle(noteHead, this.noteStates[index].state);
      noteHead.style.transform = 'scale(1)';
    }
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
    this.config = { ...this.config, ...config };
    this.render();
  }

  destroy(): void {
    this.container.innerHTML = '';
    this.renderer = null;
  }
}
