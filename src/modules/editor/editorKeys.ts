export type EditorKeyCommand =
  | 'cursor-prev'
  | 'cursor-next'
  | 'pitch-up'
  | 'pitch-down'
  | 'delete'
  | 'undo'
  | 'redo';

export interface EditorKeyInput {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** Keys handled by the staff editor. Pitch moves only with Shift+↑/↓. */
export function editorKeyCommand(event: EditorKeyInput): EditorKeyCommand | null {
  const key = event.key;
  if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'y') return 'redo';
  if (key === 'ArrowLeft') return 'cursor-prev';
  if (key === 'ArrowRight') return 'cursor-next';
  if (event.shiftKey && key === 'ArrowUp') return 'pitch-up';
  if (event.shiftKey && key === 'ArrowDown') return 'pitch-down';
  if (key === 'Delete' || key === 'Backspace') return 'delete';
  return null;
}
