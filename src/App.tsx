import { useAppStore } from './store/appStore';
import { SongSelection } from './components/SongSelection';
import { MicRequest } from './components/MicRequest';
import { PracticeScreen } from './components/PracticeScreen';
import { CompleteScreen } from './components/CompleteScreen';
import { ErrorScreen } from './components/ErrorScreen';
import './styles/app.css';

function App() {
  const { appState, startPractice } = useAppStore();

  return (
    <div className="app">
      {appState === 'idle' && <SongSelection />}
      {appState === 'song-selection' && <SongSelection />}
      {appState === 'requesting-mic' && <MicRequest onGranted={startPractice} />}
      {(appState === 'practice' || appState === 'paused') && <PracticeScreen />}
      {appState === 'complete' && <CompleteScreen />}
      {appState === 'error' && <ErrorScreen />}
    </div>
  );
}

export default App;
