// 하단 액션 바 — 소환 · 단련 · 합성 · 반환 · 도박 (탭 전환 없음: 방어 화면은 항상 고정 마운트).
// 설정은 전투 화면 상단의 톱니 버튼(rd-gear)이 'nav:settings'로 오버레이를 연다.

import * as defenseScreen from './defense-screen.js';
import * as settingsScreen from './settings-screen.js';
import { vibrate } from './sound.js';
import { on, emit } from '../core/events.js';

const ICONS = {
  summon: `<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 9h5M9.5 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  upgrade: `<svg viewBox="0 0 24 24"><path d="M12 4l6 7h-3.6v7h-4.8v-7H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  merge: `<svg viewBox="0 0 24 24"><path d="M5 5l6 6M19 5l-6 6M12 11v7.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.5" fill="currentColor"/></svg>`,
  refund: `<svg viewBox="0 0 24 24"><circle cx="13.5" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 12H3M5.4 9.6 3 12l2.4 2.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  gamble: `<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9.5" cy="9.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="14.5" cy="14.5" r="1.1" fill="currentColor"/></svg>`,
};

const ACTIONS = [
  { id: 'summon', label: '소환', event: 'rd:summon' },
  { id: 'upgrade', label: '단련', event: 'rd:upgrade' },
  { id: 'merge', label: '합성', event: 'rd:merge' },
  { id: 'refund', label: '반환', event: 'rd:refund' },
  { id: 'gamble', label: '도박', event: 'rd:gamble' },
];

export function renderTabs(navRoot, screenRoot) {
  navRoot.innerHTML = ACTIONS.map((a) =>
    `<button class="tab act" data-act="${a.event}" id="rd-nav-${a.id}" aria-label="${a.label}">${ICONS[a.id]}<span>${a.label}</span><i class="nav-badge" hidden></i></button>`
  ).join('');

  navRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    vibrate(8);
    emit(btn.dataset.act);
  });

  // 방어(전투) 화면은 탭 전환 없이 항상 이 자리에 고정 마운트
  screenRoot.innerHTML = '';
  defenseScreen.render(screenRoot);
}

// 설정 — 전투 상단 톱니 버튼이 여는 작은 오버레이(방어 화면 위에 뜬다)
on('nav:settings', () => {
  if (document.getElementById('settings-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'settings-overlay';
  ov.className = 'settings-overlay';
  ov.innerHTML = `<div class="so-panel"><button class="so-close" aria-label="닫기">✕</button><div class="so-body"></div></div>`;
  document.body.appendChild(ov);
  settingsScreen.render(ov.querySelector('.so-body'));
  const close = () => ov.remove();
  ov.querySelector('.so-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
});

// 하위호환 — 예전 코드가 nav:battle을 쏴도 방어 화면은 이미 고정이라 무시(안전)
on('nav:battle', () => {});
