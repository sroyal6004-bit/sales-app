const CACHE = 'golf-notes-v3';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Firebase(실시간 동기화·사진 저장) 통신은 캐시하지 않고 네트워크로 통과
function isFirebase(url) {
  return url.includes('firestore.googleapis.com')
      || url.includes('firebasestorage.googleapis.com')
      || url.includes('firebasestorage.app')
      || url.includes('firebaseinstallations.googleapis.com')
      || url.includes('identitytoolkit.googleapis.com')
      || url.includes('firebase.googleapis.com')
      || url.includes('gstatic.com/firebasejs');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (isFirebase(req.url)) return;

  // HTML 문서는 네트워크 우선 → 새 버전이 바로 반영됨 (오프라인이면 캐시)
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 그 외 정적 파일은 캐시 우선
  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
