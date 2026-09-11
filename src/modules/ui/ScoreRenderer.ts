import { Note } from '../../types';
import { midiToNoteName } from '../../utils';

export interface RenderConfig {
  width: number;
  height: number;
  noteSize: number;
  showNoteNames: boolean;
  showFingerNumbers: boolean;
}

export class ScoreRenderer {
  private svg: SVGSVGElement;
  private notes: Note[];
  private config: RenderConfig;
  private noteElements: SVGGElement[] = [];

  constructor(container: HTMLElement, notes: Note[], config: RenderConfig) {
    this.notes = notes;
    this.config = config;
    this.svg = this.createSVG(container);
    this.render();
  }

  private createSVG(container: HTMLElement): SVGSVGElement {
    container.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${this.config.width} ${this.config.height}`);
    svg.style.background = '#ffffff';
    container.appendChild(svg);
    return svg;
  }

  private render(): void {
    // Draw staff
    this.drawStaff();

    // Draw treble clef
    this.drawTrebleClef();

    // Draw notes
    this.notes.forEach((note, index) => {
      this.drawNote(note, index);
    });
  }

  private drawStaff(): void {
    const staffY = this.config.height / 2;
    const lineSpacing = this.config.noteSize * 1.2;

    // Draw 5 staff lines
    for (let i = 0; i < 5; i++) {
      const y = staffY + (i - 2) * lineSpacing;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('x2', String(this.config.width));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', '2');
      this.svg.appendChild(line);
    }
  }

  private drawTrebleClef(): void {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '30');
    text.setAttribute('y', String(this.config.height / 2 + 40));
    text.setAttribute('font-size', String(this.config.noteSize * 3));
    text.setAttribute('font-family', 'serif');
    text.setAttribute('fill', '#333');
    text.textContent = '𝄞';
    this.svg.appendChild(text);
  }

  private drawNote(note: Note, index: number): void {
    const noteGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    noteGroup.setAttribute('data-note-index', String(index));

    const startX = 120;
    const noteSpacing = Math.min(
      (this.config.width - startX - 50) / this.notes.length,
      this.config.noteSize * 2.5
    );
    const x = startX + index * noteSpacing;
    const y = this.getNoteYPosition(note.pitch);

    // Note head (large circle/ellipse)
    const noteHead = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    noteHead.setAttribute('cx', String(x));
    noteHead.setAttribute('cy', String(y));
    noteHead.setAttribute('rx', String(this.config.noteSize * 0.6));
    noteHead.setAttribute('ry', String(this.config.noteSize * 0.5));
    noteHead.setAttribute('fill', '#ccc');
    noteHead.setAttribute('stroke', '#666');
    noteHead.setAttribute('stroke-width', '2');
    noteHead.classList.add('note-head');
    noteGroup.appendChild(noteHead);

    // Note stem (for quarter notes and shorter)
    if (note.duration >= 4) {
      const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const stemHeight = this.config.noteSize * 2.5;
      stem.setAttribute('x1', String(x + this.config.noteSize * 0.6));
      stem.setAttribute('x2', String(x + this.config.noteSize * 0.6));
      stem.setAttribute('y1', String(y));
      stem.setAttribute('y2', String(y - stemHeight));
      stem.setAttribute('stroke', '#333');
      stem.setAttribute('stroke-width', '3');
      noteGroup.appendChild(stem);
    }

    // Finger number (LARGE and prominent)
    if (this.config.showFingerNumbers && note.finger) {
      const fingerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      fingerText.setAttribute('x', String(x));
      fingerText.setAttribute('y', String(y - this.config.noteSize * 1.5));
      fingerText.setAttribute('font-size', String(this.config.noteSize * 1.2));
      fingerText.setAttribute('font-weight', 'bold');
      fingerText.setAttribute('fill', '#2196F3');
      fingerText.setAttribute('text-anchor', 'middle');
      fingerText.textContent = String(note.finger);
      noteGroup.appendChild(fingerText);
    }

    // Note name (optional, below note)
    if (this.config.showNoteNames) {
      const noteName = midiToNoteName(note.pitch);
      const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nameText.setAttribute('x', String(x));
      nameText.setAttribute('y', String(y + this.config.noteSize * 1.8));
      nameText.setAttribute('font-size', String(this.config.noteSize * 0.7));
      nameText.setAttribute('fill', '#666');
      nameText.setAttribute('text-anchor', 'middle');
      nameText.textContent = noteName;
      noteGroup.appendChild(nameText);
    }

    // Add ledger lines if needed
    this.drawLedgerLines(x, y, note.pitch, noteGroup);

    this.noteElements.push(noteGroup);
    this.svg.appendChild(noteGroup);
  }

  private getNoteYPosition(midiNote: number): number {
    const staffCenter = this.config.height / 2;
    const lineSpacing = this.config.noteSize * 0.6;
    const offset = (60 - midiNote) * lineSpacing;
    return staffCenter + offset;
  }

  private drawLedgerLines(x: number, y: number, midiNote: number, group: SVGGElement): void {
    const lineWidth = this.config.noteSize * 1.4;

    // Above staff (high notes)
    if (midiNote >= 77) { // F5 and above
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x - lineWidth / 2));
      line.setAttribute('x2', String(x + lineWidth / 2));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', '2');
      group.appendChild(line);
    }

    // Below staff (low notes)
    if (midiNote <= 52) { // E3 and below
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x - lineWidth / 2));
      line.setAttribute('x2', String(x + lineWidth / 2));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', '2');
      group.appendChild(line);
    }
  }

  highlightNote(index: number, color: 'blue' | 'green' | 'red'): void {
    if (index < 0 || index >= this.noteElements.length) return;

    const noteGroup = this.noteElements[index];
    const noteHead = noteGroup.querySelector('.note-head') as SVGElement;
    if (!noteHead) return;

    const colors = {
      blue: { fill: '#2196F3', stroke: '#1976D2' },
      green: { fill: '#4CAF50', stroke: '#388E3C' },
      red: { fill: '#F44336', stroke: '#D32F2F' }
    };

    noteHead.setAttribute('fill', colors[color].fill);
    noteHead.setAttribute('stroke', colors[color].stroke);
    noteHead.setAttribute('stroke-width', '4');

    // Scale animation
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
    if (index < 0 || index >= this.noteElements.length) return;

    const noteGroup = this.noteElements[index];
    const noteHead = noteGroup.querySelector('.note-head') as SVGElement;
    if (!noteHead) return;

    noteHead.setAttribute('fill', '#ccc');
    noteHead.setAttribute('stroke', '#666');
    noteHead.setAttribute('stroke-width', '2');
    noteHead.style.transform = 'scale(1)';
  }

  updateConfig(config: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...config };
    this.noteElements = [];
    this.render();
  }

  destroy(): void {
    this.svg.remove();
  }
}
