/* CoreV | OxeFit Sales Tracker — service worker
 *
 * Strategy: NETWORK-FIRST for everything on this origin. The live index.html is always
 * fetched fresh when online (so every re-upload reaches the team on next open), and a
 * cached copy of the app shell is served only when the network is unavailable.
 *
 * Deliberately NOT cached / NOT intercepted:
 *   - anything cross-origin (Microsoft login, Graph/OneDrive, HubSpot, CDNs)
 *   - anything that isn't a plain GET
 * This keeps the Microsoft sign-in redirect and the OneDrive sync untouched.
 *
 * To force clients to pick up a new build, bump CACHE_VERSION.
 */
const CACHE_VERSION = 'corev-sales-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {/* tolerate a missing asset */}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to ask the waiting worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // never touch POST/PUT etc.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // leave Microsoft / HubSpot / CDNs alone

  // Network-first; fall back to cache (app shell) when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && (req.mode === 'navigate' || APP_SHELL.some((p) => url.pathname.endsWith(p.replace('./', '/'))))) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
