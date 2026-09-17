import { createRoot } from 'react-dom/client';
import App from './App';

// Always show crashes on device instead of a silent white screen
function showFatal(message: string) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `<div style="padding:24px;font-family:-apple-system,sans-serif;color:#1a202c">
    <h2 style="color:#c53030">앱 오류</h2>
    <p style="word-break:break-word;white-space:pre-wrap">${message}</p>
    <p style="color:#718096;font-size:14px">빌드: 2026-09-17-pitchfix4</p>
    <button style="margin-top:16px;padding:12px 16px;font-size:16px"
      onclick="location.href=location.pathname+'?t='+Date.now()">새로고침</button>
  </div>`;
}

window.addEventListener('error', (e) => {
  showFatal(e.error?.stack || e.message || String(e.error || e));
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  showFatal(reason?.stack || reason?.message || String(reason));
});

// Kill any old service workers / caches that keep serving broken JS
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

createRoot(document.getElementById('root')!).render(<App />);
