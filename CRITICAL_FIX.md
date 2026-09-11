# Critical Bug Fix - Measure Scrolling

## Issue Discovered
After initial testing by computerUse subagent (bc-296f9b81), we discovered that measure scrolling was NOT working - all 7 measures remained visible throughout the practice session instead of showing only the current measure.

## Root Cause
**File**: `src/modules/ui/ScoreRenderer.ts:290-335` (`highlightNote` method)

**Bug**: When `highlightNote(index)` was called for a note that hadn't been rendered yet:
1. `noteToVexIndexMap.get(index)` returned `undefined`
2. Line 302: `if (!noteInfo) return;` caused early return
3. `updateMeasureWindow(index)` was never called
4. Measure window remained at initial value (0)
5. All subsequent renders continued showing the same measures

### Example Scenario
```
Initial state: currentMeasureWindow = 0, renders measure 0 (notes 0-3)
User plays notes 0, 1, 2, 3 successfully
Next target: note 4 (in measure 1)

Call: highlightNote(4, 'blue')
  -> noteToVexIndexMap.get(4) === undefined (measure 1 not rendered yet)
  -> Early return at line 302
  -> updateMeasureWindow(4) NEVER CALLED
  -> Window stays at 0 forever
  -> Measures 0-1 keep rendering (or all measures if wide viewport)
```

## Fix
**Commit**: fd5da48

Changed line 301-302 from:
```typescript
const noteInfo = this.noteToVexIndexMap.get(index);
if (!noteInfo) return;
```

To:
```typescript
const noteInfo = this.noteToVexIndexMap.get(index);

// If note not in map, it's not currently rendered - trigger window update
if (!noteInfo) {
  this.updateMeasureWindow(index);
  return;
}
```

### Logic Flow After Fix
```
Call: highlightNote(4, 'blue')
  -> noteToVexIndexMap.get(4) === undefined
  -> !noteInfo is true
  -> Call updateMeasureWindow(4)
     -> Find that note 4 is in measure 1
     -> Set currentMeasureWindow = 1
     -> Call render()
        -> Re-render with measures [1] or [1, 2] depending on width
        -> Build new noteToVexIndexMap including note 4
  -> Return (rendering already complete)

Next call: highlightNote(4, 'blue') again (after render)
  -> noteToVexIndexMap.get(4) now returns { measureIdx: 1, noteIdx: 0 }
  -> Apply highlight styling to the rendered note
```

## Secondary Fix
**File**: `src/modules/ui/ScoreRenderer.ts:151-157`

**Issue**: When rendering a single measure (narrow viewport), we were reserving clef space even for measures 2, 3, etc. But clef+time signature only appear on measure 0 (the first measure of the song).

**Fix**: Simplified single-measure width calculation:
```typescript
// Before
staveWidth = startMeasure === 0 ? availableWidth - clefTimeWidth : availableWidth;

// After
staveWidth = availableWidth;  // Let formatter handle clef space via actualMeasureIdx check
```

The clef is already conditionally added at line 185:
```typescript
if (actualMeasureIdx === 0) {
  stave.addClef('treble');
  stave.addTimeSignature(`${this.timeSignature[0]}/${this.timeSignature[1]}`);
}
```

And the formatter already accounts for it at line 229:
```typescript
const formatterWidth = currentStaveWidth - (actualMeasureIdx === 0 ? clefTimeWidth : 30);
```

## Testing Status
- ✅ Build: Successful
- 🔄 Manual test: In progress (computerUse subagent bc-25de2b3f)
- Expected: Measure 3 displays alone at note 9, with no clef/time signature

## Files Changed
- `src/modules/ui/ScoreRenderer.ts`: Added updateMeasureWindow call for unmapped notes
- `test-debug.html`: Debug simulation (for documentation)
