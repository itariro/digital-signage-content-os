const CACHE = 'frame-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])))
})
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      const clone = resp.clone()
      caches.open(CACHE).then((c) => c.put(e.request, clone))
      return resp
    }).catch(() => caches.match(e.request))),
  )
})
