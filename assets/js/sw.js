const CACHE_STATIC  = 'qianai-static-v1'
const CACHE_DYNAMIC = 'qianai-dynamic-v1'

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/auth.html',
    '/pair.html',
    '/settings.html',
    '/assets/css/base.css',
    '/assets/css/components.css',
    '/assets/css/pages.css',
    '/assets/js/store.js',
    '/assets/js/api.js',
    '/assets/js/webauthn.js',
    '/assets/js/webrtc.js',
    '/assets/js/chat.js',
    '/assets/js/settings.js',
    'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Lora:ital,wght@0,400;0,500;1,400&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
]

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_STATIC)
            .then(c => c.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    )
})

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    )
})

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url)

    if (e.request.method !== 'GET') return
    if (url.pathname.startsWith('/api/')) return
    if (url.pathname.startsWith('/socket.io/')) return

    if (STATIC_ASSETS.includes(url.pathname) || STATIC_ASSETS.includes(e.request.url)) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                const network = fetch(e.request).then(res => {
                    caches.open(CACHE_STATIC).then(c => c.put(e.request, res.clone()))
                    return res
                }).catch(() => cached)

                return cached || network
            })
        )
        return
    }

    if (url.pathname.startsWith('/assets/')) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached
                return fetch(e.request).then(res => {
                    caches.open(CACHE_DYNAMIC).then(c => c.put(e.request, res.clone()))
                    return res
                })
            })
        )
        return
    }

    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    )
})

self.addEventListener('sync', (e) => {
    if (e.tag === 'sync-messages') {
        e.waitUntil(self.clients.matchAll().then(clients => {
            clients.forEach(c => c.postMessage({ type: 'sync-messages' }))
        }))
    }
})