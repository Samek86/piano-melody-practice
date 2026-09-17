import { Dot, StaveNote } from 'vexflow';

export function attachDots(staveNote: StaveNote, dotted?: boolean): void {
  if (!dotted) return;
  Dot.buildAndAttach([staveNote], { all: true });
}
