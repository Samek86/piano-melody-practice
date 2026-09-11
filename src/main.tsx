import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);

// Register service worker (cache-bust query so clients pick up new SW)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=4').catch(() => {
      // Service worker registration failed, continue anyway
    });
  });
}
