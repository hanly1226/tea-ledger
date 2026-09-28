'use strict';
// 中医养生茶饮工作台 · 轻量 Service Worker
// 策略：同源资源「网络优先、缓存兜底」——保证每次部署都拿到最新代码，
// 离线/弱网时仍可打开应用外壳（数据在恢复网络后自动同步）。
const CACHE = 'tcmws-shell-v2';
const ASSETS = [
  './', './index.html', './manifest.json', './icon.svg', './css/style.css',
  './js/lib/xlsx.full.min.js',
  './js/config.js', './js/data.js', './js/data_terms.js', './js/data_work.js',
  './js/data_products.js', './js/data_match.js', './js/data_hotspots.js',
  './js/core.js', './js/m_todo.js', './js/m_work.js', './js/m_wellness.js',
  './js/m_match.js', './js/m_products.js', './js/m_ledger.js', './js/m_schedule.js', './js/main.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 跨域请求（云端同步 textdb、天气 API）直接走网络，不缓存
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
