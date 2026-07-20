// 서비스워커 — 전체 에셋을 캐시해 비행기 모드에서도 완전히 플레이 가능하게 한다.
// 에셋이 바뀌면 CACHE 버전을 올린다.

const CACHE = 'samgukji-v102';

// 영웅 초상 — js/data/heroes.js의 id와 일치 (24명)
const HERO_IDS = [
  'lvbu', 'guanyu', 'caocao', 'zhugeliang',
  'zhangfei', 'zhaoyun', 'zhouyu', 'xiahoudun', 'sunce', 'dongzhuo',
  'zhangliao', 'ganning', 'liubei', 'sunshangxiang', 'yuanshao', 'xunyu',
  'huaxiong', 'zhoucang', 'caohong', 'handang',
  'jiling', 'liaohua', 'yujin', 'chengpu',
];

// 적 스프라이트 — stages.js의 foeArt/bossArt id와 일치
const ENEMY_IDS = [
  'yellow-turban', 'dong-soldier', 'warlord-soldier', 'yuan-soldier', 'wu-soldier', 'nanman-soldier', 'zhangjiao',
  'bandit-archer', 'halberdier', 'shield-brute', 'twin-blade', 'crossbowman', 'axe-raider', 'spear-guard', 'flag-bearer',
  'boss-general', 'boss-warlock',
];

// 배경 그림 — 장(章) 테마 (stages.js env와 일치). 반드시 IMAGE_ASSETS보다 먼저 선언
const BG_IDS = [
  'village-plain', 'fortress-gate', 'burning-city', 'river-shore', 'red-cliffs',
  'mountain-pass', 'palace-court', 'jungle', 'night-camp', 'gacha-sky',
  'arena-plain', 'arena-camp', 'arena-stone', 'arena-snow',
  'loading', // 로딩 화면 전장 배경 (Scenario 생성)
];

// 오디오 — ElevenLabs로 만든 정적 파일(있으면 재생, 없으면 합성음 폴백). best-effort 캐시.
// (audio-manifest.js의 id와 일치. 아직 생성 안 된 파일은 조용히 건너뛴다.)
const AUDIO_IDS = [
  'bgm-field', 'bgm-boss', 'bgm-title',
  'hit-armor', 'hit-cloth', 'hit-hide', 'hit-heavy', 'hit-blade', 'foe-strike',
  'clear', 'legend', 'epic', 'claim', 'chapter', 'rival', 'wipe',
];

// 이미지·오디오 — 하나쯤 빠져도 네트워크 폴백이 있으므로 best-effort로 담는다
// heroes = 카드용 원본(배경 포함), heroes-cut/enemies-cut = 전장용 누끼(배경 투명)
const IMAGE_ASSETS = [
  ...AUDIO_IDS.map((id) => `./assets/audio/${id}.mp3`),
  './assets/ui/title-art.png',
  './assets/ui/panel-frame.png',
  './assets/ui/summon-gate.png',
  './assets/ui/fx-slash.png',
  './assets/ui/fx-burst.png',
  ...BG_IDS.map((id) => `./assets/bg/${id}.png`),
  ...HERO_IDS.map((id) => `./assets/heroes/${id}.png`),
  ...HERO_IDS.map((id) => `./assets/heroes-cut/${id}.png`),
  ...HERO_IDS.map((id) => `./assets/heroes-atk-cut/${id}.png`),
  ...ENEMY_IDS.map((id) => `./assets/enemies-cut/${id}.png`),
  ...ENEMY_IDS.map((id) => `./assets/enemies-atk-cut/${id}.png`),
];

// 코어(HTML·CSS·JS) — 하나라도 빠지면 앱이 백지가 되므로 원자적으로 담는다
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './css/base.css',
  './css/screens.css',
  './css/effects.css',
  './js/main.js',
  './js/version.js',
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
  './js/systems/tower.js',
  './js/systems/shard.js',
  './js/systems/gear.js',
  './js/systems/defense.js',
  './js/systems/rd-meta.js',
  './js/data/balance.js',
  './js/data/defense.js',
  './js/data/heroes.js',
  './js/data/stages.js',
  './js/data/gacha-tables.js',
  './js/data/quests.js',
  './js/data/bonds.js',
  './js/data/rivals.js',
  './js/data/tales.js',
  './js/data/orders.js',
  './js/data/audio-manifest.js',
  './js/ui/format.js',
  './js/ui/audio.js',
  './js/ui/portrait.js',
  './js/ui/effects.js',
  './js/ui/modal.js',
  './js/ui/attendance-modal.js',
  './js/ui/tower-modal.js',
  './js/ui/title-screen.js',
  './js/ui/loading-screen.js',
  './js/ui/sound.js',
  './js/ui/goals-modal.js',
  './js/ui/tales-modal.js',
  './js/ui/resource-bar.js',
  './js/ui/tabs.js',
  './js/ui/battle-screen.js',
  './js/ui/defense-screen.js',
  './js/ui/heroes-screen.js',
  './js/ui/gacha-screen.js',
  './js/ui/collection-screen.js',
  './js/ui/settings-screen.js',
];

self.addEventListener('install', (event) => {
  // 코어는 addAll(원자적) — JS 하나만 빠져도 부팅이 통째로 죽어 "메뉴가 사라진" 것처럼 보인다.
  // 코어 설치가 실패하면 이 버전 설치 자체를 무산시켜, 이전의 온전한 캐시를 그대로 쓴다.
  // 이미지는 파일별 best-effort — 빠져도 네트워크 폴백으로 그때그때 채워진다.
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(ASSETS);
      await Promise.all(
        IMAGE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('이미지 캐시 실패(건너뜀):', url, err))
        )
      );
      return self.skipWaiting();
    })
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
