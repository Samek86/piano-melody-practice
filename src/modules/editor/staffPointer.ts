/** Movement inside this radius is a click. Past it, the gesture is a scroll/pan. */
export const STAFF_POINTER_SLOP_PX = 4;

export interface StaffPointerPoint {
  pointerId: number;
  button: number;
  altKey: boolean;
  clientX: number;
  clientY: number;
}

export type StaffPointerTarget =
  | { kind: 'note'; index: number; rest: boolean }
  | { kind: 'gap'; index: number };

export type StaffPointerEffect =
  | { type: 'none' }
  | { type: 'select'; index: number }
  | { type: 'insert'; index: number }
  | { type: 'pitch'; index: number; deltaSteps: number; phase: 'move' | 'end' | 'cancel' };

export interface StaffPointerResult {
  effect: StaffPointerEffect;
  /**
   * True only while an Alt/Option pitch drag owns the pointer.
   * Plain drags leave this false so the browser can scroll the staff.
   */
  capturePointer: boolean;
  /** True while this gesture is still in progress. */
  tracking: boolean;
}

const idle = (tracking: boolean): StaffPointerResult => ({
  effect: { type: 'none' },
  capturePointer: false,
  tracking
});

/**
 * Staff pointer gestures.
 * Plain drags never change pitch — they scroll. A click selects or inserts.
 * Alt/Option-drag on the already selected notehead adjusts pitch by staff step.
 */
export class StaffPointerGesture {
  private mode: 'idle' | 'click' | 'pitch' = 'idle';
  private pointerId = -1;
  private target: StaffPointerTarget | null = null;
  private startX = 0;
  private startY = 0;
  private moved = false;
  private pitched = false;
  private lastDelta = 0;
  private px = 8;

  down(
    point: StaffPointerPoint,
    target: StaffPointerTarget | null,
    selectedIndex: number,
    pixelsPerStep: number
  ): StaffPointerResult {
    if (this.mode !== 'idle') return idle(true);
    if (point.button !== 0 || !target) return idle(false);

    const pitch =
      point.altKey &&
      target.kind === 'note' &&
      !target.rest &&
      target.index === selectedIndex;

    this.mode = pitch ? 'pitch' : 'click';
    this.pointerId = point.pointerId;
    this.target = target;
    this.startX = point.clientX;
    this.startY = point.clientY;
    this.moved = false;
    this.pitched = false;
    this.lastDelta = 0;
    this.px = Math.max(1, pixelsPerStep);
    return {
      effect: { type: 'none' },
      capturePointer: pitch,
      tracking: true
    };
  }

  move(point: StaffPointerPoint): StaffPointerResult {
    if (!this.matches(point) || !this.target) return idle(this.mode !== 'idle');
    const deltaChanged = this.track(point);
    const capturing = this.mode === 'pitch';
    if (capturing && deltaChanged && this.target.kind === 'note') {
      return {
        effect: { type: 'pitch', index: this.target.index, deltaSteps: this.lastDelta, phase: 'move' },
        capturePointer: true,
        tracking: true
      };
    }
    return { effect: { type: 'none' }, capturePointer: capturing, tracking: true };
  }

  up(point: StaffPointerPoint): StaffPointerResult {
    if (!this.matches(point)) return idle(this.mode !== 'idle');
    this.track(point);
    const result = this.finish(false);
    this.reset();
    return result;
  }

  cancel(point: StaffPointerPoint): StaffPointerResult {
    if (!this.matches(point)) return idle(this.mode !== 'idle');
    const result = this.finish(true);
    this.reset();
    return result;
  }

  private finish(cancelled: boolean): StaffPointerResult {
    const target = this.target;
    if (!target) return idle(false);
    if (this.mode === 'pitch' && target.kind === 'note') {
      if (cancelled) {
        return this.pitched
          ? {
              effect: { type: 'pitch', index: target.index, deltaSteps: this.lastDelta, phase: 'cancel' },
              capturePointer: false,
              tracking: false
            }
          : idle(false);
      }
      if (this.pitched) {
        return {
          effect: { type: 'pitch', index: target.index, deltaSteps: this.lastDelta, phase: 'end' },
          capturePointer: false,
          tracking: false
        };
      }
      return { effect: { type: 'select', index: target.index }, capturePointer: false, tracking: false };
    }
    if (cancelled || this.moved) return idle(false);
    if (target.kind === 'note') {
      return { effect: { type: 'select', index: target.index }, capturePointer: false, tracking: false };
    }
    return { effect: { type: 'insert', index: target.index }, capturePointer: false, tracking: false };
  }

  /** Returns true when a pitch drag's step count changed. */
  private track(point: StaffPointerPoint): boolean {
    if (!this.target) return false;
    const dx = point.clientX - this.startX;
    const dy = point.clientY - this.startY;
    if (!this.moved) {
      if (Math.hypot(dx, dy) < STAFF_POINTER_SLOP_PX) return false;
      this.moved = true;
    }
    if (this.mode !== 'pitch' || this.target.kind !== 'note') return false;
    const delta = Math.round((this.startY - point.clientY) / this.px);
    if (delta === this.lastDelta) return false;
    this.lastDelta = delta;
    this.pitched = true;
    return true;
  }

  private matches(point: StaffPointerPoint): boolean {
    return this.mode !== 'idle' && point.pointerId === this.pointerId;
  }

  private reset(): void {
    this.mode = 'idle';
    this.pointerId = -1;
    this.target = null;
    this.moved = false;
    this.pitched = false;
    this.lastDelta = 0;
  }
}
