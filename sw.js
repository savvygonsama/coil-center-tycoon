/* 서비스 워커 — 한 번 열어두면 비행기 안에서도 돌아간다.
   그림이 index.html 안에 전부 박혀 있어서 캐시할 파일이 몇 개 안 된다.

   CACHE 이름의 숫자를 올리면 예전 캐시를 통째로 버리고 새로 받는다.
   index.html을 새로 배포할 때마다 올려야 사람들 화면이 갱신된다. */
const CACHE = 'coilcenter-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  // 새 버전이 오면 기다리지 않고 바로 올라탄다
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* 네트워크 우선, 실패하면 캐시.
   배포가 잦은 게임이라 캐시 우선으로 두면 사람들이 옛날 판을 붙잡고 있게 된다.
   대신 오프라인일 때는 캐시가 받아준다. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;   // 폰트 CDN 등은 브라우저에 맡긴다
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await caches.match(req);
      return hit || caches.match('./index.html');
    }
  })());
});
