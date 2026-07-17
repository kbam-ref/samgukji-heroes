// 하단 탭 — 전투 · 영웅 · 모집 · 도감 · 설정

import * as battleScreen from './battle-screen.js';
import * as heroesScreen from './heroes-screen.js';
import * as gachaScreen from './gacha-screen.js';
import * as collectionScreen from './collection-screen.js';
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
  { id: 'battle', label: '전투', screen: battleScreen },
  { id: 'heroes', label: '영웅', screen: heroesScreen },
  { id: 'gacha', label: '모집', screen: gachaScreen },
  { id: 'codex', label: '도감', screen: collectionScreen },
  { id: 'settings', label: '설정', screen: settingsScreen },
];

let active = null;

export function renderTabs(navRoot, screenRoot) {
  navRoot.innerHTML = TABS.map(
    (t) => `
    <button class="tab" data-tab="${t.id}" aria-label="${t.label}">
      ${ICONS[t.id]}<span>${t.label}</span>
    </button>`
  ).join('');

  navRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) {
      vibrate(8);
      switchTo(btn.dataset.tab, navRoot, screenRoot);
    }
  });

  // 주소의 #탭이름으로 바로 열 수 있다 (예: #heroes)
  const fromHash = location.hash.slice(1);
  switchTo(TABS.some((t) => t.id === fromHash) ? fromHash : 'battle', navRoot, screenRoot);
}

export function switchTo(id, navRoot, screenRoot) {
  const tab = TABS.find((t) => t.id === id);
  if (!tab || active === id) return;

  const prev = TABS.find((t) => t.id === active);
  if (prev && prev.screen.destroy) prev.screen.destroy();

  active = id;
  for (const btn of navRoot.querySelectorAll('.tab')) {
    btn.classList.toggle('active', btn.dataset.tab === id);
  }
  screenRoot.innerHTML = '';
  screenRoot.scrollTop = 0;
  tab.screen.render(screenRoot);
  history.replaceState(null, '', `#${id}`);
}
