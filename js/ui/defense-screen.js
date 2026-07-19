// 삼국지 랜덤 디펜스 — 화면(DOM·연출). 엔진(systems/defense.js)을 rAF로 돌리고 상태를 그린다.
// 성능: 적/유닛 DOM을 id로 재사용하고 transform(translate3d)만 매 프레임 갱신(레이아웃 회피).

import { DEFENSE, ELEMENT_COLOR, ELEMENT_LABEL, SIZE_LABEL } from '../data/defense.js';
import { HEROES, RARITY } from '../data/heroes.js';
import * as engine from '../systems/defense.js';
import { fmt } from './format.js';
import { floatText } from './effects.js';
import { play, vibrate } from './sound.js';

const HERO_NAME = new Map(HEROES.map((h) => [h.id, h.name]));

let run = null;
let rafId = 0;
let last = 0;
let fieldEl = null;
let enemyLayer = null;
let unitLayer = null;
const enemyNodes = new Map(); // eid -> {el, hp}
const unitNodes = new Map(); // uid -> el
let fieldW = 0;
let fieldH = 0;
let saveTick = 0;

// ── 이어하기 세이브 (앱 닫아도 계속) ──
const RD_KEY = 'samgukji-rd';
function saveRun() {
  try {
    const s = engine.serializeRun(run);
    if (s) localStorage.setItem(RD_KEY, JSON.stringify(s));
  } catch { /* private mode 등 */ }
}
function loadRun() {
  try {
    const raw = localStorage.getItem(RD_KEY);
    return raw ? engine.deserializeRun(JSON.parse(raw)) : null;
  } catch { return null; }
}
function clearRun() {
  try { localStorage.removeItem(RD_KEY); } catch { /* noop */ }
}
function onHide() {
  if (document.hidden) saveRun();
}

function heroCut(id) {
  return `./assets/heroes-cut/${id}.png`;
}
function enemyCut(id) {
  return `./assets/enemies-cut/${id}.png`;
}

function measureField() {
  const r = fieldEl.getBoundingClientRect();
  fieldW = r.width;
  fieldH = r.height;
}
function place(el, x, y) {
  el.style.transform = `translate3d(${(x / 100) * fieldW}px, ${(y / 100) * fieldH}px, 0) translate(-50%, -50%)`;
}

function hud() {
  const cap = engine.stageCap();
  return `
    <div class="rd-hud">
      <div class="rd-stat"><b id="rd-stage">1</b><span>/ ${cap} 라운드</span></div>
      <div class="rd-stat rd-gold"><b id="rd-gold">0</b><span>골드</span></div>
      <div class="rd-stat rd-alive"><b id="rd-alive">0</b><span>/ ${DEFENSE.wave.loseAt} 적</span></div>
    </div>`;
}

function trackRectStyle() {
  const p = DEFENSE.field.path;
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
  return `left:${l}%;top:${t}%;width:${r - l}%;height:${b - t}%;`;
}

export function render(root) {
  destroy();
  // 탭 전환(설정 갔다 오기)·앱 재실행에도 런을 잃지 않는다 — 인메모리 유지 → 없으면 세이브 → 새 런.
  if (!run || run.gameOver || run.won) run = loadRun() || engine.createRun();

  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="screen rd-screen">
      ${hud()}
      <div class="rd-field" id="rd-field">
        <div class="rd-track" style="${trackRectStyle()}" aria-hidden="true"></div>
        <div class="rd-units" id="rd-units" aria-hidden="true"></div>
        <div class="rd-enemies" id="rd-enemies" aria-hidden="true"></div>
        <div class="rd-over" id="rd-over" hidden></div>
      </div>
      <div class="rd-panel" id="rd-panel" hidden></div>
      <div class="rd-controls">
        <button class="btn primary rd-summon" id="rd-summon">
          <b>소환</b><span>골드 ${DEFENSE.summon.cost}</span>
        </button>
        <button class="btn rd-gamble" id="rd-gamble">
          <b>도박</b><span>골드 ${DEFENSE.gamble.cost}</span>
        </button>
      </div>
    </section>`
  );

  fieldEl = document.getElementById('rd-field');
  enemyLayer = document.getElementById('rd-enemies');
  unitLayer = document.getElementById('rd-units');
  measureField();

  document.getElementById('rd-summon').addEventListener('click', () => {
    const u = engine.summon(run);
    if (!u) {
      vibrate(8);
      const btn = document.getElementById('rd-summon');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      return;
    }
    play('tap');
    syncUnits();
    updateHud();
  });

  document.getElementById('rd-gamble').addEventListener('click', (e) => {
    const won = engine.gamble(run);
    if (won === null) { vibrate(8); return; }
    play(won > 0 ? 'claim' : 'foehit');
    floatText(e.clientX, e.clientY, won > 0 ? `+${fmt(won)} 골드!` : '꽝', won > 0 ? 'gold' : 'warn');
    updateHud();
  });

  // 유닛 탭 → 단련/합성/반환 패널
  unitLayer.addEventListener('click', (e) => {
    const el = e.target.closest('.rd-unit');
    if (el) openPanel(Number(el.dataset.uid));
  });

  const panel = document.getElementById('rd-panel');
  panel.addEventListener('click', (e) => {
    if (e.target.closest('#rd-panel-x')) { closePanel(); return; }
    const act = e.target.closest('.rd-act');
    if (!act || act.disabled) return;
    const uid = Number(panel.dataset.uid);
    const u = run.units.find((x) => x.uid === uid);
    if (!u) { closePanel(); return; }
    const r = act.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top;
    if (act.dataset.act === 'upgrade') {
      if (engine.upgrade(run, uid)) { play('claim'); floatText(cx, cy, '단련 +1', 'gold'); syncUnits(); openPanel(uid); updateHud(); }
      else vibrate(8);
    } else if (act.dataset.act === 'merge') {
      const nu = engine.merge(run, u.rarity);
      if (nu) { play('epic'); floatText(cx, cy, `합성! ${RARITY[nu.rarity].name}`, 'gold'); closePanel(); syncUnits(); updateHud(); }
      else vibrate(8);
    } else if (act.dataset.act === 'refund') {
      const v = engine.refund(run, uid);
      if (v > 0) { play('claim'); floatText(cx, cy, `+${fmt(v)} 골드`, 'jade'); closePanel(); syncUnits(); updateHud(); }
    }
  });

  syncUnits();
  syncEnemies();
  updateHud();
  last = performance.now();
  rafId = requestAnimationFrame(loop);
  window.addEventListener('resize', measureField);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', saveRun);
}

function updateHud() {
  const s = document.getElementById('rd-stage');
  const g = document.getElementById('rd-gold');
  const a = document.getElementById('rd-alive');
  if (s) s.textContent = run.stage;
  if (g) g.textContent = fmt(Math.floor(run.gold));
  if (a) {
    a.textContent = run.enemies.length;
    a.parentElement.classList.toggle('danger', run.enemies.length >= DEFENSE.wave.loseAt * 0.75);
  }
  const btn = document.getElementById('rd-summon');
  if (btn) {
    const free = run.freePulls > 0;
    btn.querySelector('b').textContent = free ? '무료 소환' : '소환';
    btn.querySelector('span').textContent = free ? `${run.freePulls}회 남음` : `골드 ${DEFENSE.summon.cost}`;
    btn.classList.toggle('can-buy', free || run.gold >= DEFENSE.summon.cost);
  }
}

function syncUnits() {
  const seen = new Set();
  for (const u of run.units) {
    seen.add(u.uid);
    let el = unitNodes.get(u.uid);
    if (!el) {
      el = document.createElement('div');
      el.className = `rd-unit r${u.rarity}`;
      el.dataset.uid = u.uid;
      el.innerHTML = `
        <img class="rd-sprite" src="${heroCut(u.heroId)}" alt="" draggable="false">
        <i class="rd-elem" style="background:${ELEMENT_COLOR[u.element]}"></i>`;
      unitLayer.appendChild(el);
      unitNodes.set(u.uid, el);
      place(el, u.x, u.y);
    }
  }
  for (const [uid, el] of unitNodes) {
    if (!seen.has(uid)) { el.remove(); unitNodes.delete(uid); }
  }
}

function closePanel() {
  const panel = document.getElementById('rd-panel');
  if (panel) { panel.hidden = true; panel.removeAttribute('data-uid'); }
  for (const [, el] of unitNodes) el.classList.remove('picked');
}
function openPanel(uid) {
  const u = run.units.find((x) => x.uid === uid);
  const panel = document.getElementById('rd-panel');
  if (!u || !panel) return;
  for (const [id, el] of unitNodes) el.classList.toggle('picked', id === uid);
  const upCost = engine.upgradeCost(u.upgradeLv);
  const maxed = u.upgradeLv >= DEFENSE.unit.upgrade.maxLevel;
  const refVal = engine.refundValue(u);
  const mergeable = engine.canMerge(run, u.rarity);
  const haveN = engine.sameRarityCount(run, u.rarity);
  panel.hidden = false;
  panel.dataset.uid = uid;
  panel.innerHTML = `
    <div class="rd-panel-head">
      <b class="rarity r${u.rarity}">${HERO_NAME.get(u.heroId)}</b>
      <span>${RARITY[u.rarity].name} · ${ELEMENT_LABEL[u.element]} · 단련 ${u.upgradeLv}</span>
      <button class="rd-panel-x" id="rd-panel-x" aria-label="닫기">✕</button>
    </div>
    <div class="rd-panel-acts">
      <button class="btn rd-act" data-act="upgrade" ${maxed || run.gold < upCost ? 'disabled' : ''}>
        <b>단련</b><span>${maxed ? '최대' : `골드 ${fmt(upCost)}`}</span>
      </button>
      <button class="btn rd-act" data-act="merge" ${mergeable ? '' : 'disabled'}>
        <b>합성</b><span>${u.rarity >= 5 ? '최고 등급' : `${RARITY[u.rarity].name} ${haveN}/3 → 상위`}</span>
      </button>
      <button class="btn rd-act refund" data-act="refund">
        <b>반환</b><span>+골드 ${fmt(refVal)}</span>
      </button>
    </div>`;
}

function syncEnemies() {
  const seen = new Set();
  for (const e of run.enemies) {
    seen.add(e.eid);
    let node = enemyNodes.get(e.eid);
    if (!node) {
      const el = document.createElement('div');
      el.className = `rd-enemy${e.isBoss ? ' boss' : ''} sz-${e.size}`;
      el.style.setProperty('--sz', DEFENSE.wave.sizes[e.size].scale * (e.isBoss ? DEFENSE.wave.boss.scale : 1));
      el.innerHTML = `
        <b class="rd-hp"></b>
        <img class="rd-sprite" src="${enemyCut(e.spriteId)}" alt="" draggable="false">
        <i class="rd-elem" style="background:${ELEMENT_COLOR[e.element]}"></i>`;
      enemyLayer.appendChild(el);
      node = { el, hp: -1, hitOn: false };
      enemyNodes.set(e.eid, node);
    }
    place(node.el, e.x, e.y);
    const hpShown = Math.max(0, Math.ceil(e.hp));
    if (hpShown !== node.hp) {
      node.el.querySelector('.rd-hp').textContent = fmt(hpShown);
      node.hp = hpShown;
      const pct = Math.max(0, e.hp / e.maxHp);
      node.el.style.setProperty('--hppct', pct);
    }
    const hitOn = e.hit > 0;
    if (hitOn !== node.hitOn) { node.el.classList.toggle('hit', hitOn); node.hitOn = hitOn; }
  }
  for (const [eid, node] of enemyNodes) {
    if (!seen.has(eid)) { node.el.remove(); enemyNodes.delete(eid); }
  }
}

function consumeFx() {
  for (const fx of engine.drainFx(run)) {
    if (fx.type === 'attack') {
      const el = unitNodes.get(fx.uid);
      if (el) { el.classList.remove('fire'); void el.offsetWidth; el.classList.add('fire'); }
    } else if (fx.type === 'kill') {
      play('foehit');
    } else if (fx.type === 'stageClear') {
      play('clear');
      updateHud();
    } else if (fx.type === 'bossReward') {
      play('epic');
      syncUnits();
    } else if (fx.type === 'summon') {
      syncUnits();
    } else if (fx.type === 'gameover') {
      showOver(false);
    } else if (fx.type === 'win') {
      showOver(true);
    }
  }
}

function showOver(won) {
  cancelAnimationFrame(rafId);
  rafId = 0;
  clearRun(); // 게임오버·승리 = 런 종료 → 이어하기 세이브 삭제(패배 시 처음부터)
  const over = document.getElementById('rd-over');
  if (!over) return;
  play(won ? 'legend' : 'wipe');
  over.hidden = false;
  over.innerHTML = `
    <div class="rd-over-card">
      <b>${won ? `${engine.stageCap()}라운드 클리어!` : '패배'}</b>
      <span>${won ? '천하를 지켜냈다' : `${run.stage}라운드에서 무너졌다 — 처음부터 다시`}</span>
      <button class="btn primary" id="rd-retry">다시 시작</button>
    </div>`;
  document.getElementById('rd-retry').addEventListener('click', () => {
    for (const [, node] of enemyNodes) node.el.remove();
    enemyNodes.clear();
    for (const [, el] of unitNodes) el.remove();
    unitNodes.clear();
    over.hidden = true;
    run = engine.createRun();
    syncUnits();
    updateHud();
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  });
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  engine.tick(run, dt);
  syncEnemies();
  consumeFx();
  updateHud();
  if (++saveTick >= 180) { saveTick = 0; saveRun(); } // ~3초마다 이어하기 저장
  if (rafId) rafId = requestAnimationFrame(loop);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  saveRun(); // 탭 떠날 때 저장 — 설정 갔다 와도 이어진다
  window.removeEventListener('resize', measureField);
  document.removeEventListener('visibilitychange', onHide);
  window.removeEventListener('pagehide', saveRun);
  enemyNodes.clear();
  unitNodes.clear();
  fieldEl = enemyLayer = unitLayer = null;
  // run은 null로 만들지 않는다 — 탭 전환에도 인메모리로 유지
}
