// 서비스워커 — 전체 에셋을 캐시해 비행기 모드에서도 완전히 플레이 가능하게 한다.
// 에셋이 바뀌면 CACHE 버전을 올린다.

const CACHE = 'samgukji-v14';

// 영웅 초상 — js/data/heroes.js의 id와 일치 (24명)
const HERO_IDS = [
  'lvbu', 'guanyu', 'caocao', 'zhugeliang',
  'zhangfei', 'zhaoyun', 'zhouyu', 'xiahoudun', 'sunce', 'dongzhuo',
  'zhangliao', 'ganning', 'liubei', 'sunshangxiang', 'yuanshao', 'xunyu',
  'huaxiong', 'zhoucang', 'caohong', 'handang',
  'jiling', 'liaohua', 'yujin', 'chengpu',
];

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  ...HERO_IDS.map((id) => `./assets/heroes/${id}.png`),
  './css/base.css',
  './css/screens.css',
  './css/effects.css',
  './js/main.js',
  './js/core/events.js',
  './js/core/state.js',
  './js/core/save.js',
  './js/core/loop.js',
  './js/systems/growth.js',
  './js/systems/upgrades.js',
  './js/systems/hero-unit.js',
  './js/systems/enemy-unit.js',
  './js/systems/battle.js',
  './js/systems/gacha.js',
  './js/systems/offline.js',
  './js/systems/quests.js',
  './js/systems/tales.js',
  './js/systems/orders.js',
  './js/data/balance.js',
  './js/data/heroes.js',
  './js/data/stages.js',
  './js/data/gacha-tables.js',
  './js/data/quests.js',
  './js/data/bonds.js',
  './js/data/rivals.js',
  './js/data/tales.js',
  './js/data/orders.js',
  './js/ui/format.js',
  './js/ui/portrait.js',
  './js/ui/effects.js',
  './js/ui/modal.js',
  './js/ui/sound.js',
  './js/ui/goals-modal.js',
  './js/ui/tales-modal.js',
  './js/ui/resource-bar.js',
  './js/ui/tabs.js',
  './js/ui/battle-screen.js',
  './js/ui/heroes-screen.js',
  './js/ui/gacha-screen.js',
  './js/ui/collection-screen.js',
  './js/ui/settings-screen.js',
];

self.addEventListener('install', (event) => {
  // addAll은 원자적이라 파일 하나만 실패해도 설치 전체가 무산된다 —
  // 파일별로 시도하고, 실패는 기록만 하고 계속 간다 (오프라인 전면 불능 방지)
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          ASSETS.map((url) =>
            cache.add(url).catch((err) => console.warn('캐시 실패(건너뜀):', url, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          return res;
        })
    )
  );
});
