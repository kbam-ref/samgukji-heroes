// 상단 자원 막대 — 엽전·옥구슬 잔액과 목표 버튼. 변화에 즉시 반응한다.

import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import { hasClaimable } from '../systems/quests.js';
import { openGoals } from './goals-modal.js';
import { fmt } from './format.js';
import { countUp, pulse } from './effects.js';

// 금속 재질 아이콘 — "게임 화폐"로 보이게 (감사 처방 #2)
const COIN_ICON = `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <defs><radialGradient id="g-coin" cx="35%" cy="28%" r="85%">
    <stop offset="0%" stop-color="#f5e08a"/><stop offset="55%" stop-color="#d4af37"/><stop offset="100%" stop-color="#8a6d16"/>
  </radialGradient></defs>
  <circle cx="10" cy="10" r="8.6" fill="url(#g-coin)" stroke="#5f4a10" stroke-width="0.8"/>
  <rect x="7.3" y="7.3" width="5.4" height="5.4" rx="0.6" fill="#171310"/>
  <circle cx="10" cy="10" r="6.9" fill="none" stroke="rgba(255,244,200,0.35)" stroke-width="0.7"/>
</svg>`;

const JADE_ICON = `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <defs><radialGradient id="g-jade" cx="35%" cy="26%" r="88%">
    <stop offset="0%" stop-color="#d8f0dc"/><stop offset="45%" stop-color="#7fbf8e"/><stop offset="100%" stop-color="#2e6644"/>
  </radialGradient></defs>
  <circle cx="10" cy="10.4" r="7.9" fill="url(#g-jade)" stroke="#1f4a30" stroke-width="0.8"/>
  <ellipse cx="7.3" cy="6.9" rx="2.7" ry="1.6" fill="rgba(255,255,255,0.45)"/>
</svg>`;

const GOAL_ICON = `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <path d="M5.5 2.5 V17.5 M5.5 3.5 H14.5 L12 7 L14.5 10.5 H5.5"
        fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

let shown = { coin: 0, jade: 0 };

export function renderResourceBar(root) {
  const s = getState();
  shown = { coin: s.resources.coin, jade: s.resources.jade };

  root.innerHTML = `
    <div class="resource coin" id="res-coin">
      ${COIN_ICON}<b>${fmt(shown.coin)}</b><span class="res-label">엽전</span>
    </div>
    <div class="resource jade" id="res-jade">
      ${JADE_ICON}<b>${fmt(shown.jade)}</b><span class="res-label">옥구슬</span>
      <button class="res-plus" id="res-plus" aria-label="옥구슬 얻으러 가기">＋</button>
    </div>
    <button class="goals-btn" id="goals-btn" aria-label="목표">
      ${GOAL_ICON}<i class="goals-badge" id="goals-badge" hidden></i>
    </button>
  `;

  document.getElementById('goals-btn').addEventListener('click', openGoals);
  // ＋ → 모집 탭으로 — "재화가 모자라면 여기서 얻는다"는 길 안내
  document.getElementById('res-plus').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="gacha"]')?.click();
  });

  const refreshBadge = () => {
    const badge = document.getElementById('goals-badge');
    if (badge) badge.hidden = !hasClaimable();
  };
  refreshBadge();

  on('coin', ({ total }) => update('coin', total));
  on('jade', ({ total }) => update('jade', total));
  for (const type of ['stats:kill', 'stage:clear', 'gacha:pity', 'hero:add', 'quest:claim']) {
    on(type, refreshBadge);
  }
}

function update(kind, total) {
  const box = document.getElementById(`res-${kind}`);
  if (!box) return;
  const num = box.querySelector('b');
  countUp(num, shown[kind], total, { duration: 400, format: fmt });
  pulse(box);
  shown[kind] = total;
}
