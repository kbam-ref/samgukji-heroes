// 도감 화면 — 세력별 수집 현황. 못 얻은 장수는 실루엣으로 갈증을 만든다.

import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import { HEROES, RARITY, FACTIONS } from '../data/heroes.js';
import { GACHA_RATES } from '../data/gacha-tables.js';
import { BALANCE } from '../data/balance.js';
import { collectionBonus } from '../systems/growth.js';
import { taleList } from '../systems/tales.js';
import { openTale } from './tales-modal.js';
import { showModal } from './modal.js';
import { fmt } from './format.js';
import { portraitHtml } from './portrait.js';

let unsubs = [];

function cardHtml(hero, owned, s, index = 0) {
  const stagger = `style="--i:${Math.min(index, 8)}"`;
  if (!owned) {
    // 실루엣 — 진짜 초상을 검게 가려 "저게 누구지" 갈증을 만든다
    return `
    <div class="codex-card locked" data-id="${hero.id}" ${stagger}>
      ${portraitHtml(hero.id, 'codex-portrait silhouette')}
      <span class="codex-q" aria-hidden="true">?</span>
      <b class="codex-name">${hero.name}</b>
      <em class="codex-rarity r${hero.rarity}">${RARITY[hero.rarity].name}</em>
    </div>`;
  }
  const rivalKills = s?.rivalKills?.[hero.id] ?? 0;
  return `
  <div class="codex-card f-${hero.faction} r${hero.rarity}" data-id="${hero.id}" data-owned="1" ${stagger}>
    <span class="codex-flag f-${hero.faction}">${hero.name}</span>
    ${portraitHtml(hero.id, `codex-portrait frame-r${hero.rarity}`)}
    <b class="codex-name">${hero.name}</b>
    <span class="codex-title">${hero.title}</span>
    ${rivalKills > 0 ? `<span class="codex-rival">숙적 격파 ${rivalKills}</span>` : ''}
    <em class="codex-rarity r${hero.rarity}">${RARITY[hero.rarity].name}</em>
  </div>`;
}

function talesHtml(s) {
  const nameOf = (id) => HEROES.find((h) => h.id === id)?.name ?? id;
  const rewardNote = `첫 열람: 옥구슬 ${fmt(BALANCE.tales.jade)} ‧ 인연 +${Math.round(BALANCE.tales.bondBonusAdd * 100)}%p`;
  return taleList(s)
    .map((entry) => {
      const missing = entry.bond.heroes.filter((id) => !s.heroes[id]);
      const have = entry.bond.heroes.length - missing.length;
      const need = entry.bond.heroes.length;
      // 잠긴 열전: 한 명만 남았으면 그 이름을 금빛으로 강조해 '조금만 더'를 만든다 (3-5)
      const status = entry.read
        ? '<span class="q-done">읽음</span>'
        : entry.unlocked
          ? `<button class="btn primary tale-open" data-tale="${entry.tale.id}">읽기</button>`
          : missing.length === 1
            ? `<span class="q-progress almost">《${nameOf(missing[0])}》만 남음</span>`
            : `<span class="q-progress">${have} / ${need} 모음</span>`;
      return `
      <li class="q-row${entry.read ? ' claimed' : ''}">
        <div class="q-info">
          <b>${entry.tale.title}</b>
          <span class="q-blurb">${entry.bond.name} — ${entry.bond.heroes.map(nameOf).join(' ‧ ')}</span>
          ${entry.read ? '' : `<span class="q-reward">${rewardNote}</span>`}
        </div>
        ${status}
      </li>`;
    })
    .join('');
}

function bodyHtml(s) {
  const ownedCount = Object.keys(s.heroes).length;
  const bonusPct = Math.round(collectionBonus(s) * 100);

  const setPct = Math.round(BALANCE.growth.factionSetBonus * 100);
  const groups = Object.entries(FACTIONS)
    .map(([fid, f]) => {
      const members = HEROES.filter((h) => h.faction === fid);
      const ownedHere = members.filter((h) => s.heroes[h.id]).length;
      const complete = ownedHere === members.length;
      return `
      <div class="codex-group">
        <header class="codex-group-head f-${fid}">
          <b>${f.name}</b><span class="motto">${f.motto}</span>
          <span class="set-tag${complete ? ' done' : ''}">${complete ? `세트 +${setPct}%` : `다 모으면 +${setPct}%`}</span>
          <span class="tally">${ownedHere} / ${members.length}</span>
        </header>
        <div class="codex-grid">
          ${members.map((h, i) => cardHtml(h, Boolean(s.heroes[h.id]), s, i)).join('')}
        </div>
      </div>`;
    })
    .join('');

  return `
    <div class="codex-bonus">
      모은 장수 <b>${ownedCount}</b> / ${HEROES.length}
      ‧ 도감의 힘으로 전군 전투력 <b>+${bonusPct}%</b>
    </div>
    <div class="codex-group">
      <header class="codex-group-head">
        <b>열전</b><span class="motto">모인 인연이 이야기가 된다</span>
      </header>
      <ul class="q-list">${talesHtml(s)}</ul>
    </div>
    ${groups}`;
}

/** 도감 카드 탭 — 침묵하던 카드에 응답을 준다 (3-6).
 *  잠긴 카드: 어디서 만나는지(등급 확률·천장) + 모집으로 가는 길. 보유 카드: 상세. */
function openCard(id, owned) {
  const hero = HEROES.find((h) => h.id === id);
  if (!hero) return;
  const s = getState();
  if (owned) {
    const rivalKills = s.rivalKills?.[id] ?? 0;
    showModal({
      title: `${hero.name} ‧ ${RARITY[hero.rarity].name}`,
      body: `${hero.title}\n\n${FACTIONS[hero.faction].name}${rivalKills > 0 ? `\n숙적으로 격파 ${rivalKills}회` : ''}`,
      actions: [{ label: '닫기' }],
    });
    return;
  }
  const rate = GACHA_RATES.find((r) => r.rarity === hero.rarity);
  const pct = rate ? Math.round(rate.rate * 1000) / 10 : null;
  const legendLine = hero.rarity === 5 ? `\n전설은 모집 ${fmt(BALANCE.gacha.pityLegend)}회 안에 반드시 나옵니다(천장).` : '';
  showModal({
    title: `${hero.name} ‧ ${RARITY[hero.rarity].name}`,
    body: `아직 만나지 못한 장수입니다.\n\n모집에서 ${RARITY[hero.rarity].name} 확률 ${pct !== null ? `${pct}%` : ''}로 만날 수 있어요.${legendLine}\n명성 전당에서 조각으로 지명해 데려올 수도 있습니다.`,
    actions: [
      { label: '닫기' },
      { label: '모집으로 가기', primary: true, onClick: () => document.querySelector('.tab[data-tab="gacha"]')?.click() },
    ],
  });
}

export function render(root) {
  destroy();
  root.insertAdjacentHTML(
    'beforeend',
    `
  <section class="screen codex-screen">
    <header class="screen-head"><h2>도감</h2></header>
    <div id="cx-body">${bodyHtml(getState())}</div>
  </section>`
  );

  // 리스너는 화면 섹션에 — 탭 전환 시 함께 사라져 누적되지 않는다 (1-2)
  const section = root.lastElementChild;
  section.addEventListener('click', (e) => {
    const taleBtn = e.target.closest('.tale-open');
    if (taleBtn) {
      const entry = taleList(getState()).find((x) => x.tale.id === taleBtn.dataset.tale);
      if (entry) openTale(entry);
      return;
    }
    const card = e.target.closest('.codex-card');
    if (card) openCard(card.dataset.id, card.dataset.owned === '1');
  });

  const refresh = () => {
    const body = document.getElementById('cx-body');
    if (body) body.innerHTML = bodyHtml(getState());
  };

  unsubs.push(on('hero:add', refresh), on('hero:refund', refresh), on('tale:read', refresh));
}

export function destroy() {
  for (const off of unsubs) off();
  unsubs = [];
}
