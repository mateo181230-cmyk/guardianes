// ============================================================
// Service Worker — Guardianes Colombia PWA
// ============================================================

const CACHE_NAME = 'guardianes-v1';

// Archivos que se pre-cachean al instalar
const PRECACHE_URLS = [
  './',
  './index.html',
  './inicio.html',
  './manifest.json',
  './tareas.json',
  './logo.webp',
  './offline-sync.js'
];

// CDNs que también queremos cachear (se cachean en el primer fetch)
const CDN_CACHE_PATTERNS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com/ajax/libs/font-awesome',
  'cdn.jsdelivr.net/npm/@supabase'
];

// ============================================================
// INSTALL — Pre-cachear archivos estáticos
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE — Limpiar caches viejos
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — Estrategia de cache
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Solo manejamos GET
  if (event.request.method !== 'GET') return;

  // Supabase Storage: archivos estáticos (imágenes, videos, PDFs)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Supabase REST: consultas a tablas (imagenes, videos, pdf, youtube)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CDNs: cache-first
  const isCDN = CDN_CACHE_PATTERNS.some(pattern => event.request.url.includes(pattern));
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Archivos locales: network-first con fallback a cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./inicio.html');
      }))
  );
});

// ============================================================
// SYNC — Background Sync (cuando vuelve internet)
// ============================================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-acciones') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_ACCIONES' });
        });
      })
    );
  }
});

// ============================================================
// MESSAGE — Comunicación con la app
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
