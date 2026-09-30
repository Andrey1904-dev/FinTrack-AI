/* FinTrack AI — сервис-воркер: офлайн-доступ к приложению.
   Стратегия: приложение кэшируется целиком (это один HTML-файл),
   запросы к Supabase идут в сеть и не кэшируются. */
const CACHE = 'fintrack-v2.6.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'logo.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'apple-touch-icon.png', 'og-preview.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;               // Supabase и чужие домены — только сеть
  if (e.request.mode === 'navigate'){
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('index.html', copy));
        return res;
      }).catch(() => caches.match('index.html').then(r => r || caches.match('./')))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic'){
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => cached)));
});
