import React from 'react';
import { allSongs, songsByDifficulty, songsByOrigin } from '../data/songIndex';
import { useAppStore } from '../store/appStore';
import { Origin, Difficulty } from '../types';

type FilterType = 'all' | Origin | Difficulty;

export const SongSelection: React.FC = () => {
  const { selectSong, settings, updateSettings } = useAppStore();
  const [filter, setFilter] = React.useState<FilterType>('beginner');

  const filteredSongs = React.useMemo(() => {
    if (filter === 'all') return allSongs;
    if (filter === 'korean' || filter === 'japanese') {
      return songsByOrigin[filter].filter(s => s.difficulty === 'beginner');
    }
    return songsByDifficulty[filter as Difficulty];
  }, [filter]);

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '900px' }}>
        <h1>🎹 피아노 멜로디 연습</h1>
        <p style={{ textAlign: 'center', color: '#718096', marginBottom: '12px' }}>
          연습할 곡을 선택하세요
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            padding: '12px 14px',
            background: '#f7fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}
        >
          <span style={{ color: '#4a5568', fontWeight: 600, fontSize: '0.95rem' }}>조율 A4</span>
          {[440, 442, 445].map((hz) => (
            <button
              key={hz}
              type="button"
              className={`filter-btn ${settings.a4Hz === hz ? 'active' : ''}`}
              onClick={() => updateSettings({ a4Hz: hz })}
              style={{ minWidth: 64 }}
            >
              {hz} Hz
            </button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#718096', fontSize: '0.9rem' }}>
            직접
            <input
              type="number"
              min={420}
              max={460}
              step={1}
              value={settings.a4Hz}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) updateSettings({ a4Hz: Math.min(460, Math.max(420, Math.round(v))) });
              }}
              style={{ width: 72, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e0' }}
            />
            Hz
          </label>
          <span style={{ width: '100%', textAlign: 'center', color: '#a0aec0', fontSize: 12 }}>
            피아노 조율에 맞게 바꾸세요. (지금 피아노가 445면 445 선택)
          </span>
        </div>

        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'beginner' ? 'active' : ''}`}
            onClick={() => setFilter('beginner')}
          >
            입문 (모든 노래)
          </button>
          <button
            className={`filter-btn ${filter === 'korean' ? 'active' : ''}`}
            onClick={() => setFilter('korean')}
          >
            🇰🇷 한국 동요
          </button>
          <button
            className={`filter-btn ${filter === 'japanese' ? 'active' : ''}`}
            onClick={() => setFilter('japanese')}
          >
            🇯🇵 일본 동요
          </button>
          <button
            className={`filter-btn ${filter === 'easy' ? 'active' : ''}`}
            onClick={() => setFilter('easy')}
          >
            초급
          </button>
        </div>

        <div className="song-grid">
          {filteredSongs.map((song) => (
            <div
              key={song.id}
              className="song-card"
              onClick={() => selectSong(song)}
            >
              <div className="song-title">
                {song.titleKo}
                {song.origin === 'japanese' && song.titleJa && (
                  <div style={{ fontSize: '0.85rem', color: '#718096' }}>
                    {song.titleJa}
                  </div>
                )}
              </div>
              <div className="song-meta">
                <span className={`difficulty-badge difficulty-${song.difficulty}`}>
                  {song.difficulty === 'beginner' ? '입문' : '초급'}
                </span>
                <span className="origin-badge">
                  {song.origin === 'korean' ? '🇰🇷' : '🇯🇵'}
                </span>
              </div>
              <div className="song-meta" style={{ marginTop: '8px' }}>
                음표: {song.notes.length}개 | ♩ = {song.tempo}
              </div>
            </div>
          ))}
        </div>

        {filteredSongs.length === 0 && (
          <p style={{ textAlign: 'center', color: '#718096', marginTop: '20px' }}>
            해당하는 곡이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
};
