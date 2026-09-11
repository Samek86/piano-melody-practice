// Legacy SW: self-destruct so old clients drop the broken cache-first worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.registration.unregister())
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});
