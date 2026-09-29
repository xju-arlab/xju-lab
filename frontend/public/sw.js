const CACHE_NAME = 'xju-lab-static-v1'
const OFFLINE_PAGE = '/offline.html'
const HASHED_ASSET = /^\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2|svg|png|jpg|webp)$/i

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_PAGE)))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('xju-lab-static-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (/^\/(?:api|oauth2|login|logout|files)(?:\/|$)/.test(url.pathname)) return

  if (url.pathname === OFFLINE_PAGE) {
    event.respondWith(caches.match(OFFLINE_PAGE).then(hit => hit || fetch(request)))
    return
  }
  if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
      return response
    }))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PAGE).then(hit => hit || Response.error())))
  }
})
