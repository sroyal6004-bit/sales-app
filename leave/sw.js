// 휴무 스케쥴 PWA 서비스워커
// 규칙: HTML 문서는 네트워크 우선(새 버전 즉시 반영), 정적 파일은 캐시 우선.
const CACHE = 'leave-pwa-__BUILD_ID__';
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
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  // Firebase / 외부 실시간 통신은 서비스워커가 절대 가로채지 않음
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebaseio.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com') ||
      url.includes('firebaseinstallations') ) {
    return;
  }

  // HTML 문서(네비게이션)는 네트워크 우선 → 배포 즉시 최신 화면
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 그 외 정적 자원은 캐시 우선
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).catch(() => cached))
  );
});
