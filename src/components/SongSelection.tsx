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

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.95rem', gap: '8px' }}>
            <input
              type="checkbox"
              checked={settings.showFingerNumbers}
              onChange={(e) => updateSettings({ showFingerNumbers: e.target.checked })}
              style={{ cursor: 'pointer', width: '18px', height: '18px' }}
            />
            <span>손가락 번호 표시</span>
          </label>
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
