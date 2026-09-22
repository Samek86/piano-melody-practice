import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NoteMatcher, isWithinCentsTolerance } from './NoteMatcher.ts';
import { midiToFrequency } from '../../utils.ts';

const C4 = 261.63;
const D4 = 293.66;
const HIGH = 0.2;
const LOW = 0.04;

/** Shift a frequency by the given number of cents (negative = flat). */
function freqCents(baseHz: number, cents: number): number {
  return baseHz * Math.pow(2, cents / 1200);
}

let now = 0;
const realNow = Date.now;

beforeEach(() => {
  now = 1_000_000;
  Date.now = () => now;
});

afterEach(() => {
  Date.now = realNow;
});

function createMatcher(overrides: Partial<ConstructorParameters<typeof NoteMatcher>[0]> = {}) {
  return new NoteMatcher({
    toleranceCents: 50,
    sustainWindowMs: 50,
    debounceMs: 40,
    a4Hz: 440,
    ...overrides
  });
}

function tick(matcher: NoteMatcher, freq: number | null, peak: number, ms: number) {
  const step = 10;
  let last = matcher.checkMatch(freq, peak);
  if (last.matched) return last;
  for (let elapsed = step; elapsed <= ms; elapsed += step) {
    now += step;
    last = matcher.checkMatch(freq, peak);
    if (last.matched) return last;
  }
  return last;
}

function matchFirstC(matcher: NoteMatcher) {
  matcher.setTargetNote(60);
  const result = tick(matcher, C4, HIGH, 60);
  assert.equal(result.matched, true);
}

test('held same pitch does not count as the next identical note', () => {
  const matcher = createMatcher();
  matchFirstC(matcher);
  matcher.setTargetNote(60);

  const held = tick(matcher, C4, HIGH, 200);
  assert.equal(held.matched, false);
});

test('re-striking the same note after a volume dip counts as a new note', () => {
  const matcher = createMatcher();
  matchFirstC(matcher);
  matcher.setTargetNote(60);

  tick(matcher, C4, HIGH, 20);
  tick(matcher, C4, LOW, 30);
  const second = tick(matcher, C4, HIGH, 60);

  assert.equal(second.matched, true);
});

test('a shallow volume dip then re-strike still counts as a new note', () => {
  const matcher = createMatcher();
  matchFirstC(matcher);
  matcher.setTargetNote(60);

  tick(matcher, C4, HIGH, 20);
  tick(matcher, C4, 0.14, 30);
  const second = tick(matcher, C4, HIGH, 60);

  assert.equal(second.matched, true);
});

test('a re-strike during debounce is still recognized after debounce', () => {
  const matcher = createMatcher();
  matchFirstC(matcher);
  matcher.setTargetNote(60);

  tick(matcher, C4, LOW, 20);
  tick(matcher, C4, HIGH, 20);
  const afterDebounce = tick(matcher, C4, HIGH, 80);

  assert.equal(afterDebounce.matched, true);
});

test('quiet leftover ring after a long note does not auto-advance', () => {
  const matcher = createMatcher();
  matchFirstC(matcher);
  matcher.setTargetNote(60);

  tick(matcher, C4, LOW, 40);
  const leftover = tick(matcher, C4, LOW, 120);

  assert.equal(leftover.matched, false);
});

test('a different pitch still clears the repeated-note gate', () => {
  const matcher = createMatcher();
  matchFirstC(matcher);
  matcher.setTargetNote(62);

  const other = tick(matcher, D4, HIGH, 120);
  assert.equal(other.matched, true);
});

test('release gate auto-clears after timeout with renewed energy', () => {
  const matcher = createMatcher();
  matchFirstC(matcher);
  matcher.setTargetNote(60);

  // Wait past the 350ms timeout while maintaining high energy
  // The gate should auto-clear due to timeout + sustained energy
  now += 400;
  matcher.checkMatch(C4, HIGH);

  // Now should be able to match again with sustain
  const retriggered = tick(matcher, C4, HIGH, 60);
  assert.equal(retriggered.matched, true);
});

test('isWithinCentsTolerance accepts asymmetric flat/sharp windows', () => {
  assert.equal(isWithinCentsTolerance(-80, 80, 50), true);
  assert.equal(isWithinCentsTolerance(-81, 80, 50), false);
  assert.equal(isWithinCentsTolerance(50, 80, 50), true);
  assert.equal(isWithinCentsTolerance(51, 80, 50), false);
  assert.equal(isWithinCentsTolerance(-60, 80, 50), true);
});

test('slightly flat D4 matches with asymmetric mic tolerance [-80, +50]', () => {
  // Mimics mic under-reading / piano ~A445 vs internal A440: ~60¢ flat still OK
  const matcher = createMatcher({
    flatToleranceCents: 80,
    sharpToleranceCents: 50
  });
  matcher.setTargetNote(62); // D4
  const d4Exact = midiToFrequency(62, 440);
  const flat60 = freqCents(d4Exact, -60);

  const result = tick(matcher, flat60, HIGH, 60);
  assert.equal(result.matched, true);
  assert.ok(result.centsOff != null && result.centsOff < -50);
});

test('too-flat D4 is rejected beyond flatToleranceCents', () => {
  const matcher = createMatcher({
    flatToleranceCents: 80,
    sharpToleranceCents: 50
  });
  matcher.setTargetNote(62);
  const d4Exact = midiToFrequency(62, 440);
  const flat95 = freqCents(d4Exact, -95);

  const result = tick(matcher, flat95, HIGH, 60);
  assert.equal(result.matched, false);
});

test('slightly sharp D4 still matches within sharpToleranceCents', () => {
  const matcher = createMatcher({
    flatToleranceCents: 80,
    sharpToleranceCents: 50
  });
  matcher.setTargetNote(62);
  const d4Exact = midiToFrequency(62, 440);
  const sharp45 = freqCents(d4Exact, 45);

  const result = tick(matcher, sharp45, HIGH, 60);
  assert.equal(result.matched, true);
});

test('too-sharp D4 is rejected beyond sharpToleranceCents (not blown open)', () => {
  const matcher = createMatcher({
    flatToleranceCents: 80,
    sharpToleranceCents: 50
  });
  matcher.setTargetNote(62);
  const d4Exact = midiToFrequency(62, 440);
  const sharp65 = freqCents(d4Exact, 65);

  const result = tick(matcher, sharp65, HIGH, 60);
  assert.equal(result.matched, false);
});

test('omitting flat/sharp falls back to symmetric toleranceCents', () => {
  const matcher = createMatcher({ toleranceCents: 50 });
  matcher.setTargetNote(62);
  const d4Exact = midiToFrequency(62, 440);

  assert.equal(tick(matcher, freqCents(d4Exact, -45), HIGH, 60).matched, true);
  // Reset sustain / debounce between attempts
  matcher.reset();
  matcher.setTargetNote(62);
  assert.equal(tick(matcher, freqCents(d4Exact, -60), HIGH, 60).matched, false);
});

test('matchInstant ignores cents and stays pitch-class only', () => {
  const matcher = createMatcher({
    flatToleranceCents: 80,
    sharpToleranceCents: 50
  });
  matcher.setTargetNote(62); // D4
  // Soft keyboard: any D (e.g. D5 = 74) matches instantly
  const instant = matcher.matchInstant(74);
  assert.equal(instant.matched, true);
  assert.equal(instant.centsOff, 0);
});
