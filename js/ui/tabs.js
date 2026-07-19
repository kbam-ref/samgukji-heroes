// 하단 탭 — 전투 · 영웅 · 모집 · 도감 · 설정

import * as defenseScreen from './defense-screen.js';
import * as settingsScreen from './settings-screen.js';
import { vibrate } from './sound.js';

const ICONS = {
  battle: `<svg viewBox="0 0 24 24"><path d="M5 19 L15.5 6.5 M19 19 L8.5 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M4 16.5 L7.5 20 M20 16.5 L16.5 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>`,
  heroes: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 20 C6.2 15.6 9 14 12 14 C15 14 17.8 15.6 19 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  gacha: `<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="12" height="15" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 8.6 C4.6 8.6 4.6 4.5 6 4.5 M18 15.4 C19.4 15.4 19.4 19.5 18 19.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.4 10 h5.2 M9.4 13.6 h5.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  codex: `<svg viewBox="0 0 24 24"><path d="M12 6 C10 4.6 7 4.4 4.5 5.2 L4.5 18.4 C7 17.6 10 17.8 12 19.2 C14 17.8 17 17.6 19.5 18.4 L19.5 5.2 C17 4.4 14 4.6 12 6 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6 V19.2" stroke="currentColor" stroke-width="1.4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.6 V6 M12 18 V20.4 M3.6 12 H6 M18 12 H20.4 M6.2 6.2 L7.9 7.9 M16.1 16.1 L17.8 17.8 M17.8 6.2 L16.1 7.9 M7.9 16.1 L6.2 17.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
};

const TABS = [
  { id: 'battle', label: '방어', screen: defenseScreen },
  { id: 'settings', label: '설정', screen: settingsScreen },
];

let active = null;

export function renderTabs(navRoot, screenRoot) {
  navRoot.innerHTML = TABS.map(
    (t) => `
    <button class="tab" data-tab="${t.id}" aria-label="${t.label}">
      ${ICONS[t.id]}<span>${t.label}</span><i class="tab-dot" hidden></i>
    </button>`
  ).join('');

  navRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) {
      vibrate(8);
      switchTo(btn.dataset.tab, navRoot, screenRoot, { push: true });
    }
  });

  // 폰 뒤로가기 = 이전 탭으로 (앱이 바로 꺼지지 않게).
  // 단, 모달이 떠 있으면 뒤로가기는 모달 닫기 몫이다 — 탭을 건드리지 않는다 (1-8)
  window.addEventListener('popstate', () => {
    if (document.getElementById('modal-root')?.hasChildNodes()) return;
    const id = location.hash.slice(1);
    if (TABS.some((t) => t.id === id)) switchTo(id, navRoot, screenRoot, { push: false });
  });

  // 주소의 #탭이름으로 바로 열 수 있다 (예: #heroes)
  const fromHash = location.hash.slice(1);
  switchTo(TABS.some((t) => t.id === fromHash) ? fromHash : 'battle', navRoot, screenRoot, { push: false });
}

/** push=true(탭 버튼)는 히스토리에 쌓아 뒤로가기로 되돌아올 수 있게 하고,
 *  push=false(첫 진입·뒤로가기 자체)는 쌓지 않는다 */
export function switchTo(id, navRoot, screenRoot, { push = true } = {}) {
  const tab = TABS.find((t) => t.id === id);
  if (!tab || active === id) return;

  // 이동 방향대로 화면이 밀려 들어온다 — 오른쪽 탭이면 오른쪽에서
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
  // 도감·영웅 금점 — 들어가 보면 꺼진다. 모집 금점은 무료 모집 로직이 관리.
  // (재평가 소등은 main.js의 refresh 함수가 하고, 여기선 진입 즉시 끈다)
  if (id === 'codex' || id === 'heroes') {
    const dot = navRoot.querySelector(`.tab[data-tab="${id}"] .tab-dot`);
    if (dot) dot.hidden = true;
  }
  screenRoot.innerHTML = '';
  screenRoot.scrollTop = 0;
  tab.screen.render(screenRoot);
  if (push) history.pushState(null, '', `#${id}`);
  else history.replaceState(null, '', `#${id}`);
}
