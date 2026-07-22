// 하단 액션 바 — 소환 · 단련 · 합성 · 반환 · 도박 (탭 전환 없음: 방어 화면은 항상 고정 마운트).
// 설정은 전투 화면 상단의 톱니 버튼(rd-gear)이 'nav:settings'로 오버레이를 연다.

import * as defenseScreen from './defense-screen.js';
import * as settingsScreen from './settings-screen.js';
import { vibrate } from './sound.js';
import { on, emit } from '../core/events.js';

// 액션 아이콘 — 각 기능이 한눈에 읽히게 재도안(2026-07-22 수석). currentColor 라인아트 + 포인트 채움.
const ICONS = {
  // 소환 — 빛나는 별(가챠 소환 연출)
  summon: `<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.7L20 10l-6.1 1.3L12 21l-1.9-9.7L4 10l6.1-1.3z" fill="currentColor"/><circle cx="18.6" cy="5.4" r="1.05" fill="currentColor"/><circle cx="5.4" cy="16.5" r="0.9" fill="currentColor"/></svg>`,
  // 단련 — 강화(위로 겹친 이중 화살표)
  upgrade: `<svg viewBox="0 0 24 24"><path d="M6 12.5l6-6 6 6M6 18l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // 합성 — 두 갈래가 모여 상위 별 1개로
  merge: `<svg viewBox="0 0 24 24"><path d="M6 4.5l3.6 5.2M18 4.5l-3.6 5.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 9.5l1.5 3.5 3.8.3-2.9 2.5.9 3.7L12 21l-3.3 1.5.9-3.7-2.9-2.5 3.8-.3z" fill="currentColor"/></svg>`,
  // 반환 — 되돌림 화살표 + 금화
  refund: `<svg viewBox="0 0 24 24"><path d="M6.4 9.2a6 6 0 1 1-1.1 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.6 4.8v4.4h4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13.2" cy="12.6" r="2.15" fill="currentColor"/></svg>`,
  // 행운 — 모서리 둥근 주사위 두 개
  gamble: `<svg viewBox="0 0 24 24"><rect x="3.4" y="9" width="9.6" height="9.6" rx="2.7" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.1" cy="11.7" r="0.95" fill="currentColor"/><circle cx="10.3" cy="15.9" r="0.95" fill="currentColor"/><circle cx="8.2" cy="13.8" r="0.95" fill="currentColor"/><rect x="12" y="4" width="8.6" height="8.6" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(14 16.3 8.3)"/><circle cx="14.7" cy="7.2" r="0.85" fill="currentColor"/><circle cx="17.6" cy="9.1" r="0.85" fill="currentColor"/></svg>`,
};

const ACTIONS = [
  { id: 'summon', label: '소환', event: 'rd:summon' },
  { id: 'upgrade', label: '단련', event: 'rd:upgrade' },
  { id: 'merge', label: '합성', event: 'rd:merge' },
  { id: 'refund', label: '반환', event: 'rd:refund' },
  { id: 'gamble', label: '행운', event: 'rd:gamble' },
];

export function renderTabs(navRoot, screenRoot) {
  navRoot.innerHTML = ACTIONS.map((a) =>
    `<button class="tab act" data-act="${a.event}" id="rd-nav-${a.id}" aria-label="${a.label}">${ICONS[a.id]}<span>${a.label}</span><i class="nav-badge" hidden></i></button>`
  ).join('');

  navRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    if (btn.id === 'rd-nav-summon') return; // 소환은 아래 pointer-hold로 처리(원클릭+꾹 연속). 중복 방지
    vibrate(8);
    emit(btn.dataset.act);
  });

  // 소환 — 누르면 바로 1회, 꾹 누르면 연속(시트 없이)
  let holdT = null, holdInt = null;
  const stopHold = () => { if (holdT) clearTimeout(holdT); if (holdInt) clearInterval(holdInt); holdT = holdInt = null; };
  navRoot.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn || btn.id !== 'rd-nav-summon') return;
    stopHold(); // 감사: 이전 홀드 정리 후 시작 — 멀티터치/재진입 시 setInterval 고아화(무한 자동소환) 방지
    vibrate(8); emit('rd:summon');
    holdT = setTimeout(() => { holdInt = setInterval(() => emit('rd:summon'), 170); }, 380);
  });
  navRoot.addEventListener('pointerup', stopHold);
  navRoot.addEventListener('pointerleave', stopHold);
  navRoot.addEventListener('pointercancel', stopHold);

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
  (document.getElementById('viewport') || document.body).appendChild(ov); // v121: 강제 가로 회전 대상 안으로
  emit('rd:pause'); // 설정 열림 — 전투 일시중지(수석)
  settingsScreen.render(ov.querySelector('.so-body'));
  const close = () => { ov.remove(); emit('rd:resume'); };
  ov.querySelector('.so-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
});

// 하위호환 — 예전 코드가 nav:battle을 쏴도 방어 화면은 이미 고정이라 무시(안전)
on('nav:battle', () => {});
