// 전투 화면 — 편성 전원이 전장에 서서 싸우는 메인 무대
// 전투 계산은 systems/battle.js가 하고, 이 파일은 이벤트를 구독해 그리기만 한다.

import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import * as battle from '../systems/battle.js';
import { totalDps, atkPerUpgrade } from '../systems/hero-unit.js';
import * as upgrades from '../systems/upgrades.js';
import { partyPower, heroDef, bondBonus } from '../systems/growth.js';
import { BALANCE } from '../data/balance.js';
import { RIVAL_LINES, RIVAL_LINE_DEFAULT } from '../data/rivals.js';
import { fmt } from './format.js';
import { floatText, pulse, shake, countUp, burst, flash } from './effects.js';
import { play, vibrate } from './sound.js';
import { portraitHtml } from './portrait.js';

let unsubs = [];
let rafId = 0;
let lastTap = 0;
const cutinSeen = new Set(); // 숙적 컷인은 접속당 한 번 — 재조우는 짧게

const FACTION_BAND = { wei: '#56749f', shu: '#567f52', wu: '#a85048', free: '#7e7668' };

function foeSvg(bandColor) {
  return `
  <svg viewBox="0 0 64 72" class="foe-figure" aria-hidden="true">
    <circle cx="32" cy="20" r="11"></circle>
    <path d="M32 33 C20 33 13 42 12 58 L52 58 C51 42 44 33 32 33 Z"></path>
    <rect x="20" y="13.4" width="24" height="5" rx="2.5" fill="${bandColor}" transform="rotate(-6 32 16)"></rect>
  </svg>`;
}

function allyUnitSvg(bandColor) {
  return `
  <svg viewBox="0 0 64 72" aria-hidden="true">
    <circle cx="32" cy="20" r="11"></circle>
    <path d="M32 33 C20 33 13 42 12 58 L52 58 C51 42 44 33 32 33 Z"></path>
    <rect x="20" y="13.4" width="24" height="5" rx="2.5" fill="${bandColor}" transform="rotate(6 32 16)"></rect>
  </svg>`;
}

function alliesHtml() {
  return battle
    .alliesSnapshot()
    .map(
      (u) => `
    <div class="ally-unit${u.hp <= 0 ? ' down' : ''}" data-id="${u.id}">
      <div class="unit-hp ally-hp"><i style="width:${(u.hp / u.maxHp) * 100}%"></i></div>
      ${allyUnitSvg(FACTION_BAND[u.faction] ?? '#567f52')}
      <span class="ally-unit-name">${u.name}</span>
    </div>`
    )
    .join('');
}

/** 전열 갱신 — 구성이 같으면 체력 바만 만져서 진행 중인 모션(찌르기)을 지키고,
 *  구성이 바뀌었을 때만 다시 그린다. */
function updateAllies() {
  const line = document.getElementById('bs-allies');
  if (!line) return;
  const units = battle.alliesSnapshot();
  const nodes = line.children;

  const sameShape =
    nodes.length === units.length &&
    units.every((u, i) => nodes[i].dataset.id === u.id);

  if (!sameShape) {
    line.innerHTML = alliesHtml();
    return;
  }

  units.forEach((u, i) => {
    const node = nodes[i];
    const bar = node.querySelector('.unit-hp i');
    if (bar) bar.style.width = `${(u.hp / u.maxHp) * 100}%`;
    node.classList.toggle('down', u.hp <= 0);
  });
}

/** 화면에 보여주는 '돌파' 수치 = 실제 돌파에 필요한 전투력 (숨은 배율 없이 정직하게) */
function gatePower(stage) {
  return Math.ceil(stage.enemyPower * BALANCE.battle.bossPowerRatio);
}

function template(s) {
  const chapter = battle.currentChapter(s);
  const stage = battle.currentStage(s);
  const bandColor = ['#C8A93A', '#8A3A34', '#7A6A9E', '#4F6FA0'][chapter.id - 1] ?? '#8A3A34';

  return `
  <section class="screen battle-screen">
    <header class="stage-plate">
      <div class="stage-chapter">${chapter.id}장 ‧ ${chapter.name}</div>
      <h1 class="stage-name" id="bs-stage-name">${stage.name}</h1>
      <div class="stage-step">${s.stage.index} / ${chapter.stages.length} 전장</div>
    </header>

    <div class="battlefield" id="bs-field">
      <div class="scroll-strip" aria-hidden="true" id="bs-scroll">${stage.name}</div>

      <div class="foe down" id="bs-foe">
        <div class="unit-hp foe-hp"><i id="bs-foe-hp" style="width:100%"></i></div>
        ${foeSvg(bandColor)}
        <div class="unit-name foe-name" id="bs-foe-name">${chapter.foe}</div>
      </div>

      <div class="ally-line" id="bs-allies">${alliesHtml()}</div>

      <button class="combo-btn" id="bs-combo" hidden aria-label="협공 발동">
        <i class="combo-fill" id="bs-combo-fill"></i>
        <span class="combo-label">협공</span>
      </button>

      <div class="tap-hint">전장을 두드리면 엽전이 떨어져요</div>
    </div>

    <div class="battle-status">
      <div class="status-top">
        <span class="kill-info">무찌른 적 <b id="bs-kills">${s.stage.kills}</b> / ${BALANCE.battle.killsPerStage}</span>
        <span class="power-pair">
          아군 <b id="bs-ally-power">${fmt(partyPower(s))}</b>
          <i class="vs-mark"></i>
          돌파 <b id="bs-foe-power">${fmt(gatePower(stage))}</b>
        </span>
      </div>
      <div class="kill-bar"><i id="bs-kill-fill"></i></div>
      <p class="battle-hint" id="bs-hint"></p>
    </div>

    <button class="atk-upgrade" id="bs-upgrade">
      <span class="up-name">공격 연마</span>
      <span class="up-stat">공격 <b id="bs-up-atk">${fmt(totalDps())}</b> <i id="bs-up-next">→ ${fmt(totalDps() + atkPerUpgrade())}</i></span>
      <span class="up-cost" id="bs-up-cost">엽전 ${fmt(upgrades.atkUpgradeCost())}</span>
    </button>

    <div class="party-row" id="bs-party">${partyFlagsHtml(s)}</div>
  </section>`;
}

function partyFlagsHtml(s) {
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const id = s.party[i];
    if (!id) {
      slots.push(`<div class="hero-flag empty"><span class="flag-name">빈 자리</span></div>`);
      continue;
    }
    const def = heroDef(id);
    const hs = s.heroes[id];
    slots.push(`
      <div class="hero-flag f-${def.faction}">
        ${portraitHtml(id, 'flag-portrait')}
        <span class="flag-name">${def.name}</span>
        <span class="flag-level">${hs.level}</span>
      </div>`);
  }
  return slots.join('');
}

function updateFoe() {
  const s = getState();
  const enemy = battle.currentEnemy();
  const foeBox = document.getElementById('bs-foe');
  const nameEl = document.getElementById('bs-foe-name');
  const hpEl = document.getElementById('bs-foe-hp');
  const hintEl = document.getElementById('bs-hint');
  if (!foeBox || !nameEl) return;

  foeBox.classList.toggle('down', !enemy);
  if (enemy) {
    foeBox.classList.toggle('boss', enemy.boss);
    foeBox.classList.toggle('rival', Boolean(enemy.rival));
    nameEl.textContent = enemy.name;
    if (hpEl) hpEl.style.width = `${(enemy.hp / enemy.maxHp) * 100}%`;
  }

  if (battle.isRecovering()) {
    hintEl.textContent = '전열을 가다듬는 중…';
  } else if (battle.isBossPhase(s) && !battle.canBeatBoss(s)) {
    const gap = gatePower(battle.currentStage(s)) - partyPower(s);
    hintEl.textContent = `돌파까지 전투력 ${fmt(gap)} — 단련·승급·모집으로 채울 수 있어요`;
  } else if (battle.isBossPhase(s)) {
    hintEl.textContent = '우두머리와 맞붙는 중!';
  } else {
    hintEl.textContent = '';
  }
}

function updateUpgradeButton() {
  const s = getState();
  const btn = document.getElementById('bs-upgrade');
  if (!btn) return;
  const atk = totalDps();
  const cost = upgrades.atkUpgradeCost();
  const atkEl = document.getElementById('bs-up-atk');
  const nextEl = document.getElementById('bs-up-next');
  const costEl = document.getElementById('bs-up-cost');
  if (atkEl) atkEl.textContent = fmt(atk);
  if (nextEl) nextEl.textContent = `→ ${fmt(atk + atkPerUpgrade())}`;
  if (costEl) costEl.textContent = `엽전 ${fmt(cost)}`;
  btn.disabled = s.resources.coin < cost;
}

function updatePowers() {
  const s = getState();
  const ally = document.getElementById('bs-ally-power');
  const foe = document.getElementById('bs-foe-power');
  if (ally) ally.textContent = fmt(partyPower(s));
  if (foe) foe.textContent = fmt(gatePower(battle.currentStage(s)));
}

function foeAnchor() {
  const foeBox = document.getElementById('bs-foe');
  if (!foeBox) return null;
  const rect = foeBox.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

/** 숙적 조우 컷인 — 이름 깃발과 연의체 한마디가 전장을 가로지른다 */
function showRivalCutin(enemy) {
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  const line = RIVAL_LINES[enemy.rivalId] ?? RIVAL_LINE_DEFAULT;
  const name = enemy.name.replace('우두머리 ‧ ', '');
  const el = document.createElement('div');
  el.className = 'rival-cutin';
  el.innerHTML = `
    <div class="rc-band">
      <span class="rc-flag">${name}</span>
      <div class="rc-text">
        <b>숙적 조우</b>
        <span>${line}</span>
      </div>
    </div>`;
  layer.appendChild(el);
  play('rival');
  vibrate(40);
  setTimeout(() => el.remove(), 2100);
}

function updateCombo() {
  const btn = document.getElementById('bs-combo');
  if (!btn) return;
  btn.hidden = bondBonus(getState()) <= 0; // 인연이 있어야 합격이 있다
  const fill = document.getElementById('bs-combo-fill');
  if (fill) fill.style.height = `${battle.comboProgress() * 100}%`;
  btn.classList.toggle('ready', battle.comboReady());
}

function refreshGrowthViews() {
  updatePowers();
  updateFoe();
  updateUpgradeButton();
  updateCombo();
}

export function render(root) {
  destroy();
  const s = getState();
  root.insertAdjacentHTML('beforeend', template(s));
  updateFoe();
  updateUpgradeButton();
  updateCombo();

  const comboBtn = document.getElementById('bs-combo');
  comboBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 전장 터치 보상과 겹치지 않게
    if (!battle.fireCombo()) shake(comboBtn);
  });

  const field = document.getElementById('bs-field');
  field.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < BALANCE.battle.tapCooldownMs) return;
    lastTap = now;
    const coins = battle.tapReward();
    play('tap');
    if (coins > 0) floatText(e.clientX, e.clientY, `+${fmt(coins)}`, 'gold');
    pulse(field, 'field-tap');
  });

  const upBtn = document.getElementById('bs-upgrade');
  upBtn.addEventListener('click', (e) => {
    const before = totalDps();
    const res = upgrades.buyAtkUpgrade();
    if (!res) {
      shake(upBtn);
      const rect = upBtn.getBoundingClientRect();
      floatText(rect.left + rect.width / 2, rect.top, '엽전이 모자라요', 'warn');
      return;
    }
    pulse(upBtn);
    floatText(e.clientX, e.clientY, `공격 +${fmt(atkPerUpgrade())}`, 'gold');
    const atkEl = document.getElementById('bs-up-atk');
    if (atkEl) countUp(atkEl, before, totalDps(), { duration: 300, format: fmt });
  });

  unsubs.push(
    on('battle:spawn', ({ enemy }) => {
      updateFoe();
      if (enemy.rival) {
        if (!cutinSeen.has(enemy.rivalId)) {
          cutinSeen.add(enemy.rivalId);
          showRivalCutin(enemy); // 첫 조우만 풀 컷인
        } else {
          const at = foeAnchor();
          if (at) floatText(at.x, at.y - 10, '숙적이다!', 'alarm');
        }
        pulse(field, 'field-shake');
      } else if (enemy.boss) {
        const at = foeAnchor();
        if (at) floatText(at.x, at.y - 10, '우두머리 등장!', 'alarm');
        pulse(field, 'field-shake');
      }
    }),

    on('combo:charge', () => updateCombo()),

    on('combo:fired', ({ bond }) => {
      const fieldEl = document.getElementById('bs-field');
      if (fieldEl) {
        const rect = fieldEl.getBoundingClientRect();
        floatText(rect.left + rect.width / 2, rect.top + rect.height / 2 - 12, bond?.warcry ?? '협공!', 'alarm');
      }
      flash('ember');
      pulse(field, 'field-shake');
      play('combo');
      vibrate(30);
      updateCombo();
    }),

    on('rival:first', ({ jade }) => {
      const at = foeAnchor();
      if (at) floatText(at.x, at.y - 30, `숙적 격파! 보옥 +${fmt(jade)}`, 'victory');
    }),

    on('bounty:done', ({ jade }) => {
      const at = foeAnchor();
      if (at) floatText(at.x, at.y - 52, `현상수배 완수! 보옥 +${fmt(jade)}`, 'victory');
    }),

    on('battle:hit', ({ damage, hp, maxHp, attackerId }) => {
      const hpEl = document.getElementById('bs-foe-hp');
      if (hpEl) hpEl.style.width = `${(hp / maxHp) * 100}%`;
      const foeBox = document.getElementById('bs-foe');
      if (foeBox) pulse(foeBox, 'hit');
      const striker = document.querySelector(`.ally-unit[data-id="${attackerId}"]`);
      if (striker) pulse(striker, 'lunge');
      const at = foeAnchor();
      if (at) floatText(at.x + (Math.random() * 26 - 13), at.y + 10, `-${fmt(damage)}`);
    }),

    on('battle:death', ({ boss }) => {
      const at = foeAnchor();
      if (at) burst(at.x, at.y + 26, { count: boss ? 12 : 7 });
      if (boss) {
        flash('ember'); // 다홍 승전빛 — 금색은 전설의 것으로 아껴 둔다
        pulse(field, 'field-shake');
        vibrate(40);
      }
      updateFoe();
    }),
    on('battle:allies', () => updateAllies()),

    on('battle:wipe', () => {
      const f = document.getElementById('bs-field');
      if (f) {
        f.classList.add('wiped');
        const rect = f.getBoundingClientRect();
        floatText(rect.left + rect.width / 2, rect.top + rect.height / 2, '전열 붕괴!', 'warn');
      }
      updateFoe();
    }),
    on('battle:recover', () => {
      const f = document.getElementById('bs-field');
      if (f) f.classList.remove('wiped');
      updateFoe();
      updateAllies();
    }),

    on('stage:kill', ({ kills, coins }) => {
      const killsEl = document.getElementById('bs-kills');
      if (killsEl) {
        killsEl.textContent = kills;
        pulse(killsEl);
      }
      const at = foeAnchor();
      if (at) floatText(at.x, at.y - 6, `+${fmt(coins)}`, 'gold');
      // 우두머리 직전 — 북이 울린다 (긴장 빌드업)
      if (kills === BALANCE.battle.killsPerStage - 1 && battle.canBeatBoss(getState())) {
        const fieldEl = document.getElementById('bs-field');
        if (fieldEl) {
          const rect = fieldEl.getBoundingClientRect();
          floatText(rect.left + rect.width / 2, rect.top + 40, '북이 울린다…', 'alarm');
        }
        play('drum');
        vibrate(20);
      }
    }),

    on('stage:clear', () => {
      const fieldEl = document.getElementById('bs-field');
      if (fieldEl) {
        const rect = fieldEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        floatText(cx, rect.top + rect.height / 2, '돌파!', 'victory');
        floatText(cx, rect.top + rect.height / 2 + 34, `보옥 +${fmt(BALANCE.battle.jadeOnClear)}`, 'gold');
      }
      const rootEl = document.getElementById('screen-root');
      if (rootEl) {
        rootEl.innerHTML = '';
        render(rootEl);
      }
    }),

    // 단련·승급·모집·편성은 전투력을 바꾸고, 공격력은 전투력에서 파생된다
    on('hero:level', refreshGrowthViews),
    on('hero:star', refreshGrowthViews),
    on('hero:add', () => {
      refreshGrowthViews();
      const partyEl = document.getElementById('bs-party');
      if (partyEl) partyEl.innerHTML = partyFlagsHtml(getState());
    }),
    on('party', () => {
      refreshGrowthViews();
      const partyEl = document.getElementById('bs-party');
      if (partyEl) partyEl.innerHTML = partyFlagsHtml(getState());
      updateAllies();
    })
  );

  // 전장 게이지 — 처치 수 + 현재 적에게 입힌 피해 비율
  // 요소 참조는 한 번만 잡고, 값이 변할 때만 쓴다 (저사양 기기 보호)
  const gaugeFill = document.getElementById('bs-kill-fill');
  let gaugeLast = -1;
  function gauge() {
    if (gaugeFill) {
      const s2 = getState();
      const base = Math.min(s2.stage.kills, BALANCE.battle.killsPerStage);
      const pct = Math.min(100, ((base + battle.killProgress()) / (BALANCE.battle.killsPerStage + 1)) * 100);
      const rounded = Math.round(pct * 10) / 10;
      if (rounded !== gaugeLast) {
        gaugeLast = rounded;
        gaugeFill.style.width = `${rounded}%`;
      }
    }
    rafId = requestAnimationFrame(gauge);
  }
  rafId = requestAnimationFrame(gauge);
}

export function destroy() {
  for (const off of unsubs) off();
  unsubs = [];
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}
