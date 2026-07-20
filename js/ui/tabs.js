// 하단 바 — 방어 · 소환 · 합성 · 반환 · 도박 · 설정
// 탭(방어/설정)은 화면 전환, 액션(소환/합성/반환/도박)은 이벤트를 쏴 defense-screen이 처리한다.

import * as defenseScreen from './defense-screen.js';
import * as settingsScreen from './settings-screen.js';
import { vibrate } from './sound.js';
import { on, emit } from '../core/events.js';

const ICONS = {
  battle: `<svg viewBox="0 0 24 24"><path d="M5 19 L15.5 6.5 M19 19 L8.5 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M4 16.5 L7.5 20 M20 16.5 L16.5 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>`,
  summon: `<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 9h5M9.5 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  upgrade: `<svg viewBox="0 0 24 24"><path d="M12 4l6 7h-3.6v7h-4.8v-7H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  merge: `<svg viewBox="0 0 24 24"><path d="M5 5l6 6M19 5l-6 6M12 11v7.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.5" fill="currentColor"/></svg>`,
  refund: `<svg viewBox="0 0 24 24"><circle cx="13.5" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 12H3M5.4 9.6 3 12l2.4 2.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  gamble: `<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9.5" cy="9.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="14.5" cy="14.5" r="1.1" fill="currentColor"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.6 V6 M12 18 V20.4 M3.6 12 H6 M18 12 H20.4 M6.2 6.2 L7.9 7.9 M16.1 16.1 L17.8 17.8 M17.8 6.2 L16.1 7.9 M7.9 16.1 L6.2 17.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
};

// kind:'tab' = 화면 전환 / kind:'act' = 방어 화면 액션(이벤트). id는 액션 버튼 갱신(넛지·배지)용.
const NAV = [
  { id: 'battle', label: '방어', kind: 'tab', screen: defenseScreen },
  { id: 'summon', label: '소환', kind: 'act', event: 'rd:summon' },
  { id: 'upgrade', label: '단련', kind: 'act', event: 'rd:upgrade' },
  { id: 'merge', label: '합성', kind: 'act', event: 'rd:merge' },
  { id: 'refund', label: '반환', kind: 'act', event: 'rd:refund' },
  { id: 'gamble', label: '도박', kind: 'act', event: 'rd:gamble' },
  { id: 'settings', label: '설정', kind: 'tab', screen: settingsScreen },
];
const TABS = NAV.filter((n) => n.kind === 'tab');

let active = null;
let navRootRef = null;
let screenRootRef = null;

// 방어 화면이 언마운트된 상태(설정 탭 등)에서 액션이 오면 먼저 방어 탭을 되살린다.
on('nav:battle', () => {
  if (navRootRef && screenRootRef) switchTo('battle', navRootRef, screenRootRef, { push: false });
});

export function renderTabs(navRoot, screenRoot) {
  navRootRef = navRoot;
  screenRootRef = screenRoot;
  navRoot.innerHTML = NAV.map((n) =>
    n.kind === 'tab'
      ? `<button class="tab" data-tab="${n.id}" aria-label="${n.label}">${ICONS[n.id]}<span>${n.label}</span><i class="tab-dot" hidden></i></button>`
      : `<button class="tab act" data-act="${n.event}" id="rd-nav-${n.id}" aria-label="${n.label}">${ICONS[n.id]}<span>${n.label}</span><i class="nav-badge" hidden></i></button>`
  ).join('');

  navRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    vibrate(8);
    if (btn.dataset.tab) switchTo(btn.dataset.tab, navRoot, screenRoot, { push: true });
    else if (btn.dataset.act) emit(btn.dataset.act); // 소환/합성/반환/도박 — defense-screen이 받는다
  });

  // 폰 뒤로가기 = 이전 탭으로. 단, 모달이 떠 있으면 모달 닫기 몫이라 탭을 건드리지 않는다.
  window.addEventListener('popstate', () => {
    if (document.getElementById('modal-root')?.hasChildNodes()) return;
    const id = location.hash.slice(1);
    if (TABS.some((t) => t.id === id)) switchTo(id, navRoot, screenRoot, { push: false });
  });

  const fromHash = location.hash.slice(1);
  switchTo(TABS.some((t) => t.id === fromHash) ? fromHash : 'battle', navRoot, screenRoot, { push: false });
}

/** push=true(탭 버튼)는 히스토리에 쌓고, push=false(첫 진입·뒤로가기)는 쌓지 않는다 */
export function switchTo(id, navRoot, screenRoot, { push = true } = {}) {
  const tab = TABS.find((t) => t.id === id);
  if (!tab || active === id) return;

  const fromIdx = TABS.findIndex((t) => t.id === active);
  const toIdx = TABS.findIndex((t) => t.id === id);
  screenRoot.classList.remove('from-left', 'from-right');
  if (fromIdx !== -1) screenRoot.classList.add(toIdx > fromIdx ? 'from-right' : 'from-left');

  const prev = TABS.find((t) => t.id === active);
  if (prev && prev.screen.destroy) prev.screen.destroy();

  active = id;
  for (const btn of navRoot.querySelectorAll('.tab')) {
    btn.classList.toggle('active', btn.dataset.tab === id);
  }
  screenRoot.innerHTML = '';
  screenRoot.scrollTop = 0;
  tab.screen.render(screenRoot);
  if (push) history.pushState(null, '', `#${id}`);
  else history.replaceState(null, '', `#${id}`);
}
