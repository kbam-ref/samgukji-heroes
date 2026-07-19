// 삼국지 랜덤 디펜스 — 화면(DOM·연출). 엔진(systems/defense.js)을 rAF로 돌리고 상태를 그린다.
// 성능: 적/유닛 DOM을 id로 재사용하고 transform(translate3d)만 매 프레임 갱신(레이아웃 회피).

import { DEFENSE, ELEMENT_COLOR, ELEMENT_LABEL, SIZE_LABEL } from '../data/defense.js';
import * as engine from '../systems/defense.js';
import { fmt } from './format.js';
import { play, vibrate } from './sound.js';

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
  run = engine.createRun();

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
      <div class="rd-controls">
        <button class="btn primary rd-summon" id="rd-summon">
          <b>소환</b><span>골드 ${DEFENSE.summon.cost}</span>
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

  syncUnits();
  updateHud();
  last = performance.now();
  rafId = requestAnimationFrame(loop);
  window.addEventListener('resize', measureField);
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
  if (btn) btn.classList.toggle('can-buy', run.gold >= DEFENSE.summon.cost);
}

function syncUnits() {
  const seen = new Set();
  for (const u of run.units) {
    seen.add(u.uid);
    let el = unitNodes.get(u.uid);
    if (!el) {
      el = document.createElement('div');
      el.className = `rd-unit r${u.rarity}`;
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
  if (rafId) rafId = requestAnimationFrame(loop);
}

export function destroy() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  window.removeEventListener('resize', measureField);
  enemyNodes.clear();
  unitNodes.clear();
  run = null;
  fieldEl = enemyLayer = unitLayer = null;
}
