// 전투 화면 — 편성 전원이 전장에 서서 싸우는 메인 무대
// 전투 계산은 systems/battle.js가 하고, 이 파일은 이벤트를 구독해 그리기만 한다.

import { on } from '../core/events.js';
import { getState, setSetting, noteBestPower } from '../core/state.js';
import * as battle from '../systems/battle.js';
import { totalDps, atkPerUpgrade } from '../systems/hero-unit.js';
import * as upgrades from '../systems/upgrades.js';
import { partyPower, heroDef, bondBonus } from '../systems/growth.js';
import { BALANCE } from '../data/balance.js';
import { RIVAL_LINES, RIVAL_LINE_DEFAULT } from '../data/rivals.js';
import { fmt } from './format.js';
import { floatText, pulse, shake, countUp, burst, flash, flyCoins } from './effects.js';
import { play, vibrate, setBgmMood, playHit, playFoeStrike, playHoof } from './sound.js';
import { portraitHtml } from './portrait.js';
import * as tower from '../systems/tower.js';
import { openTower } from './tower-modal.js';

function towerTriesLeftLabel() {
  return `${tower.triesLeft()}회`;
}

let unsubs = [];
let rafId = 0;
let lastTap = 0;
let capNudged = false;      // 이 적에게서 '상한 도달' 안내를 이미 띄웠는가 (2-4)
let capNudgeCount = 0;      // 세션 누적 — 몇 번 알린 뒤엔 침묵(소음 방지)
let comboHintShown = false; // 협공 첫 등장 안내를 이번 화면에서 띄웠는가 (2-6)
const cutinSeen = new Set(); // 숙적 컷인은 접속당 한 번 — 재조우는 짧게

function foeSvg(bandColor) {
  return `
  <svg viewBox="0 0 64 72" class="foe-figure" aria-hidden="true">
    <circle cx="32" cy="20" r="11"></circle>
    <path d="M32 33 C20 33 13 42 12 58 L52 58 C51 42 44 33 32 33 Z"></path>
    <rect x="20" y="13.4" width="24" height="5" rx="2.5" fill="${bandColor}" transform="rotate(-6 32 16)"></rect>
  </svg>`;
}

// 프레임 애니메이션 + 의사 리깅 — 같은 스프라이트를 허리에서 상·하체 두 층으로 잘라
// 상체가 따로 흔들리고(대기), 공격 순간 크게 휘두른다. 진짜 관절이 있는 것처럼 보인다.
function unitImg(idleSrc, atkSrc) {
  const img = (cls) =>
    `<img class="portrait unit-face ${cls}" src="${idleSrc}" data-idle="${idleSrc}" data-atk="${atkSrc}" alt="" loading="lazy" draggable="false">`;
  return `<div class="rig">${img('rig-lower')}${img('rig-upper')}</div>`;
}

/** 포즈 전환 — 리그의 두 층을 함께 공격 프레임으로 바꿨다가 되돌린다 */
function poseSwap(root, ms = 330) {
  const imgs = root?.querySelectorAll?.('.unit-face');
  if (!imgs || imgs.length === 0) return;
  for (const img of imgs) if (img.dataset.atk) img.src = img.dataset.atk;
  setTimeout(() => {
    for (const img of imgs) {
      if (img.isConnected && img.dataset.idle) img.src = img.dataset.idle;
    }
  }, ms);
}

// 아군은 실제 영웅 초상이 전장에 선다 — "내 캐릭터가 싸운다"는 감각
function alliesHtml() {
  return battle
    .alliesSnapshot()
    .map(
      (u) => `
    <div class="ally-unit${u.hp <= 0 ? ' down' : ''}" data-id="${u.id}">
      <div class="unit-hp ally-hp"><i style="width:${(u.hp / u.maxHp) * 100}%"></i></div>
      <div class="unit-sprite f-${u.faction}" style="--img:url('./assets/heroes-cut/${u.id}.png')">
        ${unitImg(`./assets/heroes-cut/${u.id}.png`, `./assets/heroes-atk-cut/${u.id}.png`)}
      </div>
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
  line.dataset.n = units.length; // V자 대형은 인원수에 따라 (CSS data-n)
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

/** 화면에 보여주는 '돌파' 수치 = 다가올(또는 지금) 보스전에 필요한 전투력 */
function gatePower(s) {
  return battle.nextBossGate(s);
}

/** 관문 수치가 '어느 전장 기준'인지 라벨 — 미래 관문을 현재형 '부족'으로 오독하지 않게 (2-3) */
function gateLabel(s) {
  return battle.isBossStage(s) ? '이번 관문' : `${battle.nextBossIndex(s)}전장 관문`;
}

/** 지금 실제로 우두머리에게 막혀 있는가 — 붉은 경보색은 이 순간에만 (2-3) */
function isBlocked(s) {
  return battle.isBossStage(s) && battle.isBossPhase(s) && !battle.canBeatBoss(s);
}

function chapterBand(s = getState()) {
  const chapter = battle.currentChapter(s);
  return ['#C8A93A', '#8A3A34', '#7A6A9E', '#4F6FA0'][(chapter.id - 1) % 4];
}

/** 적의 갑주에 따른 타격음 프로필 — 역사적 병종에 맞춘 소리 (칼·갑옷·가죽·묵직) */
function enemyHitProfile(s, enemy) {
  if (!enemy) return 'armor';
  if (enemy.rival) return 'blade'; // 숙적 영웅 — 검 대 검
  if (enemy.boss) return 'heavy';  // 우두머리 — 묵직한 일격
  const art = battle.currentChapter(s).foeArt;
  if (art === 'yellow-turban') return 'cloth'; // 황건적 — 농기구·천, 쇳소리 없음
  if (art === 'nanman-soldier') return 'hide';  // 남만 — 가죽·뼈
  return 'armor'; // 정규 병사 — 갑옷·검
}

/** 적의 그림 결정 — 숙적 영웅 > 우두머리 전용 아트 > 장 잡병 아트 > (비상) 그림자 SVG */
function foeFigure(s, enemy) {
  if (enemy?.rival && enemy.rivalId) {
    return {
      key: `rival:${enemy.rivalId}`,
      html: `<div class="unit-sprite rival-sprite" style="--img:url('./assets/heroes-cut/${enemy.rivalId}.png')">
        ${unitImg(`./assets/heroes-cut/${enemy.rivalId}.png`, `./assets/heroes-atk-cut/${enemy.rivalId}.png`)}
      </div>`,
    };
  }
  const stage = battle.currentStage(s);
  const art = enemy?.boss && stage.bossArt ? stage.bossArt : battle.currentChapter(s).foeArt;
  if (art) {
    return {
      key: `art:${art}`,
      html: `<div class="unit-sprite foe-sprite" style="--img:url('./assets/enemies-cut/${art}.png')">
        ${unitImg(`./assets/enemies-cut/${art}.png`, `./assets/enemies-atk-cut/${art}.png`)}
      </div>`,
    };
  }
  return { key: 'shadow', html: foeSvg(chapterBand(s)) };
}

/** 일반 전장은 "다음 전장까지 N명", 보스 전장(5·10)은 "우두머리까지 N명".
 *  다 무찔렀는데 전투력이 모자라면 막혀 있다는 사실을 숨기지 않는다. */
function killLineText(s) {
  const left = BALANCE.battle.killsPerStage - s.stage.kills;
  if (!battle.isBossStage(s)) {
    return left > 0 ? `다음 전장까지 <b>${left}</b>명` : '전장 돌파!';
  }
  if (left > 0) return `우두머리까지 <b>${left}</b>명`;
  return battle.canBeatBoss(s) ? '우두머리와 결전!' : '우두머리가 길을 막았다!';
}

function template(s) {
  const chapter = battle.currentChapter(s);
  const stage = battle.currentStage(s);
  const bandColor = chapterBand(s);
  const diff = s.stage.difficulty ?? 1;

  return `
  <section class="screen battle-screen">
    <header class="stage-plate">
      <div class="stage-chapter">${diff > 1 ? `난이도 ${diff} ‧ ` : ''}${chapter.id}장 ‧ ${chapter.name}</div>
      <h1 class="stage-name" id="bs-stage-name">${stage.name}</h1>
      <div class="stage-step">${s.stage.index} / ${chapter.stages.length} 전장${battle.isBossStage(s) ? ' ‧ 우두머리전' : ''}</div>
      <div class="weekday-perk">${battle.weekdayPerk().name} — 오늘 엽전 +${Math.round((battle.weekdayPerk().coinMult - 1) * 100)}%</div>
    </header>

    <div class="battlefield${battle.currentEnemy() ? '' : ' marching'}" id="bs-field">
      <div class="field-bg" id="bs-field-bg"${chapter.env ? ` style="background-image:url('./assets/bg/${chapter.env}.png')"` : ''}></div>
      <div class="field-ground" id="bs-field-ground" aria-hidden="true"></div>
      <div class="field-shade" aria-hidden="true"></div>
      <div class="field-ambience" aria-hidden="true">
        <i class="fog"></i>
        ${Array.from({ length: 6 }, (_, i) => `<i class="ember" style="--x:${10 + i * 14}%; --d:-${(i * 2.3).toFixed(1)}s"></i>`).join('')}
      </div>
      <div class="scroll-strip" aria-hidden="true" id="bs-scroll">${chapter.name}</div>

      <div class="boss-banner" id="bs-boss-banner" hidden>
        <span class="bb-name" id="bs-boss-name"></span>
        <div class="bb-track"><i id="bs-boss-hp" style="width:100%"></i></div>
      </div>

      <div class="foe down" id="bs-foe">
        <div class="unit-hp foe-hp"><i id="bs-foe-hp" style="width:100%"></i></div>
        <div id="bs-foe-figure">${foeFigure(s, null).html}</div>
        <div class="unit-name foe-name" id="bs-foe-name">${chapter.foe}</div>
      </div>

      ${chapter.foeArt ? `
      <div class="foe-backline" aria-hidden="true" id="bs-backline">
        <img class="portrait back-mob m1" src="./assets/enemies-cut/${chapter.foeArt}.png" alt="">
        <img class="portrait back-mob m2" src="./assets/enemies-cut/${chapter.foeArt}.png" alt="">
        <img class="portrait back-mob m3" src="./assets/enemies-cut/${chapter.foeArt}.png" alt="">
      </div>` : ''}

      <div class="ally-line" id="bs-allies" data-n="${battle.alliesSnapshot().length}">${alliesHtml()}</div>

      <button class="combo-btn" id="bs-combo" hidden aria-label="협공 발동">
        <i class="combo-fill" id="bs-combo-fill"></i>
        <span class="combo-label">협공</span>
      </button>

      <div class="tap-hint">전장을 터치하면 엽전이 떨어져요</div>

      <button class="speed-btn" id="bs-speed" aria-label="전투 배속">x${s.settings?.speed || 1}</button>
    </div>

    <div class="battle-status">
      <div class="status-top">
        <span class="kill-info" id="bs-kill-line">${killLineText(s)}</span>
        <span class="power-line" id="bs-power-line">
          내 전투력 <b id="bs-ally-power">${fmt(partyPower(s))}</b>
          <i class="vs-mark"></i>
          <span id="bs-gate-label">${gateLabel(s)}</span> <b id="bs-foe-power">${fmt(gatePower(s))}</b>
        </span>
      </div>
      <div class="kill-bar"><i id="bs-kill-fill"></i></div>
      <p class="battle-hint" id="bs-hint"></p>
    </div>

    <button class="atk-upgrade" id="bs-upgrade">
      <svg class="btn-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 16.5 L13 7 M10.6 3.8 L16.2 9.4 M4 12.6 L7.4 16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
      <span class="up-name">공격 연마</span>
      <span class="up-stat">공격 <b id="bs-up-atk">${fmt(totalDps())}</b> <i id="bs-up-next">→ ${fmt(totalDps() + atkPerUpgrade())}</i></span>
      <span class="up-cost" id="bs-up-cost">엽전 ${fmt(upgrades.atkUpgradeCost())}</span>
    </button>

    <button class="tower-btn" id="bs-tower">
      <svg class="btn-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 17 V9.5 H14.5 V17 M3.5 9.5 H16.5 M7 9.5 V5.5 H13 V9.5 M8.8 5.5 V3 H11.2 V5.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>
      <span class="up-name">시련의 탑</span>
      <span class="up-stat" id="bs-tower-note">최고 ${fmt(s.records?.bestTower ?? 0)}층 ‧ 오늘 ${towerTriesLeftLabel(s)}</span>
    </button>

    <div class="party-row" id="bs-party">${partyFlagsHtml(s)}</div>
  </section>`;
}

function partyFlagsHtml(s) {
  // 단일 메인 구조 — 전장에 서는 메인 영웅 하나를 크게 보여준다. 탭하면 영웅 화면으로.
  const id = s.party[0];
  if (!id) {
    return `<div class="hero-flag empty main-flag"><span class="flag-name">메인 영웅을 정하세요</span></div>`;
  }
  const def = heroDef(id);
  const hs = s.heroes[id];
  return `
    <div class="hero-flag main-flag f-${def.faction}">
      ${portraitHtml(id, 'flag-portrait')}
      <div class="main-flag-info">
        <span class="flag-role">메인 영웅</span>
        <span class="flag-name">${def.name}</span>
        <span class="flag-level">Lv.${hs.level} ‧ ${'★'.repeat(hs.stars)}</span>
      </div>
    </div>`;
}

let foeFigureKey = ''; // 지금 그려진 적 모습 ('mob' 또는 rival:영웅id) — 바뀔 때만 다시 그린다
let shownChapterKey = ''; // 지금 그려진 '난이도:장' — 바뀌면 개막 카드를 띄운다

/** 뒤쪽 적 무리 — 남은 처치 수만큼 두텁다. 베어 나갈수록 무리가 줄어 "뚫고 있다"가 보인다 */
function updateBackline(s = getState()) {
  const back = document.getElementById('bs-backline');
  if (!back) return;
  const left = BALANCE.battle.killsPerStage - s.stage.kills;
  const want = left >= 7 ? 3 : left >= 4 ? 2 : left >= 2 ? 1 : 0;
  [...back.children].forEach((mob, i) => mob.classList.toggle('gone', i >= want));
}

/** 우두머리 체력바 — 결전에는 전장 상단에 대형 바가 걸린다 */
function updateBossBanner(enemy) {
  const banner = document.getElementById('bs-boss-banner');
  if (!banner) return;
  const show = Boolean(enemy?.boss);
  if (banner.hidden === !show) {
    // 상태 그대로 — 체력만 갱신
  } else {
    banner.hidden = !show;
    if (show) pulse(banner, 'bb-in');
  }
  if (show) {
    const nameEl = document.getElementById('bs-boss-name');
    if (nameEl && nameEl.textContent !== enemy.name) nameEl.textContent = enemy.name;
    const hpEl = document.getElementById('bs-boss-hp');
    if (hpEl) hpEl.style.width = `${(enemy.hp / enemy.maxHp) * 100}%`;
  }
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
  updateBossBanner(enemy);
  updateBackline(s);
  if (enemy) {
    foeBox.classList.toggle('boss', enemy.boss);
    foeBox.classList.toggle('rival', Boolean(enemy.rival));
    nameEl.textContent = enemy.name;
    if (hpEl) hpEl.style.width = `${(enemy.hp / enemy.maxHp) * 100}%`;

    // 적의 모습 — 숙적은 그 영웅, 이름 있는 우두머리는 전용 아트, 잡병은 장(章)의 병사
    const fig = document.getElementById('bs-foe-figure');
    const { key, html } = foeFigure(s, enemy);
    if (fig && key !== foeFigureKey) {
      foeFigureKey = key;
      fig.innerHTML = html;
    }
  }

  updateHint(s, hintEl);
}

let hintKey = ''; // 지금 그려진 힌트의 상태 키 — 바뀔 때만 DOM을 다시 만든다 (터치 씹힘 방지)

/** 막힘 안내를 '말'이 아니라 '문'으로 — 벽에 막히면 성장·모집으로 데려다주는 탭 가능한 CTA (2-1) */
function updateHint(s, hintEl) {
  const blocked = isBlocked(s);
  // 막혔을 때 더 큰 지렛대(모집)를 우선: 옥구슬이 1회 모집분 이상이면 모집, 아니면 단련
  const canPull = (s.resources.jade ?? 0) >= BALANCE.gacha.costSingle;
  let key, html;
  if (battle.isRecovering()) {
    key = 'recover';
    html = '<span class="battle-hint-text">전열을 가다듬는 중…</span>';
  } else if (blocked) {
    const gap = fmt(gatePower(s) - partyPower(s));
    key = canPull ? 'blocked-gacha' : 'blocked-train';
    html = canPull
      ? `<button class="battle-cta" data-dest="gacha">전투력 ${gap} 부족 — <b>새 장수 모집하러 가기 →</b></button>`
      : `<button class="battle-cta" data-dest="heroes">전투력 ${gap} 부족 — <b>영웅 단련하러 가기 →</b></button>`;
  } else if (battle.isBossPhase(s)) {
    key = 'boss';
    html = '<span class="battle-hint-text">우두머리와 맞붙는 중!</span>';
  } else if (s.resources.coin >= upgrades.atkUpgradeCost()) {
    key = 'coin';
    html = '<span class="battle-hint-text">엽전이 모였어요 — 아래 [공격 연마]를 누르면 더 세져요</span>';
  } else {
    key = 'none';
    html = '';
  }
  if (key !== hintKey) {
    hintKey = key;
    hintEl.innerHTML = html;
    hintEl.classList.toggle('has-cta', key.startsWith('blocked'));
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
  btn.classList.toggle('can-buy', !btn.disabled); // 살 수 있으면 은은히 빛난다 — "여길 누르세요"
}

function updatePowers() {
  const s = getState();
  const ally = document.getElementById('bs-ally-power');
  const foe = document.getElementById('bs-foe-power');
  if (ally) ally.textContent = fmt(partyPower(s));
  if (foe) foe.textContent = fmt(gatePower(s));
  const label = document.getElementById('bs-gate-label');
  if (label) label.textContent = gateLabel(s);
  // 붉은 경보색은 '지금 실제로 막힌' 순간에만 — 미래 관문 수치를 부족으로 오독하지 않게 (2-3)
  const line = document.getElementById('bs-power-line');
  if (line) line.classList.toggle('lack', isBlocked(s));
}

function foeAnchor() {
  const foeBox = document.getElementById('bs-foe');
  if (!foeBox) return null;
  const rect = foeBox.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

/** 베기 이펙트 — 그려진 VFX 스프라이트 (screen 블렌드로 검정이 사라진다) + 충격 링 */
function spawnSlash(foeBox, heavy = false) {
  const mark = document.createElement('img');
  mark.className = heavy ? 'slash-img heavy' : 'slash-img';
  mark.src = './assets/ui/fx-slash.png';
  mark.alt = '';
  mark.style.setProperty('--slash-rot', `${Math.round(-55 + Math.random() * 110)}deg`);
  foeBox.appendChild(mark);
  const ring = document.createElement('i');
  ring.className = 'impact-ring';
  foeBox.appendChild(ring);
  setTimeout(() => {
    mark.remove();
    ring.remove();
  }, 320);
}

/** 폭발 이펙트 — 처치 순간 (우두머리는 크게) */
function spawnBurst(fieldEl, big = false) {
  const b = document.createElement('img');
  b.className = big ? 'burst-img big' : 'burst-img';
  b.src = './assets/ui/fx-burst.png';
  b.alt = '';
  fieldEl.appendChild(b);
  setTimeout(() => b.remove(), 460);
}

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 히트스톱 — 검이 닿는 프레임에 전장의 애니메이션을 잠깐 얼린다 */
function hitStop(field, ms) {
  if (reducedMotion || !field) return;
  field.classList.add('freeze');
  setTimeout(() => field.classList.remove('freeze'), ms);
}

/** 카메라 셰이크 — 진폭을 정하고 감쇠 흔들림 */
function shakeField(field, amp, big = false) {
  if (reducedMotion || !field) return;
  field.style.setProperty('--amp', amp);
  pulse(field, big ? 'shake-big' : 'shake-hit');
}

/** 평타 잽 — 짧은 찌르기. 초당 여러 타에서도 모션이 밀리지 않는다 */
function jab(unit) {
  if (!unit || unit.classList.contains('jab')) return;
  poseSwap(unit, 180);
  unit.classList.add('jab');
  setTimeout(() => unit.classList.remove('jab'), 200);
}

/** 돌진 공격 — 움찔(예비동작) → 적의 코앞까지 질주 → 내리치고 → 반동으로 복귀.
 *  출발 자리에는 흙먼지가 인다. */
function dashAttack(unit, foeBox) {
  if (unit.classList.contains('dash')) return; // 이미 달리는 중
  const u = unit.getBoundingClientRect();
  const f = foeBox.getBoundingClientRect();
  const dx = f.left + f.width / 2 - (u.left + u.width / 2) - 30; // 몸 하나 앞에서 멈춘다
  const dy = f.top + f.height * 0.55 - (u.top + u.height * 0.5);
  unit.style.setProperty('--dx', `${Math.round(dx)}px`);
  unit.style.setProperty('--dy', `${Math.round(dy)}px`);
  unit.classList.add('dash');
  setTimeout(() => unit.classList.remove('dash'), 470);

  const line = unit.parentElement;
  if (line) {
    const dust = document.createElement('i');
    dust.className = 'dash-dust';
    dust.style.left = `${unit.offsetLeft + unit.offsetWidth / 2}px`;
    line.appendChild(dust);
    setTimeout(() => dust.remove(), 380);
  }

  // 내리치는 순간(전체 0.56s의 48%) — 공격 프레임으로 전환 + 무기 궤적
  setTimeout(() => {
    if (!unit.isConnected) return;
    poseSwap(unit, 330);
    const arc = document.createElement('i');
    arc.className = 'swing-arc';
    unit.appendChild(arc);
    setTimeout(() => arc.remove(), 240);
  }, 170);
}

/** 장(章) 개막 카드 — 새 장이 열리는 순간, 먹빛 화면에 장 제목이 붓으로 찍힌다 */
function showChapterCard(chapter, difficulty) {
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'chapter-card';
  el.innerHTML = `
    <div class="cc-ink">
      <span class="cc-step">난이도 ${difficulty} ‧ 제${chapter.id}장</span>
      <b class="cc-title">${chapter.name}</b>
      <span class="cc-sub">천하통일의 길</span>
    </div>`;
  layer.appendChild(el);
  play('chapter');
  vibrate(20);
  setTimeout(() => el.remove(), 2200);
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
  const has = bondBonus(getState()) > 0;
  btn.hidden = !has; // 인연이 있어야 협공이 있다
  // 협공 버튼이 처음 등장하면 무엇인지 한 번만 알린다 (2-6)
  if (has && !comboHintShown) {
    comboHintShown = true;
    const r = btn.getBoundingClientRect();
    if (r.width) floatText(r.left + r.width / 2, r.top - 4, '인연 협공! 가득 차면 터뜨려요', 'gold');
  }
  const fill = document.getElementById('bs-combo-fill');
  if (fill) fill.style.height = `${battle.comboProgress() * 100}%`;
  btn.classList.toggle('ready', battle.comboReady());
}

function refreshGrowthViews() {
  updatePowers();
  updateFoe();
  updateUpgradeButton();
  updateCombo();
  noteBestPower(partyPower(getState())); // 마일스톤 감지
}

export function render(root) {
  destroy();
  const s = getState();
  root.insertAdjacentHTML('beforeend', template(s));
  foeFigureKey = foeFigure(s, null).key; // template은 잡병 아트로 그린다
  shownChapterKey = `${s.stage.difficulty ?? 1}:${battle.currentChapter(s).id}`;
  hintKey = ''; // 새 화면 — 힌트도 처음부터 다시 그린다
  capNudged = false;
  comboHintShown = false;
  updateFoe();
  updatePowers(); // 부족(붉은 표시) 상태를 첫 화면부터 정확히
  updateUpgradeButton();
  updateCombo();

  // 벽 막힘 CTA — 힌트 안의 버튼을 눌러 성장·모집으로 이동 (2-1)
  document.getElementById('bs-hint').addEventListener('click', (e) => {
    const cta = e.target.closest('.battle-cta');
    if (!cta) return;
    vibrate(8);
    document.querySelector(`.tab[data-tab="${cta.dataset.dest}"]`)?.click();
  });

  // 하단 파티 깃발 줄 — 탭하면 영웅(편성) 화면으로. 빈 자리는 편성 안내 (2-2)
  const partyRow = document.getElementById('bs-party');
  if (partyRow) {
    partyRow.addEventListener('click', (e) => {
      const flag = e.target.closest('.hero-flag');
      if (!flag) return;
      vibrate(8);
      pulse(flag);
      if (flag.classList.contains('empty')) {
        const r = flag.getBoundingClientRect();
        floatText(r.left + r.width / 2, r.top, '영웅을 편성하세요', 'gold');
      }
      document.querySelector('.tab[data-tab="heroes"]')?.click();
    });
  }

  const comboBtn = document.getElementById('bs-combo');
  comboBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 전장 터치 보상과 겹치지 않게
    if (!battle.fireCombo()) {
      shake(comboBtn);
      // 왜 안 터지는지 — 충전 중임을 알려준다 (2-6)
      if (!battle.comboReady()) {
        const r = comboBtn.getBoundingClientRect();
        floatText(r.left + r.width / 2, r.top, `충전 중 ${Math.round(battle.comboProgress() * 100)}%`, 'warn');
      }
    }
  });

  // 시련의 탑
  document.getElementById('bs-tower').addEventListener('click', () => openTower());
  const refreshTowerNote = () => {
    const note = document.getElementById('bs-tower-note');
    if (note) note.textContent = `최고 ${fmt(getState().records?.bestTower ?? 0)}층 ‧ 오늘 ${towerTriesLeftLabel()}`;
  };
  unsubs.push(on('tower:climb', refreshTowerNote));

  const field = document.getElementById('bs-field');
  field.classList.toggle('speed2', (s.settings?.speed || 1) >= 2);

  // 배속 토글 x1 ↔ x2 — 다리도 세상 흐름만큼 빨라진다
  const speedBtn = document.getElementById('bs-speed');
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = (getState().settings?.speed || 1) >= 2 ? 1 : 2;
    setSetting('speed', next);
    speedBtn.textContent = `x${next}`;
    field.classList.toggle('speed2', next >= 2);
    pulse(speedBtn);
  });
  field.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < BALANCE.battle.tapCooldownMs) return;
    lastTap = now;
    const coins = battle.tapReward();
    play('tap');
    if (coins > 0) {
      floatText(e.clientX, e.clientY, `+${fmt(coins)}`, 'gold');
      flyCoins(e.clientX, e.clientY, 2);
    } else if (!capNudged && capNudgeCount < 3) {
      // 상한 도달 — 왜 더 안 나오는지 정직하게 알린다 (2-4). 세션 3회 뒤엔 침묵(소음 방지).
      capNudged = true;
      capNudgeCount += 1;
      floatText(e.clientX, e.clientY, '다음 적에게서 더 나와요', '');
      const hint = document.getElementById('bs-hint');
      if (hint && hintKey === 'none') {
        hint.innerHTML = '<span class="battle-hint-text">적을 처치하면 다시 터치 보상!</span>';
        hintKey = 'tap-cap';
      }
    }
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
      capNudged = false; // 새 적 — 터치 상한 안내도 새로
      updateFoe();
      field.classList.remove('marching'); // 적을 만나면 행군을 멈춘다
      const foeBox = document.getElementById('bs-foe');
      if (foeBox) pulse(foeBox, 'arrive'); // 행군 끝에서 적이 걸어 들어온다
      setBgmMood(enemy.boss); // 우두머리 앞에선 북이 촘촘해진다
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
        pulse(field, 'boss-vignette'); // 화면 가장자리가 붉게 조여든다
      }
    }),

    on('combo:charge', () => updateCombo()),

    on('combo:fired', ({ bond }) => {
      const fieldEl = document.getElementById('bs-field');
      if (fieldEl) {
        const rect = fieldEl.getBoundingClientRect();
        floatText(rect.left + rect.width / 2, rect.top + rect.height / 2 - 12, bond?.warcry ?? '협공!', 'alarm');
      }
      // 전원 연속 돌진 — 협공다운 러시
      const foeBox = document.getElementById('bs-foe');
      if (foeBox) {
        [...document.querySelectorAll('.ally-unit:not(.down)')].forEach((u, i) =>
          setTimeout(() => foeBox.isConnected && dashAttack(u, foeBox), i * 80)
        );
      }
      flash('ember');
      pulse(field, 'field-shake');
      play('combo');
      vibrate(30);
      updateCombo();
    }),

    on('rival:first', ({ jade }) => {
      const at = foeAnchor();
      if (at) floatText(at.x, at.y - 30, `숙적 격파! 옥구슬 +${fmt(jade)}`, 'victory');
    }),

    on('bounty:done', ({ jade }) => {
      const at = foeAnchor();
      if (at) floatText(at.x, at.y - 52, `현상수배 완수! 옥구슬 +${fmt(jade)}`, 'victory');
    }),

    on('battle:hit', ({ damage, hp, maxHp, attackerId }) => {
      const hpEl = document.getElementById('bs-foe-hp');
      if (hpEl) hpEl.style.width = `${(hp / maxHp) * 100}%`;
      const bossHp = document.getElementById('bs-boss-hp');
      if (bossHp) bossHp.style.width = `${(hp / maxHp) * 100}%`;
      const foeBox = document.getElementById('bs-foe');
      const striker = document.querySelector(`.ally-unit[data-id="${attackerId}"]`);
      const F = BALANCE.feel;
      const heavy = damage >= totalDps() * F.heavyRatio;

      if (striker && foeBox) dashAttack(striker, foeBox); // 앞의 적에게 달려들어 벤다

      // 검이 닿는 프레임(impactMs)에 모든 확인을 정렬: 섬광·베기·정지·흔들림·숫자·진동
      setTimeout(() => {
        if (!(foeBox && foeBox.isConnected)) return;
        pulse(foeBox, 'hit');
        spawnSlash(foeBox, heavy);
        hitStop(field, heavy ? F.heavyStopMs : F.hitStopMs);
        shakeField(field, heavy ? F.shakeBig : F.shakeHit, heavy);
        const at = foeAnchor();
        // 숫자는 넓게 흩뿌려 겹침을 줄인다 — 일반은 작게(dmg), 강타만 크게(crit)
        if (at) {
          floatText(
            at.x + (Math.random() * 56 - 28),
            at.y + Math.random() * 24 - 10,
            `-${fmt(damage)}`,
            heavy ? 'crit' : 'dmg'
          );
        }
        // 적의 갑주에 맞는 타격음 — 검이 닿는 바로 그 프레임에 (싱크). 평타는 내부에서 솎아낸다.
        playHit(enemyHitProfile(getState(), battle.currentEnemy()), { heavy });
        if (heavy) vibrate(15);
      }, F.impactMs);
    }),

    // 적의 반격 — 적이 공격 프레임으로 도약하고, 몸이 닿는 순간(도약 정점)에
    // 아군이 붉게 휘청이며 피해 숫자가 뜬다. 일방적으로 맞기만 하는 적은 없다.
    on('battle:foeStrike', ({ targetId, damage, boss }) => {
      const foeBox = document.getElementById('bs-foe');
      if (foeBox) {
        pulse(foeBox, 'strike');
        setTimeout(() => poseSwap(foeBox, 300), 100);
      }
      // foe-dash(0.34s)의 정점 ≈ 170ms — 여기에 피격을 정렬한다
      setTimeout(() => {
        const victim = document.querySelector(`.ally-unit[data-id="${targetId}"]`);
        if (!victim) return;
        pulse(victim, 'hurt');
        const r = victim.getBoundingClientRect();
        floatText(
          r.left + r.width / 2 + (Math.random() * 20 - 10),
          r.top + Math.random() * 12,
          `-${fmt(damage)}`,
          'foe-dmg'
        );
        playFoeStrike(boss); // 아군이 막아내는 둔탁한 충돌 — 우두머리는 묵직하게
        if (boss) {
          shakeField(field, BALANCE.feel.shakeHit);
          vibrate(10); // 우두머리의 일격만 손에 전해진다
        }
      }, 170);
    }),

    on('battle:death', ({ boss }) => {
      // 쓰러지는 연출 — 사라지기 전에 옆으로 넘어간다
      const foeBox = document.getElementById('bs-foe');
      const fieldEl = document.getElementById('bs-field');
      if (foeBox && fieldEl && !foeBox.classList.contains('down')) {
        const ghost = foeBox.cloneNode(true);
        ghost.removeAttribute('id');
        for (const n of ghost.querySelectorAll('[id]')) n.removeAttribute('id');
        ghost.classList.add('foe-corpse');
        fieldEl.appendChild(ghost);
        setTimeout(() => ghost.remove(), 650);
      }
      const at = foeAnchor();
      if (at) burst(at.x, at.y + 26, { count: boss ? 12 : 7 });
      if (fieldEl) spawnBurst(fieldEl, boss); // 그려진 폭발
      if (boss) setBgmMood(false); // 결전이 끝나면 장단도 가라앉는다
      // 모든 처치에 마무리 손맛 — 정지 + (잡몹) 흔들림·짧은 진동
      hitStop(field, boss ? BALANCE.feel.bossStopMs : BALANCE.feel.killStopMs);
      if (boss) {
        flash('ember'); // 다홍 승전빛 — 금색은 전설의 것으로 아껴 둔다
        pulse(field, 'boss-zoom'); // 카메라 펀치 (셰이크와 겹치지 않게 줌만)
        vibrate(40);
        if (fieldEl) {
          const ray = document.createElement('i');
          ray.className = 'boss-burst';
          fieldEl.appendChild(ray);
          setTimeout(() => ray.remove(), 520);
        }
      } else {
        shakeField(field, '3px', true);
        vibrate(12);
      }
      updateFoe();
      field.classList.add('marching'); // 쓰러뜨렸다 — 다시 앞으로
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
      const lineEl = document.getElementById('bs-kill-line');
      if (lineEl) {
        lineEl.innerHTML = killLineText(getState());
        pulse(lineEl);
      }
      updateBackline(); // 베어 나갈수록 뒤 무리가 줄어든다
      const at = foeAnchor();
      if (at) {
        floatText(at.x, at.y - 6, `+${fmt(coins)}`, 'gold');
        flyCoins(at.x, at.y + 26, 3); // 엽전이 자원바로 날아간다
      }
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

    on('stage:clear', (cleared) => {
      // 전장이 넘어가는 금빛 스윕 — "다음 장으로" 쪽넘김의 감각
      const layer = document.getElementById('fx-layer');
      if (layer) {
        const sweep = document.createElement('i');
        sweep.className = 'stage-sweep';
        layer.appendChild(sweep);
        setTimeout(() => sweep.remove(), 520);
      }
      const fieldEl = document.getElementById('bs-field');
      if (fieldEl) {
        const rect = fieldEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        floatText(cx, rect.top + rect.height / 2, '돌파!', 'victory');
        // 옥구슬은 우두머리 전장(5·10)을 꺾었을 때만 나온다
        if (cleared && cleared.index % 5 === 0) {
          floatText(cx, rect.top + rect.height / 2 + 34, `옥구슬 +${fmt(BALANCE.battle.jadeOnClear)}`, 'gold');
        }
      }
      const prevChapterKey = shownChapterKey;
      const rootEl = document.getElementById('screen-root');
      if (rootEl) {
        rootEl.innerHTML = '';
        render(rootEl);
      }
      // 장이 바뀌었으면(난이도 회차 포함) 개막 카드 — 새 무대가 열렸다
      if (shownChapterKey !== prevChapterKey) {
        const s2 = getState();
        showChapterCard(battle.currentChapter(s2), s2.stage.difficulty ?? 1);
      }
    }),

    // 전투력 마일스톤 — 자릿수를 넘겼다
    on('milestone', ({ value }) => {
      flash('gold');
      play('epic');
      vibrate(30);
      floatText(window.innerWidth / 2, window.innerHeight / 2 - 60, `전투력 ${fmt(value)} 돌파!`, 'victory');
    }),

    // 난이도 상승 — 천하를 한 바퀴 평정했다
    on('difficulty:up', ({ difficulty }) => {
      flash('gold');
      play('legend');
      vibrate(60);
      floatText(window.innerWidth / 2, window.innerHeight / 2 - 40, `천하 평정! 난이도 ${difficulty} 개막`, 'victory');
    }),

    // 엽전이 쌓이면 연마 버튼이 눌 수 있는 상태로 깨어나야 한다 (기존엔 성장 이벤트까지 잠들어 있었음)
    on('coin', () => updateUpgradeButton()),

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

  // 전장 게이지 + 근경 패럴럭스 — 요소 참조는 한 번만 잡는다 (저사양 기기 보호)
  const gaugeFill = document.getElementById('bs-kill-fill');
  const fieldGround = document.getElementById('bs-field-ground'); // 근경 지면(이음매 없는 CSS 패턴)
  let gaugeLast = -1;
  let nearOffset = 0;  // 근경 지면 스크롤 — 나아가는 느낌
  let dustTick = 0;
  function gauge() {
    if (gaugeFill) {
      const s2 = getState();
      const base = Math.min(s2.stage.kills, BALANCE.battle.killsPerStage);
      // 일반 전장은 정원(killsPerStage)만으로 게이지가 가득 차야 '돌파' 쾌감이 산다.
      // 우두머리 전장만 관문(+1)이 남는다. (v46 곁수정 2-6)
      const denom = battle.isBossStage(s2) ? BALANCE.battle.killsPerStage + 1 : BALANCE.battle.killsPerStage;
      const pct = Math.min(100, ((base + battle.killProgress()) / denom) * 100);
      const rounded = Math.round(pct * 10) / 10;
      if (rounded !== gaugeLast) {
        gaugeLast = rounded;
        gaugeFill.style.width = `${rounded}%`;
      }
    }
    // 배경 사진(원경)은 이어붙지 않으므로 고정(cover) — 스크롤하면 이음새·빈틈이 보인다.
    // '움직이는' 느낌은 이음매 없는 근경 지면 패럴럭스가 담당한다. 전투 중엔 미세, 행군 중엔 빠르게.
    const marching = field.classList.contains('marching');
    const speed = getState().settings?.speed || 1;
    if (fieldGround) {
      nearOffset = (nearOffset + (marching ? 6.2 : 0.5) * speed) % 4096;
      fieldGround.style.backgroundPosition = `${-nearOffset}px bottom`;
    }
    // 행군 중엔 발밑에서 흙먼지가 일고, 말발굽 소리가 저벅저벅 (말을 타고 나아가는 감각)
    if (marching && ++dustTick >= 12) {
      dustTick = 0;
      playHoof();
      const line = document.getElementById('bs-allies');
      const units = line ? line.children : [];
      if (units.length) {
        const u = units[Math.floor(Math.random() * units.length)];
        const dust = document.createElement('i');
        dust.className = 'dash-dust';
        dust.style.left = `${u.offsetLeft + u.offsetWidth / 2}px`;
        line.appendChild(dust);
        setTimeout(() => dust.remove(), 380);
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
