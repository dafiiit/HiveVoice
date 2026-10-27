// Service worker: makes HiveVoice installable and keeps what was seen readable without a connection.
// Pages always come fresh from the network when there is one; the copy kept here is only shown offline.
// Signing out deletes all kept pages, so the next person on this device sees none of them.
const STATIC = 'hivevoice-static-v3';
const PAGES = 'hivevoice-pages-v3';
const MEDIA = 'hivevoice-media-v3';
const CONFIG = 'hivevoice-config-v1';
const OFFLINE = '/offline.html';
const MAX_PAGES = 120;
const MAX_STATIC = 3000;
const KEEP = [STATIC, PAGES, MEDIA, CONFIG];
const forget = () => Promise.all([caches.delete(PAGES), caches.delete(MEDIA)]).then(() => fetched.clear());

// What the person chose under Einstellungen → Offline (the page tells us; kept in a cache entry so it survives a restart of this worker):
//   mode 'off': nothing is kept; 'text': pages; 'all': pages and pictures. wifiOnly: pictures and files only when the
//   connection is not a mobile one (and the device is not asked to save data), where the browser tells.
let settings = null;
async function config() {
  if (settings) return settings;
  try {
    const hit = await (await caches.open(CONFIG)).match('/__offline-settings');
    settings = hit ? await hit.json() : null;
  } catch { /* none kept */ }
  return (settings = settings || { mode: 'all', wifiOnly: true });
}
async function setConfig(next) {
  settings = { mode: ['off', 'text', 'all'].includes(next.mode) ? next.mode : 'all', wifiOnly: next.wifiOnly !== false };
  if (settings.mode === 'off') await forget();
  try { await (await caches.open(CONFIG)).put('/__offline-settings', new Response(JSON.stringify(settings), { headers: { 'Content-Type': 'application/json' } })); } catch { /* not kept */ }
}
const metered = () => { const c = self.navigator && self.navigator.connection; return !!c && (c.saveData === true || c.type === 'cellular'); };
async function mayKeep(kind) {
  const c = await config();
  if (c.mode === 'off') return false;
  if (kind === 'media') return c.mode === 'all' && !(c.wifiOnly && metered());
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, '/icons/192', '/icons/512'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Oldest entries go first once a cache is full.
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Pages tell the browser's HTTP cache not to store them; this copy is different: shown only offline, deleted on sign-out.
const keepable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;
const pageKey = (url) => { const u = new URL(url); u.hash = ''; return u.href; };
const skip = (url) => url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/cron') || url.pathname === '/sw.js';

async function savePage(key, res) {
  if (!(await mayKeep('page'))) return;
  const cache = await caches.open(PAGES);
  await cache.delete(key);
  await cache.put(key, res);
  await trim(PAGES, MAX_PAGES);
}

// Pages opened inside the app arrive as data for the router, not as whole pages, so the page asks
// for a copy to be kept. Each address at most every two minutes.
const fetched = new Map();
async function remember(href) {
  const url = new URL(href, self.location.origin);
  if (url.origin !== self.location.origin || skip(url) || !(await mayKeep('page'))) return;
  const key = pageKey(url.href);
  if (Date.now() - (fetched.get(key) || 0) < 120000) return;
  fetched.set(key, Date.now());
  try {
    const res = await fetch(url.href, { credentials: 'same-origin', headers: { 'X-HV-Keep': '1' } });
    if (keepable(res) && (res.headers.get('content-type') || '').includes('text/html')) await savePage(key, res);
  } catch { /* offline: nothing to keep */ }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'keep' && typeof data.url === 'string') event.waitUntil(remember(data.url));
  if (data.type === 'keep-many' && Array.isArray(data.urls)) event.waitUntil((async () => { for (const u of data.urls.slice(0, 20)) if (typeof u === 'string') await remember(u); })());
  if (data.type === 'forget') event.waitUntil(forget());
  if (data.type === 'config') event.waitUntil(setConfig(data));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Signing out: forget every kept page before the request goes on.
  if (req.method === 'POST' && url.pathname === '/auth/signout') {
    event.respondWith(forget().then(() => fetch(req)));
    return;
  }
  if (req.method !== 'GET' || skip(url)) return;

  // Whole pages: network first, the kept copy when offline, else the offline page.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (keepable(res)) {
          fetched.set(pageKey(req.url), Date.now());
          event.waitUntil(savePage(pageKey(req.url), res.clone()));
        }
        return res;
      } catch {
        return (await caches.match(pageKey(req.url), { cacheName: PAGES, ignoreVary: true }))
          || (await caches.match(OFFLINE, { cacheName: STATIC }))
          || Response.error();
      }
    })());
    return;
  }

  // Router data for a page (not a prefetch): offline, answer with an error status so the app
  // opens the address as a whole page, which then comes from the kept copies above.
  if (req.headers.get('RSC') === '1') {
    if (req.headers.get('Next-Router-Prefetch')) return;
    event.respondWith(fetch(req).catch(() => new Response('', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
    return;
  }

  // draw.io served from this site (NEXT_PUBLIC_DRAWIO_URL=/drawio, see docs/desktop.md): kept after the first use, so that
  // diagrams can be drawn without a connection. Shown from the cache at once, renewed in the background.
  if (url.pathname.startsWith('/drawio/')) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => { if (keepable(res)) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { event.waitUntil(fresh); return hit; }
      return (await fresh) || Response.error();
    })());
    return;
  }

  // Scripts, styles, fonts and icons never change under their name: from the cache once there.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { cacheName: STATIC });
      if (hit) return hit;
      const res = await fetch(req);
      if (keepable(res)) {
        const copy = res.clone();
        event.waitUntil(caches.open(STATIC).then((c) => c.put(req, copy)).then(() => trim(STATIC, MAX_STATIC)));
      }
      return res;
    })());
    return;
  }

  // Pictures and files: network first, the kept copy offline.
  if (req.destination === 'image' || url.pathname.startsWith('/api/files/') || url.pathname.startsWith('/_next/image')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (keepable(res)) {
          const copy = res.clone();
          event.waitUntil(mayKeep('media').then((ok) => ok && caches.open(MEDIA).then((c) => c.put(req, copy)).then(() => trim(MEDIA, MAX_PAGES * 3))));
        }
        return res;
      } catch {
        return (await caches.match(req, { cacheName: MEDIA })) || Response.error();
      }
    })());
  }
});
