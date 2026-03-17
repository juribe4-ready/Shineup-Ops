const CACHE_NAME = 'shineup-ops-v1';

// Archivos que se guardan en caché al instalar
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// INSTALL — guarda todo en caché la primera vez
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Guardando archivos en caché...');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// ACTIVATE — limpia cachés viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché vieja:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// FETCH — sirve desde caché, si no hay busca en red
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        console.log('[SW] Sirviendo desde caché:', event.request.url);
        return cached;
      }
      // No está en caché — busca en red y guarda para la próxima
      return fetch(event.request).then(response => {
        // Solo cachea respuestas válidas
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        // Sin red y sin caché — muestra index.html como fallback
        return caches.match('/index.html');
      });
    })
  );
});
