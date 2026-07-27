const CACHE = 'golf-notes-v2';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Firebase(실시간 동기화) 통신은 캐시하지 않고 항상 네트워크로 통과시킨다
function isFirebase(url) {
  return url.includes('firestore.googleapis.com')
      || url.includes('firebaseinstallations.googleapis.com')
      || url.includes('identitytoolkit.googleapis.com')
      || url.includes('firebase.googleapis.com')
      || url.includes('gstatic.com/firebasejs');
}

// 오프라인 우선(캐시 우선, 네트워크 폴백) — 앱은 로컬에서도 완전히 동작
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (isFirebase(e.request.url)) return;   // 동기화 요청은 SW가 건드리지 않음
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
