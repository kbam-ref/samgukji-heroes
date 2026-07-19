// 도감 화면 — 세력별 수집 현황. 못 얻은 장수는 실루엣으로 갈증을 만든다.

import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import { HEROES, RARITY, FACTIONS } from '../data/heroes.js';
import { BALANCE } from '../data/balance.js';
import { collectionBonus } from '../systems/growth.js';
import { taleList } from '../systems/tales.js';
import { openTale } from './tales-modal.js';
import { portraitHtml } from './portrait.js';

let unsubs = [];

function cardHtml(hero, owned, s, index = 0) {
  const stagger = `style="--i:${Math.min(index, 8)}"`;
  if (!owned) {
    // 실루엣 — 진짜 초상을 검게 가려 "저게 누구지" 갈증을 만든다
    return `
    <div class="codex-card locked" ${stagger}>
      ${portraitHtml(hero.id, 'codex-portrait silhouette')}
      <span class="codex-q" aria-hidden="true">?</span>
      <b class="codex-name">${hero.name}</b>
      <em class="codex-rarity r${hero.rarity}">${RARITY[hero.rarity].name}</em>
    </div>`;
  }
  const rivalKills = s?.rivalKills?.[hero.id] ?? 0;
  return `
  <div class="codex-card f-${hero.faction} r${hero.rarity}" ${stagger}>
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
  return taleList(s)
    .map((entry) => {
      const have = entry.bond.heroes.filter((id) => s.heroes[id]).length;
      const need = entry.bond.heroes.length;
      const status = entry.read
        ? '<span class="q-done">읽음</span>'
        : entry.unlocked
          ? `<button class="btn primary tale-open" data-tale="${entry.tale.id}">읽기</button>`
          : `<span class="q-progress">${have} / ${need} 모음</span>`;
      return `
      <li class="q-row${entry.read ? ' claimed' : ''}">
        <div class="q-info">
          <b>${entry.tale.title}</b>
          <span class="q-blurb">${entry.bond.name} — ${entry.bond.heroes.map(nameOf).join(' ‧ ')}</span>
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

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.tale-open');
    if (!btn) return;
    const entry = taleList(getState()).find((x) => x.tale.id === btn.dataset.tale);
    if (entry) openTale(entry);
  });

  const refresh = () => {
    const body = document.getElementById('cx-body');
    if (body) body.innerHTML = bodyHtml(getState());
  };

  unsubs.push(on('hero:add', refresh), on('tale:read', refresh));
}

export function destroy() {
  for (const off of unsubs) off();
  unsubs = [];
}
