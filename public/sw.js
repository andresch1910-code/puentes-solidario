// Service worker: permite abrir la app sin conexión (red primero, caché como respaldo).
// La API nunca se guarda en caché para no mostrar datos desactualizados ni privados.
const CACHE = 'puente-v1';
const SHELL = [
  '/', '/index.html', '/css/styles.css', '/js/app.js', '/js/api.js', '/js/ui.js', '/js/map.js',
  '/js/views/home.js', '/js/views/request-form.js', '/js/views/expediente.js',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/icons/icon.svg', '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))),
  );
});
