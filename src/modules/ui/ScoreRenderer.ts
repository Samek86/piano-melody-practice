import { Note } from '../../types';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Modifier, FretHandFinger } from 'vexflow';

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
      context.setFillStyle('#fffef7');
      context.fillRect(0, 0, width, height);
      context.setFillStyle('#000000');

      const startMeasure = this.currentMeasureWindow;
      const endMeasure = Math.min(startMeasure + 2, this.measures.length);
      const measuresToRender = this.measures.slice(startMeasure, endMeasure);

      if (measuresToRender.length === 0) return;

      const staveWidth = (width - 40) / measuresToRender.length;
      const staveY = Math.max(60, height / 2 - 60);

      measuresToRender.forEach((measure, idx) => {
        const actualMeasureIdx = startMeasure + idx;
        const x = 20 + idx * staveWidth;
        
        const stave = new Stave(x, staveY, staveWidth);
        
        if (idx === 0) {
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

        new Formatter().joinVoices([voice]).format([voice], staveWidth - 20);
        voice.draw(context, stave);
      });

      this.applyStateColors();
    } catch (error) {
      console.error('ScoreRenderer: Failed to render score:', error);
      this.container.innerHTML = '<div style="padding: 20px; text-align: center; color: #e53e3e;">악보 렌더링 오류가 발생했습니다.</div>';
      throw error;
    }
  }

  private applyStateColors(): void {
    const svg = this.container.querySelector('svg');
    if (!svg) return;

    const noteHeads = svg.querySelectorAll('.vf-notehead');
    const startMeasure = this.currentMeasureWindow;
    const endMeasure = Math.min(startMeasure + 2, this.measures.length);

    let vexNoteIndex = 0;
    for (let m = startMeasure; m < endMeasure; m++) {
      const measure = this.measures[m];
      for (let i = 0; i < measure.notes.length; i++) {
        const globalIndex = measure.startIndex + i;
        const noteHead = noteHeads[vexNoteIndex] as SVGElement;
        
        if (noteHead && globalIndex < this.noteStates.length) {
          this.applyNoteStateStyle(noteHead, this.noteStates[globalIndex].state);
        }
        vexNoteIndex++;
      }
    }
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
    noteHead.style.strokeWidth = '3';
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
    if (!noteInfo) return;

    const startMeasure = this.currentMeasureWindow;
    const measureInWindow = noteInfo.measureIdx - startMeasure;
    
    if (measureInWindow < 0 || measureInWindow >= 2) {
      this.updateMeasureWindow(index);
      return;
    }

    const svg = this.container.querySelector('svg');
    if (!svg) return;

    const noteHeads = svg.querySelectorAll('.vf-notehead');
    
    let noteOffset = 0;
    for (let i = startMeasure; i < noteInfo.measureIdx; i++) {
      noteOffset += this.measures[i].notes.length;
    }
    
    const targetNoteIndex = noteOffset + noteInfo.noteIdx;
    const noteHead = noteHeads[targetNoteIndex] as SVGElement;
    
    if (!noteHead) return;

    this.applyNoteStateStyle(noteHead, this.noteStates[index].state);

    if (color === 'green') {
      noteHead.style.transform = 'scale(1.2)';
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

    const noteInfo = this.noteToVexIndexMap.get(index);
    if (!noteInfo) return;

    const startMeasure = this.currentMeasureWindow;
    const noteHeads = svg.querySelectorAll('.vf-notehead');
    
    let noteOffset = 0;
    for (let i = startMeasure; i < noteInfo.measureIdx; i++) {
      if (i >= 0 && i < this.measures.length) {
        noteOffset += this.measures[i].notes.length;
      }
    }
    
    const targetNoteIndex = noteOffset + noteInfo.noteIdx;
    const noteHead = noteHeads[targetNoteIndex] as SVGElement;
    
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
        const newWindow = Math.floor(measureIndex / 2) * 2;
        if (newWindow !== this.currentMeasureWindow) {
          this.currentMeasureWindow = newWindow;
          this.render();
        }
      }
      return;
    }

    const newWindow = Math.floor(noteInfo.measureIdx / 2) * 2;
    
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
