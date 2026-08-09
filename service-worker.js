// ============================================================
// Trekking v1.4 — service-worker.js
// Copyright (c) 2026 Lazzaro Serva - Centola
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================

const CACHE_NAME = 'trekking-v1.4';
const TILE_CACHE_NAME = 'trekking-tiles-v1.4';

const ASSETS = [
  './', './index.html', './manifest.json', './monitoraggio.html',
  './style.css', './config.js', './storage.js', './sync.js', './app.js',
  './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-192-maskable.png', './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png', './assets/favicon.ico', './assets/favicon-64.png',
  './demo/trekking-demo-escursioni.json',
];

// ── Installazione: NON chiamare skipWaiting() qui. ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).catch(() =>
        cache.addAll(['./index.html', './manifest.json'])
      )
    )
  );
});

// ── Attivazione: pulizia cache vecchie ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== TILE_CACHE_NAME)
        .map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first per l'app, cache-first con fallback rete per le tile mappa ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  // Tile OpenStreetMap: cache separata, così le zone già visitate restano
  // disponibili offline senza gonfiare la cache principale dell'app.
  if (url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(r => {
            if (r && r.status === 200) cache.put(event.request, r.clone());
            return r;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(r => {
        if (r && r.status === 200)
          caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone()));
        return r;
      }).catch(() =>
        event.request.mode === 'navigate' ? caches.match('./index.html') : undefined
      );
    })
  );
});

// ── Messaggi dalla pagina ──
self.addEventListener('message', event => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  // CACHE_ROUTE_ASSETS: predisposto per un pre-caricamento mirato delle
  // tile dell'area visibile quando l'utente preme "Rendi disponibile offline".
  // In V1.0 la cache-first sulle tile (sopra) è già sufficiente per l'uso
  // base; qui resta il punto di aggancio per un pre-fetch più aggressivo.
  if (type === 'CACHE_ROUTE_ASSETS') {
    return;
  }
});

// ── Notifiche push (sincronizzazione di gruppo, v1.3) ──
// Il payload arriva già cifrato/decifrato dal browser secondo lo standard
// Web Push; qui riceviamo il JSON in chiaro inviato dal Worker Cloudflare
// ({ titolo, corpo, tag }).
self.addEventListener('push', event => {
  let dati = { titolo: 'Trekking', corpo: 'Nuovo avviso dal gruppo.' };
  try { if (event.data) dati = { ...dati, ...event.data.json() }; } catch (_) { /* payload non JSON: uso i valori di default */ }

  event.waitUntil(
    self.registration.showNotification(dati.titolo, {
      body: dati.corpo,
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      tag: dati.tag || 'trekking',
      renotify: true,
    })
  );
});

// ── Click su una notifica: porta l'utente sulla vista Gruppo dell'app ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const client = clientsArr.find(c => 'focus' in c);
      if (client) return client.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
