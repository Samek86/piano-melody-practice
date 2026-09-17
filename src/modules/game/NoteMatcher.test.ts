import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NoteMatcher } from './NoteMatcher.ts';

const C4 = 261.63;
const D4 = 293.66;
const HIGH = 0.2;
const LOW = 0.04;

let now = 0;
const realNow = Date.now;

beforeEach(() => {
  now = 1_000_000;
  Date.now = () => now;
});

afterEach(() => {
  Date.now = realNow;
});

function createMatcher() {
  return new NoteMatcher({
    toleranceCents: 50,
    sustainWindowMs: 50,
    debounceMs: 40,
    a4Hz: 440
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
