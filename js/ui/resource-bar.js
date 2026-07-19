// 상단 자원 막대 — 메타 재화(옥구슬) 잔액. 랜덤 디펜스 전환으로 엽전·목표는 제거(v62).
// 옥구슬 = 티켓 충전·영구 성장에 쓰는 메타 화폐. 인런 재화(골드)는 방어 화면 HUD에 따로.

import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import { fmt } from './format.js';
import { countUp, pulse } from './effects.js';

const JADE_ICON = `
<svg viewBox="0 0 20 20" aria-hidden="true">
  <defs><radialGradient id="g-jade" cx="35%" cy="26%" r="88%">
    <stop offset="0%" stop-color="#d8f0dc"/><stop offset="45%" stop-color="#7fbf8e"/><stop offset="100%" stop-color="#2e6644"/>
  </radialGradient></defs>
  <circle cx="10" cy="10.4" r="7.9" fill="url(#g-jade)" stroke="#1f4a30" stroke-width="0.8"/>
  <ellipse cx="7.3" cy="6.9" rx="2.7" ry="1.6" fill="rgba(255,255,255,0.45)"/>
</svg>`;

let shown = { jade: 0 };

export function renderResourceBar(root) {
  const s = getState();
  shown = { jade: s.resources.jade };

  root.innerHTML = `
    <div class="resource jade" id="res-jade">
      ${JADE_ICON}<b>${fmt(shown.jade)}</b><span class="res-label">옥구슬</span>
    </div>
  `;

  on('jade', ({ total }) => update('jade', total));
}

function update(kind, total) {
  const box = document.getElementById(`res-${kind}`);
  if (!box) return;
  const num = box.querySelector('b');
  countUp(num, shown[kind], total, { duration: 400, format: fmt });
  pulse(box);
  shown[kind] = total;
}
