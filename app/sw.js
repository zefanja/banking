/*
 * Service Worker des Haushaltsbuchs.
 * Wird beim Build von vite.config.ts verarbeitet: Build-ID und Precache-Liste werden dort eingesetzt.
 *
 * - Alle Build-Dateien werden bei der Installation vorab gecacht → die App startet auch offline.
 * - Seitenaufrufe: zuerst Netzwerk (damit Updates sofort ankommen), offline aus dem Cache.
 * - Übrige Dateien: zuerst Cache (die Dateinamen enthalten einen Hash und ändern sich nie).
 */
const CACHE = 'haushaltsbuch-__BUILD_ID__'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('haushaltsbuch-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('./index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })),
    )
    return
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
      }
      return res
    })),
  )
})
