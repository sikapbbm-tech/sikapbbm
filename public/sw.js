// Service worker minimal: cache cangkang aplikasi agar halaman scan tetap terbuka saat sinyal hilang.
// Data transaksi TIDAK di-cache di sini; antrean offline ditangani di aplikasi (localStorage).
const CACHE = 'sikap-bbm-v1'
const SHELL = ['/logo.png', '/icon-192.png', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.destination === 'script' || req.destination === 'style' || req.destination === 'image')) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/beranda')))
  )
})
