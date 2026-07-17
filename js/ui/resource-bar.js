// 상단 자원 막대 — 엽전·옥구슬 잔액과 목표 버튼. 변화에 즉시 반응한다.

import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import { hasClaimable } from '../systems/quests.js';
import { openGoals } from './goals-modal.js';
import { fmt } from './format.js';
import { countUp, pulse } from './effects.js';

const COIN_ICON = `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <rect x="7.4" y="7.4" width="5.2" height="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/>
</svg>`;

const JADE_ICON = `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <path d="M10 2.2 L16.6 7 L14.2 15.4 L5.8 15.4 L3.4 7 Z"
        fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M10 2.2 L10 15.4 M3.4 7 L16.6 7" stroke="currentColor" stroke-width="0.9" opacity="0.55"/>
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
    </div>
    <button class="goals-btn" id="goals-btn" aria-label="목표">
      ${GOAL_ICON}<i class="goals-badge" id="goals-badge" hidden></i>
    </button>
  `;

  document.getElementById('goals-btn').addEventListener('click', openGoals);

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
