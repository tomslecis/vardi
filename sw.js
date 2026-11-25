// Offline support. App files: network first (always newest when online), cache as fallback.
// Word pictures and recordings: cache first (they never change).
const CACHE = 'vardi-1795608373';
const IMG_CACHE = 'vardi-img';
const ASSETS = ['./', 'index.html', 'css/style.css', 'js/words.js', 'js/lessons.js', 'js/audio.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    if (url.pathname.includes('/img/') || url.pathname.includes('/audio/')) {
      const imgs = await caches.open(IMG_CACHE);
      const hit = await imgs.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) imgs.put(e.request, res.clone());
      return res;
    }
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || cache.match('index.html');
    }
  }));
});
// The page sends the list of word pictures; store any that are not cached yet.
self.addEventListener('message', e => {
  if (e.data?.type !== 'precache') return;
  e.waitUntil(caches.open(IMG_CACHE).then(async cache => {
    for (const url of e.data.urls) if (!(await cache.match(url))) await cache.add(url).catch(() => {});
  }));
});
