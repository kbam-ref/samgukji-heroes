// 영웅 화면 — 보유 장수 단련(레벨 올리기)

import { on } from '../core/events.js';
import * as stateModule from '../core/state.js';
import { getState, levelUpHero, starUpHero, togglePartyMember } from '../core/state.js';
import { heroDef, heroPower, partyPower, levelCost, starUpCost, MAX_STARS, effectiveBondBonus } from '../systems/growth.js';
import { orderList, toggleOrder } from '../systems/orders.js';
import { RARITY, FACTIONS } from '../data/heroes.js';
import { BONDS } from '../data/bonds.js';
import { BALANCE } from '../data/balance.js';
import { fmt } from './format.js';
import { countUp, pulse, shake, floatText } from './effects.js';
import { portraitHtml } from './portrait.js';

function bondsHtml(s) {
  return BONDS.map((bond) => {
    const have = bond.heroes.filter((id) => s.party.includes(id)).length;
    const active = have === bond.heroes.length;
    const pct = Math.round(effectiveBondBonus(s, bond) * 100);
    const mastery = s.bondsMastery?.[bond.id] ?? 0;
    return `<span class="bond-chip${active ? ' on' : ''}" title="${bond.blurb} — ${bond.heroes.map((id) => heroDef(id).name).join(' ‧ ')} ‧ 우두머리 ${mastery}회">
      ${bond.name} ${active ? `+${pct}%` : `${have}/${bond.heroes.length}`}
    </span>`;
  }).join('');
}

function ordersHtml(s) {
  return orderList(s)
    .map(
      (e) => `
    <button class="order-chip${e.active ? ' on' : ''}${e.unlocked ? '' : ' locked'}"
            data-order="${e.order.id}" title="${e.order.blurb}" ${e.unlocked ? '' : 'disabled'}>
      ${FACTIONS[e.order.faction].name} ‧ ${e.order.name}${e.unlocked ? '' : ' — 도감 완성 시'}
    </button>`
    )
    .join('');
}

let unsubs = [];

function ownedSorted(s) {
  return Object.keys(s.heroes)
    .map((id) => ({ id, def: heroDef(id), hs: s.heroes[id] }))
    .filter((h) => h.def)
    .sort((a, b) => heroPower(b.id, b.hs) - heroPower(a.id, a.hs));
}

function rowHtml({ id, def, hs }, index = 0) {
  const inParty = getState().party.includes(id);
  const maxedLevel = hs.level >= BALANCE.growth.maxLevel;
  const maxedStars = hs.stars >= MAX_STARS;
  const dupeCost = starUpCost(hs.stars);
  const canStar = !maxedStars && hs.dupes >= dupeCost;

  return `
  <li class="hero-row f-${def.faction}" data-id="${id}" style="--i:${Math.min(index, 8)}">
    ${portraitHtml(id, `row-portrait frame-r${def.rarity}`)}
    <div class="row-info">
      <div class="row-name">
        <b>${def.name}</b>
        <i class="stars">${'★'.repeat(hs.stars)}</i>
        <em class="rarity r${def.rarity}">${RARITY[def.rarity].name}</em>
        ${inParty ? '<i class="on-duty">출전</i>' : ''}
      </div>
      <div class="row-title">${def.title}</div>
      <div class="row-meta">
        ${FACTIONS[def.faction].name} ‧ <span data-role="level">${hs.level}</span>레벨
        ‧ 전투력 <b data-role="power">${fmt(heroPower(id, hs))}</b>
        ‧ 겹침 ${hs.dupes}
      </div>
    </div>
    <div class="row-actions">
      <button class="btn train" data-id="${id}" ${maxedLevel ? 'disabled' : ''}>
        단련<span data-role="cost">${maxedLevel ? '최고' : `엽전 ${fmt(levelCost(hs.level))}`}</span>
      </button>
      <button class="btn star-up" data-id="${id}" ${canStar ? '' : 'disabled'}>
        승급<span>${maxedStars ? '최고' : `겹침 ${hs.dupes}/${dupeCost}`}</span>
      </button>
    </div>
  </li>`;
}

function listHtml(s) {
  return ownedSorted(s).map(rowHtml).join('');
}

export function render(root) {
  destroy();
  const s = getState();

  root.insertAdjacentHTML(
    'beforeend',
    `
  <section class="screen heroes-screen">
    <header class="screen-head">
      <h2>영웅</h2>
      <div class="head-note">출전 전투력 <b id="hs-power">${fmt(partyPower(s))}</b></div>
    </header>
    <p class="screen-sub">장수를 누르면 출전을 넣고 뺄 수 있어요 (최대 5명). 함께 서면 인연이 깨어나요.</p>
    <div class="party-tools">
      <button class="btn" id="hs-best">최강 편성</button>
      <span>전투력 높은 다섯을 한 번에 세워요</span>
    </div>
    <div class="bond-list" id="hs-bonds">${bondsHtml(s)}</div>
    <div class="order-list" id="hs-orders">${ordersHtml(s)}</div>
    <ul class="hero-list" id="hs-list">${listHtml(s)}</ul>
  </section>`
  );

  document.getElementById('hs-orders').addEventListener('click', (e) => {
    const chip = e.target.closest('.order-chip');
    if (!chip) return;
    const wasActive = getState().orders?.active === chip.dataset.order;
    if (!toggleOrder(chip.dataset.order)) {
      shake(chip);
      return;
    }
    const ordersEl = document.getElementById('hs-orders');
    if (ordersEl) ordersEl.innerHTML = ordersHtml(getState());
    floatText(e.clientX, e.clientY, wasActive ? '군령을 거두었다' : '군령을 내렸다!', wasActive ? '' : 'gold');
  });

  const refreshPartyViews = () => {
    const listEl = document.getElementById('hs-list');
    if (listEl) listEl.innerHTML = listHtml(getState());
    const bondsEl = document.getElementById('hs-bonds');
    if (bondsEl) bondsEl.innerHTML = bondsHtml(getState());
    const powerEl = document.getElementById('hs-power');
    if (powerEl) powerEl.textContent = fmt(partyPower(getState()));
  };

  document.getElementById('hs-best').addEventListener('click', (e) => {
    const st = getState();
    const best = ownedSorted(st).slice(0, 5).map((h) => h.id);
    const same = best.length === st.party.length && best.every((id) => st.party.includes(id));
    if (same) {
      floatText(e.clientX, e.clientY, '이미 가장 강한 전열이에요');
      return;
    }
    const { setParty } = stateModule;
    setParty(best);
    refreshPartyViews();
    floatText(e.clientX, e.clientY, '전열을 다시 짰어요!', 'gold');
  });

  const list = document.getElementById('hs-list');

  list.addEventListener('click', (e) => {
    const starBtn = e.target.closest('button.star-up');
    if (starBtn) {
      const id = starBtn.dataset.id;
      const hs = getState().heroes[id];
      if (!starUpHero(id, starUpCost(hs.stars))) {
        shake(starBtn);
        return;
      }
      const row = starBtn.closest('.hero-row');
      row.outerHTML = rowHtml({ id, def: heroDef(id), hs: getState().heroes[id] });
      const newRow = list.querySelector(`li[data-id="${id}"]`);
      if (newRow) pulse(newRow);
      floatText(e.clientX, e.clientY, '별이 하나 더!', 'gold');
      return;
    }

    const btn = e.target.closest('button.train');
    if (!btn) {
      // 버튼이 아닌 행을 누르면 출전을 넣고 뺀다
      const row = e.target.closest('.hero-row');
      if (!row) return;
      const id = row.dataset.id;
      const wasIn = getState().party.includes(id);
      if (!togglePartyMember(id)) {
        shake(row);
        floatText(e.clientX, e.clientY, wasIn ? '마지막 한 명은 못 빼요' : '자리가 다 찼어요', 'warn');
        return;
      }
      const listEl = document.getElementById('hs-list');
      if (listEl) listEl.innerHTML = listHtml(getState());
      const bondsEl = document.getElementById('hs-bonds');
      if (bondsEl) bondsEl.innerHTML = bondsHtml(getState());
      const powerEl = document.getElementById('hs-power');
      if (powerEl) powerEl.textContent = fmt(partyPower(getState()));
      floatText(e.clientX, e.clientY, wasIn ? '물러남' : '출전!', wasIn ? '' : 'gold');
      return;
    }
    const id = btn.dataset.id;
    const st = getState();
    const hero = st.heroes[id];
    const cost = levelCost(hero.level);
    const before = heroPower(id, hero);

    if (!levelUpHero(id, cost)) {
      shake(btn);
      const rect = btn.getBoundingClientRect();
      floatText(rect.left + rect.width / 2, rect.top, '엽전이 모자라요', 'warn');
      return;
    }

    const row = btn.closest('.hero-row');
    const powerEl = row.querySelector('[data-role="power"]');
    const levelEl = row.querySelector('[data-role="level"]');
    const costEl = btn.querySelector('[data-role="cost"]');
    const after = heroPower(id, getState().heroes[id]);

    levelEl.textContent = getState().heroes[id].level;
    countUp(powerEl, before, after, { duration: 400, format: fmt });
    const maxed = getState().heroes[id].level >= BALANCE.growth.maxLevel;
    costEl.textContent = maxed ? '최고' : `엽전 ${fmt(levelCost(getState().heroes[id].level))}`;
    btn.disabled = maxed;
    pulse(row);
  });

  const refreshPower = () => {
    const powerEl = document.getElementById('hs-power');
    if (powerEl) powerEl.textContent = fmt(partyPower(getState()));
  };

  unsubs.push(
    on('hero:level', refreshPower),
    on('hero:star', refreshPower),
    on('hero:add', () => {
      const listEl = document.getElementById('hs-list');
      if (listEl) listEl.innerHTML = listHtml(getState());
      refreshPower();
    })
  );
}

export function destroy() {
  for (const off of unsubs) off();
  unsubs = [];
}
