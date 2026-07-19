// 영웅 화면 — 보유 장수 단련(레벨 올리기)

import { on } from '../core/events.js';
import * as stateModule from '../core/state.js';
import { getState, levelUpHero, starUpHero, togglePartyMember, upgradeGear } from '../core/state.js';
import * as gear from '../systems/gear.js';
import { heroDef, heroPower, partyPower, levelCost, starUpCost, MAX_STARS, effectiveBondBonus } from '../systems/growth.js';
import { orderList, toggleOrder } from '../systems/orders.js';
import { RARITY, FACTIONS, PERK_LABELS } from '../data/heroes.js';
import { BONDS } from '../data/bonds.js';
import { BALANCE } from '../data/balance.js';
import { fmt } from './format.js';
import { countUp, pulse, shake, floatText } from './effects.js';
import { play } from './sound.js';
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

// 보물 4슬롯 — 무기/갑옷/군마/병법서
function gearHtml(s) {
  return BALANCE.gear.slots
    .map((slot) => {
      const lv = gear.gearLevel(s, slot.id);
      const cost = gear.upgradeCost(lv);
      const pct = Math.round(lv * slot.perLevel * 100);
      return `
      <div class="gear-cell">
        <div class="gear-info">
          <b>${slot.name}</b>
          <span>Lv.${lv} ‧ ${slot.blurb} +${pct}%</span>
        </div>
        <button class="btn gear-up" data-slot="${slot.id}" data-cost="${cost}" ${(s.resources.stone ?? 0) < cost ? 'disabled' : ''}>
          강화<span>강화석 ${fmt(cost)}</span>
        </button>
      </div>`;
    })
    .join('');
}

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
        ‧ 중복 ${hs.dupes}
      </div>
      ${def.perk ? `<div class="row-perk">출전 시 ${PERK_LABELS[def.perk.kind]} +${def.perk.value}%</div>` : ''}
    </div>
    <div class="row-actions">
      <button class="btn train" data-id="${id}" ${maxedLevel ? 'disabled' : ''}>
        단련<span data-role="cost">${maxedLevel ? '최고' : `엽전 ${fmt(levelCost(hs.level))}`}</span>
      </button>
      <button class="btn star-up" data-id="${id}" ${canStar ? '' : 'disabled'}>
        승급<span>${maxedStars ? '최고' : `중복 ${hs.dupes}/${dupeCost}`}</span>
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
      <button class="btn" id="hs-train-all">전군 최대 단련</button>
      <button class="btn" id="hs-star-all">일괄 승급</button>
    </div>
    <div class="gear-panel">
      <div class="shard-head">
        <b>보물</b>
        <span class="shard-balance">강화석 <b id="gr-stone">${fmt(s.resources.stone ?? 0)}</b></span>
      </div>
      <div class="gear-grid" id="gr-grid">${gearHtml(s)}</div>
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

  // 보물 강화
  const refreshGear = () => {
    const st = getState();
    const stoneEl = document.getElementById('gr-stone');
    if (stoneEl) stoneEl.textContent = fmt(st.resources.stone ?? 0);
    const grid = document.getElementById('gr-grid');
    if (grid) grid.innerHTML = gearHtml(st);
  };
  document.getElementById('gr-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.gear-up');
    if (!btn) return;
    if (!upgradeGear(btn.dataset.slot, Number(btn.dataset.cost))) {
      shake(btn);
      floatText(e.clientX, e.clientY, '강화석이 모자라요 — 전장 돌파와 탑에서 나와요', 'warn');
      return;
    }
    refreshGear();
    refreshPartyViews(); // 무기는 전투력을 바로 바꾼다
    floatText(e.clientX, e.clientY, '보물이 빛난다!', 'gold');
    play('claim');
  });
  unsubs.push(on('stone', refreshGear));

  // 전군 최대 단련 — 가진 엽전이 다할 때까지 강한 순으로 돌아가며 올린다 (수백 번 탭 노동 제거)
  document.getElementById('hs-train-all').addEventListener('click', (e) => {
    let ups = 0;
    let guard = 0;
    let any = true;
    while (any && guard < 5000) {
      any = false;
      for (const { id } of ownedSorted(getState())) {
        const hs = getState().heroes[id];
        if (hs.level >= BALANCE.growth.maxLevel) continue;
        if (levelUpHero(id, levelCost(hs.level))) {
          ups += 1;
          any = true;
        }
        if (++guard >= 5000) break;
      }
    }
    if (ups === 0) {
      shake(e.target.closest('button'));
      floatText(e.clientX, e.clientY, '엽전이 모자라요', 'warn');
      return;
    }
    refreshPartyViews();
    const listEl = document.getElementById('hs-list');
    if (listEl) listEl.innerHTML = listHtml(getState());
    floatText(e.clientX, e.clientY, `전군 +${ups}레벨!`, 'gold');
  });

  // 일괄 승급 — 겹침이 차 있는 장수 전원 승급
  document.getElementById('hs-star-all').addEventListener('click', (e) => {
    let stars = 0;
    for (const { id } of ownedSorted(getState())) {
      let hs = getState().heroes[id];
      while (hs.stars < MAX_STARS && hs.dupes >= starUpCost(hs.stars)) {
        if (!starUpHero(id, starUpCost(hs.stars))) break;
        stars += 1;
        hs = getState().heroes[id];
      }
    }
    if (stars === 0) {
      shake(e.target.closest('button'));
      floatText(e.clientX, e.clientY, '승급할 수 있는 장수가 없어요', 'warn');
      return;
    }
    refreshPartyViews();
    const listEl = document.getElementById('hs-list');
    if (listEl) listEl.innerHTML = listHtml(getState());
    floatText(e.clientX, e.clientY, `별 +${stars}!`, 'gold');
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
