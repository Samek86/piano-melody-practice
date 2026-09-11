// Quick verification script for measure splits in "학교 종이 땡땡땡"
// Run in browser console after loading the song

const song = {
  "timeSignature": [4, 4],
  "notes": [
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 69, "duration": 4, "finger": 1 },
    { "pitch": 69, "duration": 4, "finger": 1 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 64, "duration": 2, "finger": 3 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 64, "duration": 4, "finger": 3 },
    { "pitch": 64, "duration": 4, "finger": 3 },
    { "pitch": 62, "duration": 2, "finger": 2 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 69, "duration": 4, "finger": 1 },
    { "pitch": 69, "duration": 4, "finger": 1 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 64, "duration": 2, "finger": 3 },
    { "pitch": 67, "duration": 4, "finger": 5 },
    { "pitch": 64, "duration": 4, "finger": 3 },
    { "pitch": 62, "duration": 4, "finger": 2 },
    { "pitch": 64, "duration": 4, "finger": 3 },
    { "pitch": 60, "duration": 2, "finger": 1 }
  ]
};

function splitIntoMeasures(notes, timeSignature) {
  const beatsPerMeasure = timeSignature[0];
  const beatValue = timeSignature[1];
  
  const measures = [];
  let currentMeasure = [];
  let currentBeats = 0;
  let noteIndex = 0;

  for (const note of notes) {
    const noteBeats = beatValue / note.duration;
    
    if (currentBeats + noteBeats > beatsPerMeasure && currentMeasure.length > 0) {
      measures.push({
        notes: currentMeasure,
        startIndex: noteIndex - currentMeasure.length
      });
      currentMeasure = [];
      currentBeats = 0;
    }

    currentMeasure.push({ index: noteIndex, ...note });
    currentBeats += noteBeats;
    noteIndex++;
  }

  if (currentMeasure.length > 0) {
    measures.push({
      notes: currentMeasure,
      startIndex: noteIndex - currentMeasure.length
    });
  }
  
  return measures;
}

const midiToSolfege = (midi) => {
  const noteNames = ['도', '도♯', '레', '레♯', '미', '파', '파♯', '솔', '솔♯', '라', '라♯', '시'];
  return noteNames[midi % 12];
};

const measures = splitIntoMeasures(song.notes, song.timeSignature);

console.log('=== 학교 종이 땡땡땡 마디 구조 ===\n');

measures.forEach((measure, idx) => {
  console.log(`마디 ${idx + 1} (음표 ${measure.startIndex}-${measure.startIndex + measure.notes.length - 1}):`);
  const noteStr = measure.notes.map(n => 
    `${midiToSolfege(n.pitch)}(${n.duration === 2 ? '반음' : '4분음'})`
  ).join(' ');
  console.log(`  ${noteStr}\n`);
});

console.log('\n=== 음표 9 (index 8) 검증 ===');
const note8 = song.notes[8];
const measure8 = measures.find(m => 
  m.startIndex <= 8 && 8 < m.startIndex + m.notes.length
);
console.log(`음표 9: ${midiToSolfege(note8.pitch)} (pitch: ${note8.pitch})`);
console.log(`소속 마디: ${measures.indexOf(measure8) + 1}`);
console.log(`마디 시작 음표: ${measure8.startIndex}`);

console.log('\n=== 슬라이딩 윈도우 시뮬레이션 (narrow screen) ===');
for (let noteIdx = 0; noteIdx <= 12; noteIdx++) {
  const currentMeasure = measures.find(m => 
    m.startIndex <= noteIdx && noteIdx < m.startIndex + m.notes.length
  );
  const measureIdx = measures.indexOf(currentMeasure);
  console.log(`음표 ${noteIdx + 1}: 마디 ${measureIdx + 1} → 윈도우: [마디 ${measureIdx + 1}]`);
}
