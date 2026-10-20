// Frame display service worker — offline shell only.
//
// v1 cached EVERY GET cache-first, including /api/* responses: a display
// that cached a store payload served stale content forever and editors'
// saves never landed. v2 never touches caches for /api requests, uses
// network-first for navigations (offline: cached shell), stale-while-
// revalidate for static assets, and deletes old caches on activate so
// already-bricked kiosks recover on the next visit.
const VERSION = 'frame-v2'
const STATIC_CACHE = 'frame-static-v2'
const SHELL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll([SHELL])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

function isApi(url) {
  return new URL(url).pathname.startsWith('/api/')
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  // API: network only. A failed API call must surface as an error the app
  // can show — serving stale JSON is what bricked displays.
  if (isApi(req.url)) {
    event.respondWith(fetch(req).catch(() =>
      new Response(JSON.stringify({ error: 'offline' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      }),
    ))
    return
  }

  const navigate = req.mode === 'navigate' || (req.headers && req.headers.get('accept') || '').includes('text/html')
  if (navigate) {
    // Network-first so updated app shells land immediately; offline → shell cache.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(STATIC_CACHE).then((c) => c.put(SHELL, copy))
          return res
        })
        .catch(() => caches.open(STATIC_CACHE).then((c) => c.match(SHELL))),
    )
    return
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const refresh = fetch(req).then((res) => {
          cache.put(req, res.clone())
          return res
        }).catch(() => hit)
        return hit || refresh
      }),
    ),
  )
})
