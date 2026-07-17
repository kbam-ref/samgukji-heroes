// 진입점 — 세이브 불러오기 → 복귀 보상 → 화면 구성 → 게임 루프 시작

import { loadOrCreate, persist } from './core/save.js';
import { initState, getState, addCoin } from './core/state.js';
import { on } from './core/events.js';
import { startLoop } from './core/loop.js';
import * as battle from './systems/battle.js';
import { computeOfflineGain } from './systems/offline.js';
import { renderResourceBar } from './ui/resource-bar.js';
import { renderTabs } from './ui/tabs.js';
import { showModal } from './ui/modal.js';
import { fmt, formatDuration } from './ui/format.js';
import { countUp } from './ui/effects.js';
import { initSound, play, vibrate } from './ui/sound.js';

const AUTOSAVE_MS = 10000;

// 아직 거두지 않은 복귀 보상 — 새 보상이 오면 합산해 다시 보여준다.
// (모달이 새 모달로 덮여도 보상이 증발하지 않게)
let pendingGain = null;

function showOfflineReward(gain) {
  pendingGain = pendingGain
    ? { coins: pendingGain.coins + gain.coins, seconds: pendingGain.seconds + gain.seconds }
    : { coins: gain.coins, seconds: gain.seconds };

  const estKills = Math.floor(battle.killRatePerSecond(getState()) * pendingGain.seconds * 0.6);
  const body = document.createElement('div');
  body.className = 'offline-body';
  body.innerHTML = `
    <p>자리를 비운 <b>${formatDuration(pendingGain.seconds)}</b> 동안<br>병사들이 약 <b>${fmt(estKills)}</b>명을 무찔렀어요.</p>
    <div class="offline-coins"><b id="offline-count">0</b><span>엽전</span></div>
    <p class="offline-sub">영웅 탭에서 단련에 쓰면 좋아요</p>`;

  showModal({
    title: '다녀오셨군요, 주군',
    body,
    dismissible: false,
    actions: [
      {
        label: '거두기',
        primary: true,
        onClick: () => {
          if (!pendingGain) return;
          addCoin(pendingGain.coins);
          pendingGain = null;
        },
      },
    ],
  });

  countUp(document.getElementById('offline-count'), 0, pendingGain.coins, {
    duration: 1200,
    format: fmt,
  });
}

function boot() {
  const save = loadOrCreate();
  const awaySeconds = (Date.now() - save.lastSeenAt) / 1000;
  initState(save);

  renderResourceBar(document.getElementById('resource-bar'));
  renderTabs(document.getElementById('tab-bar'), document.getElementById('screen-root'));

  const gain = computeOfflineGain(save, awaySeconds);
  if (gain) showOfflineReward(gain);

  const loop = startLoop((dt) => battle.tick(dt));

  // 주기 저장 — 탭이 숨겨져 있는 동안엔 lastSeenAt을 전진시키지 않는다
  // (전진시키면 백그라운드에서 죽었을 때 방치 보상이 통째로 사라진다)
  setInterval(() => persist(getState(), { seen: !document.hidden }), AUTOSAVE_MS);

  // 굵직한 사건 직후엔 즉시 저장 (주기 저장과 별개)
  on('upgrade:atk', () => persist(getState()));
  on('stage:clear', () => persist(getState()));
  on('quest:claim', () => persist(getState()));

  // 소리와 떨림 — 설정에서 끌 수 있다
  initSound();
  on('battle:death', () => play('kill'));
  on('battle:wipe', () => play('wipe'));
  on('stage:clear', () => {
    play('clear');
    vibrate(30);
  });

  // 탭을 벗어났다 돌아오면 그 시간만큼 복귀 보상
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      persist(getState()); // 숨기는 순간까지는 '본 시간'
    } else {
      if (hiddenAt) {
        const away = (Date.now() - hiddenAt) / 1000;
        hiddenAt = 0;
        const g = computeOfflineGain(getState(), away);
        if (g) showOfflineReward(g);
      }
      loop.resetClock(); // 같은 시간이 루프에서 한 번 더 계산되지 않게
    }
  });
  window.addEventListener('pagehide', () => persist(getState(), { seen: !document.hidden }));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 로컬 file:// 등에서는 조용히 넘어간다 */
    });
  }
}

boot();
