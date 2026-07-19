// 영웅 화면 — 보유 장수 단련(레벨 올리기)

import { on } from '../core/events.js';
import { getState, levelUpHero, starUpHero, setMain, refundHero, upgradeGear } from '../core/state.js';
import * as gear from '../systems/gear.js';
import { heroDef, heroPower, partyPower, levelCost, starUpCost, MAX_STARS, effectiveBondBonus } from '../systems/growth.js';
import { orderList, toggleOrder } from '../systems/orders.js';
import { RARITY, FACTIONS, PERK_LABELS } from '../data/heroes.js';
import { BONDS } from '../data/bonds.js';
import { BALANCE } from '../data/balance.js';
import { showModal } from './modal.js';
import { fmt } from './format.js';
import { countUp, pulse, shake, floatText } from './effects.js';
import { play } from './sound.js';
import { portraitHtml } from './portrait.js';

function bondsHtml(s) {
  // 인연은 '보유(수집)' 기준 — 구성 3인을 다 모으면 발동해 메인 전투력에 곱해진다.
  return BONDS.map((bond) => {
    const have = bond.heroes.filter((id) => s.heroes[id]).length;
    const active = have === bond.heroes.length;
    const pct = Math.round(effectiveBondBonus(s, bond) * 100);
    return `<button class="bond-chip${active ? ' on' : ''}" data-bond="${bond.id}">
      ${bond.name} ${active ? `+${pct}%` : `${have}/${bond.heroes.length}`}
    </button>`;
  }).join('');
}

/** 인연 상세 인라인 패널 — 구성 장수별 출전/보유/미보유 + 설명·숙련 (2-13) */
function bondPanelHtml(s, bondId) {
  const bond = BONDS.find((b) => b.id === bondId);
  if (!bond) return '';
  const mastery = s.bondsMastery?.[bond.id] ?? 0;
  const members = bond.heroes
    .map((id) => {
      const def = heroDef(id);
      const owned = Boolean(s.heroes[id]);
      const isMain = s.party[0] === id;
      const cls = isMain ? 'on-duty' : owned ? 'owned' : 'missing';
      const tag = isMain ? '메인' : owned ? '보유 · 탭해서 메인' : '미보유 · 모집에서';
      return `<button class="bond-member ${cls}" data-hero="${owned ? id : ''}">
        <b>${def.name}</b><span>${tag}</span>
      </button>`;
    })
    .join('');
  return `
    <div class="bond-detail">
      <p class="bond-blurb">${bond.blurb}</p>
      <div class="bond-members">${members}</div>
      ${mastery > 0 ? `<p class="bond-mastery">우두머리 격파 ${mastery}회 — 인연이 깊어졌다</p>` : ''}
    </div>`;
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
let openBond = null;       // 지금 펼쳐 둔 인연 패널 (2-13)
let lastShownPower = 0;    // 헤더 메인 전투력 카운트업 기준값 (2-8)
let powerRaf = 0;          // 이벤트 폭주 흡수용 병합 플래그

/** 헤더 메인 전투력 — 단련·승급·메인 교체 어느 경로든 카운트업으로 차오르고, 늘면 '+N' (2-8).
 *  전군 단련의 hero:level 수백 회를 rAF로 병합해 countUp 충돌을 막는다. */
function updatePower() {
  if (powerRaf) return;
  powerRaf = requestAnimationFrame(() => {
    powerRaf = 0;
    const el = document.getElementById('hs-power');
    if (!el) return;
    const after = partyPower(getState());
    if (after === lastShownPower) return;
    countUp(el, lastShownPower, after, { duration: 400, format: fmt });
    if (after > lastShownPower) {
      const r = el.getBoundingClientRect();
      floatText(r.left + r.width / 2, r.top, `+${fmt(after - lastShownPower)}`, 'gold');
      pulse(el);
    }
    lastShownPower = after;
  });
}

// 보물 4슬롯 — 무기/갑옷/군마/병법서
function gearHtml(s) {
  return BALANCE.gear.slots
    .map((slot) => {
      const lv = gear.gearLevel(s, slot.id);
      const cost = gear.upgradeCost(lv);
      const pct = Math.round(lv * slot.perLevel * 100);
      // 부족해도 disabled로 막지 않는다 — 탭하면 '어디서 얻는지' 안내가 뜨게 (1-5)
      const short = (s.resources.stone ?? 0) < cost;
      return `
      <div class="gear-cell">
        <div class="gear-info">
          <b>${slot.name}</b>
          <span>Lv.${lv} ‧ ${slot.blurb} +${pct}%</span>
        </div>
        <button class="btn gear-up${short ? ' cant-afford' : ''}" data-slot="${slot.id}" data-cost="${cost}"${short ? ' aria-disabled="true"' : ''}>
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

/** 등급별 반환 옥구슬 (겹침 포함) — 미리보기·확인에 공용 */
function refundJadeOf(id, hs) {
  const rarity = heroDef(id)?.rarity ?? 1;
  const base = BALANCE.refund.jadeByRarity[rarity] ?? 0;
  return Math.round(base * (1 + (hs.dupes ?? 0) * BALANCE.refund.perDupe));
}

function rowHtml({ id, def, hs }, index = 0) {
  const isMain = getState().party[0] === id;
  const maxedLevel = hs.level >= BALANCE.growth.maxLevel;
  const maxedStars = hs.stars >= MAX_STARS;
  const dupeCost = starUpCost(hs.stars);
  const canStar = !maxedStars && hs.dupes >= dupeCost;
  const trainCost = maxedLevel ? 0 : levelCost(hs.level);
  const canTrain = !maxedLevel && getState().resources.coin >= trainCost;

  // 메인은 단련·승급 대상, 나머지는 반환(옥구슬) 대상 — '하나만 잘 키우기' 구조
  const actions = isMain
    ? `
      <button class="btn train${canTrain ? ' can-buy' : ''}" data-id="${id}" data-cost="${trainCost}" ${maxedLevel ? 'disabled' : ''}>
        단련<span data-role="cost">${maxedLevel ? '최고' : `엽전 ${fmt(trainCost)}`}</span>
      </button>
      <button class="btn star-up${canStar ? ' can-buy' : ''}" data-id="${id}" ${canStar ? '' : 'disabled'}>
        승급<span>${maxedStars ? '최고' : `중복 ${hs.dupes}/${dupeCost}`}</span>
      </button>`
    : `
      <button class="btn refund" data-id="${id}">
        반환<span>옥구슬 ${fmt(refundJadeOf(id, hs))}</span>
      </button>`;

  return `
  <li class="hero-row f-${def.faction}${isMain ? ' in-party is-main' : ''}" data-id="${id}" style="--i:${Math.min(index, 8)}">
    ${portraitHtml(id, `row-portrait frame-r${def.rarity}`)}
    <div class="row-info">
      <div class="row-name">
        <b>${def.name}</b>
        <i class="stars">${'★'.repeat(hs.stars)}</i>
        <em class="rarity r${def.rarity}">${RARITY[def.rarity].name}</em>
        ${isMain ? '<i class="on-duty">메인</i>' : ''}
      </div>
      <div class="row-title">${def.title}</div>
      <div class="row-meta">
        ${FACTIONS[def.faction].name} ‧ <span data-role="level">${hs.level}</span>레벨
        ‧ 전투력 <b data-role="power">${fmt(heroPower(id, hs))}</b>
        ‧ 중복 ${hs.dupes}
      </div>
      ${def.perk ? `<div class="row-perk">메인일 때 ${PERK_LABELS[def.perk.kind]} +${def.perk.value}%</div>` : ''}
    </div>
    <div class="row-actions">${actions}</div>
  </li>`;
}

function listHtml(s) {
  const rows = ownedSorted(s).map(rowHtml).join('');
  // 로스터가 휑할 땐 빈 공간에 목적을 준다 — 다음 장수를 모으러 가는 문
  const ghost =
    ownedSorted(s).length < 8
      ? `<li class="hero-row ghost-row"><span>다음 장수를 모집하러 가기 →</span></li>`
      : '';
  return rows + ghost;
}

export function render(root) {
  destroy();
  const s = getState();
  openBond = null;
  lastShownPower = partyPower(s); // 카운트업 기준을 현재값으로 — 진입 시 0→X 튀지 않게

  root.insertAdjacentHTML(
    'beforeend',
    `
  <section class="screen heroes-screen">
    <header class="screen-head">
      <h2>영웅</h2>
      <div class="head-note">메인 전투력 <b id="hs-power">${fmt(partyPower(s))}</b></div>
    </header>
    <p class="screen-sub">장수를 눌러 <b>메인 영웅</b>으로 세우면 그 장수만 전장에서 싸웁니다. 아래 버튼으로 키우세요.</p>
    ${(() => {
      // 초보 유도 힌트 — 메인이 아직 저레벨일 때만. 상태 파생값이라 세이브 스키마 변경 없음.
      const mainHs = s.heroes[s.party[0]];
      return mainHs && mainHs.level < 5
        ? `<div class="hs-hint">여기를 눌러 영웅을 키우세요</div>`
        : '';
    })()}
    <button class="btn primary hs-primary" id="hs-train-all">
      <b>메인 영웅 단련</b>
      <span>엽전으로 전투력 올리기</span>
    </button>
    <div class="party-tools">
      <button class="btn" id="hs-best">최강 메인</button>
      <button class="btn" id="hs-star-all">전체 승급</button>
    </div>
    <div class="gear-panel">
      <div class="shard-head">
        <b>보물</b>
        <span class="shard-balance">강화석 <b id="gr-stone">${fmt(s.resources.stone ?? 0)}</b></span>
      </div>
      <div class="gear-grid" id="gr-grid">${gearHtml(s)}</div>
    </div>
    <div class="mini-head">인연 — 모으면 메인이 강해진다</div>
    <div class="bond-list" id="hs-bonds">${bondsHtml(s)}</div>
    <div class="bond-panel-slot" id="hs-bond-panel"></div>
    ${orderList(s).some((e) => e.unlocked)
      ? `<div class="mini-head">세력 군령 — 도감을 완성한 세력의 힘</div>
         <div class="order-list" id="hs-orders">${ordersHtml(s)}</div>`
      : `<div class="order-empty">세력 군령 0/4 ‧ 한 세력의 도감을 완성하면 열립니다</div>`}
    <ul class="hero-list" id="hs-list">${listHtml(s)}</ul>
  </section>`
  );

  document.getElementById('hs-orders')?.addEventListener('click', (e) => {
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
    updatePower(); // 헤더 출전 전투력 — 카운트업 + '+N' (2-8)
    // 인연 패널이 열려 있으면 상태(출전/보유) 반영해 다시 그린다
    const panel = document.getElementById('hs-bond-panel');
    if (panel && openBond) panel.innerHTML = bondPanelHtml(getState(), openBond);
  };

  // 인연 칩 탭 → 아래에 구성 장수 패널 토글. 보유(미출전) 장수를 탭하면 바로 출전 (2-13)
  document.getElementById('hs-bonds').addEventListener('click', (e) => {
    const chip = e.target.closest('.bond-chip');
    if (!chip) return;
    openBond = openBond === chip.dataset.bond ? null : chip.dataset.bond;
    for (const c of document.querySelectorAll('.bond-chip')) c.classList.toggle('open', c.dataset.bond === openBond);
    const panel = document.getElementById('hs-bond-panel');
    if (panel) panel.innerHTML = openBond ? bondPanelHtml(getState(), openBond) : '';
  });
  // 인연 패널에서 보유 장수 탭 → 그 장수를 메인으로
  document.getElementById('hs-bond-panel').addEventListener('click', (e) => {
    const mem = e.target.closest('.bond-member[data-hero]');
    const id = mem?.dataset.hero;
    if (!id) return; // 미보유는 데이터 없음 — 조용히
    if (getState().party[0] === id) return; // 이미 메인
    setMain(id);
    refreshPartyViews();
    floatText(e.clientX, e.clientY, '메인 영웅 교체!', 'gold');
  });

  // 최강을 메인으로 — 개별 전투력이 가장 높은 장수를 메인으로 세운다
  document.getElementById('hs-best').addEventListener('click', (e) => {
    const st = getState();
    const before = partyPower(st);
    const strongest = ownedSorted(st)[0]?.id;
    if (!strongest || st.party[0] === strongest) {
      floatText(e.clientX, e.clientY, '이미 가장 강한 장수가 메인이에요');
      return;
    }
    setMain(strongest);
    refreshPartyViews();
    const gained = partyPower(getState()) - before;
    floatText(e.clientX, e.clientY, gained > 0 ? `메인 교체! +${fmt(gained)}` : '메인 교체!', 'gold');
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

  // 메인 최대 단련 — 가진 엽전이 다할 때까지 메인 영웅만 올린다 (하나만 잘 키우기)
  document.getElementById('hs-train-all').addEventListener('click', (e) => {
    const main = getState().party[0];
    if (!main) return;
    const before = partyPower(getState());
    let ups = 0;
    let guard = 0;
    while (guard < 8000) {
      const hs = getState().heroes[main];
      if (!hs || hs.level >= BALANCE.growth.maxLevel) break;
      if (!levelUpHero(main, levelCost(hs.level))) break; // 엽전 소진
      ups += 1;
      guard += 1;
    }
    if (ups === 0) {
      shake(e.target.closest('button'));
      const hs = getState().heroes[main];
      floatText(e.clientX, e.clientY, hs && hs.level >= BALANCE.growth.maxLevel ? '이미 최고 레벨이에요' : '엽전이 모자라요', 'warn');
      return;
    }
    refreshPartyViews();
    const gained = partyPower(getState()) - before;
    floatText(e.clientX, e.clientY, `메인 +${ups}레벨 ‧ 전투력 +${fmt(gained)}!`, 'gold');
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
    floatText(e.clientX, e.clientY, `별 +${stars}!`, 'gold');
  });

  const list = document.getElementById('hs-list');

  list.addEventListener('click', (e) => {
    if (e.target.closest('.ghost-row')) {
      document.querySelector('.tab[data-tab="gacha"]')?.click();
      return;
    }
    // 반환 — 등급별 옥구슬로. 도감·인연 버프를 잃으므로 확인을 받는다
    const refundBtn = e.target.closest('button.refund');
    if (refundBtn) {
      const id = refundBtn.dataset.id;
      const def = heroDef(id);
      const hs = getState().heroes[id];
      const jade = refundJadeOf(id, hs);
      showModal({
        title: `${def.name} 반환`,
        body: `${def.name}(${RARITY[def.rarity].name})을(를) 돌려보내고 옥구슬 ${fmt(jade)}을 받습니다.\n\n반환하면 이 장수의 도감·인연 수집 버프를 잃어요. 되돌릴 수 없습니다.`,
        actions: [
          { label: '취소' },
          {
            label: `반환 (옥구슬 ${fmt(jade)})`,
            primary: true,
            onClick: () => {
              if (refundHero(id) > 0) {
                play('claim');
                refreshPartyViews();
              }
            },
          },
        ],
      });
      return;
    }
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
      updatePower(); // 승급도 전투력을 올린다 (2-8)
      floatText(e.clientX, e.clientY, '별이 하나 더!', 'gold');
      return;
    }

    const btn = e.target.closest('button.train');
    if (!btn) {
      // 버튼이 아닌 행을 누르면 그 장수를 메인으로 세운다
      const row = e.target.closest('.hero-row');
      if (!row) return;
      const id = row.dataset.id;
      if (getState().party[0] === id) return; // 이미 메인
      const before = partyPower(getState());
      setMain(id);
      refreshPartyViews();
      const gained = partyPower(getState()) - before;
      floatText(e.clientX, e.clientY, gained > 0 ? `메인 교체! +${fmt(gained)}` : gained < 0 ? `메인 교체 (전투력 ${fmt(gained)})` : '메인 교체!', gained >= 0 ? 'gold' : 'warn');
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
    const nextCost = maxed ? 0 : levelCost(getState().heroes[id].level);
    costEl.textContent = maxed ? '최고' : `엽전 ${fmt(nextCost)}`;
    btn.dataset.cost = nextCost;
    btn.disabled = maxed;
    updatePower(); // 헤더 출전 전투력도 함께 (2-8)
    pulse(row);
  });

  // 살 수 있는 단련·승급 버튼에 글로우 — 방치 수익이 쌓여 살 수 있게 되면 화면이 반응 (2-9).
  // coin은 초당 수회 발생하는 핫패스라 innerHTML 재작성 없이 클래스만 토글한다.
  const refreshBuyGlow = () => {
    const coin = getState().resources.coin;
    for (const b of document.querySelectorAll('#hs-list .btn.train')) {
      if (b.disabled) { b.classList.remove('can-buy'); continue; }
      b.classList.toggle('can-buy', coin >= Number(b.dataset.cost || 0));
    }
  };

  unsubs.push(
    on('hero:level', updatePower),
    on('hero:star', updatePower),
    on('coin', refreshBuyGlow),
    on('hero:add', () => {
      const listEl = document.getElementById('hs-list');
      if (listEl) listEl.innerHTML = listHtml(getState());
      updatePower();
    })
  );

  // 첫 등장 스태거가 끝나면 스태거를 끈다 — 이후 재렌더는 출렁이지 않는다 (2-12)
  setTimeout(() => document.getElementById('hs-list')?.classList.add('no-stagger'), 520);
}

export function destroy() {
  for (const off of unsubs) off();
  unsubs = [];
}
