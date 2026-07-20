// 삼국지 랜덤 디펜스 — 화면(DOM·연출). 엔진(systems/defense.js)을 rAF로 돌리고 상태를 그린다.
// 성능: 적/유닛 DOM을 id로 재사용하고 transform(translate3d)만 매 프레임 갱신(레이아웃 회피).

import { DEFENSE, ELEMENT_COLOR, ELEMENT_LABEL, SIZE_LABEL, HERO_WEAPON } from '../data/defense.js';
import { HEROES, RARITY } from '../data/heroes.js';
import * as engine from '../systems/defense.js';
import * as meta from '../systems/rd-meta.js';
import { on, emit } from '../core/events.js';
import { getState, setSetting } from '../core/state.js';
import { fmt } from './format.js';
import { floatText, flash } from './effects.js';
import { showModal } from './modal.js';
import { play, vibrate } from './sound.js';

const HERO_NAME = new Map(HEROES.map((h) => [h.id, h.name]));
const ELEM_GLYPH = { water: '水', fire: '火', earth: '土' }; // 속성 배지 글자 — 색만으론 헷갈려서

let run = null;
let rafId = 0;
let last = 0;
let speed = 1;            // 전투 배속 x1/x2/x3 (설정에 영속)
let revealing = false;    // 10연 소환 연출 중 — 월드를 멈춘다
let revealTimers = [];
let started = false;      // '시작하기'를 누르기 전엔 월드가 돌지 않는다 (로딩·타이틀 뒤 스폰 방지)

// 타이틀의 '시작하기' → 도전 1 소모하고 새 판(라운드1). 도전이 없으면 결제 화면으로.
on('game:begin', () => startNewPlay());

// 저장해 둔 판을 불러온다. 불러오면 세이브 소모(1저장=1이어하기). 방어 화면 준비 후에만
// 부작용(clearRun) 실행 — 설정탭 등 fieldEl 없을 때 세이브만 지워지고 로드 안 되는 버그 방지.
on('game:load', () => {
  if (!fieldEl) return;
  const saved = loadRun();
  clearRun();
  started = true;
  beginRun(saved || engine.createRun({}));
});

// 앱이 백그라운드로 나갔다 시작화면이 다시 뜨는 동안 — 월드 정지 + 리빌 잔재 정리
on('game:suspend', () => { started = false; closeReveal(); });
let fieldEl = null;
let enemyLayer = null;
let unitLayer = null;
let shotLayer = null; // 투사체(참격·화살)·명중 불꽃 레이어
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const enemyNodes = new Map(); // eid -> {el, hp}
const unitNodes = new Map(); // uid -> el
let fieldW = 0;
let fieldH = 0;
let saveTick = 0;
let drag = null; // { uid, startX, startY, moved }
// 폰 가로 전환 — 세로 전용이라 가로에선 게임 루프를 멈춘다(CSS #rotate-guard가 화면을 덮음)
const landscapeMQ = matchMedia('(orientation: landscape) and (max-height: 600px) and (pointer: coarse)');

// 화면 좌표 → 필드 % (드래그 위치 계산)
function fieldPct(clientX, clientY) {
  const r = fieldEl.getBoundingClientRect();
  return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
}
function onDragMove(e) {
  if (!drag || !run) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 16) drag.moved = true; // 탭 관대하게(모바일 손가락 오차 — Z.ai 리뷰 반영 11→16)
  if (!drag.moved) return;
  const p = fieldPct(e.clientX, e.clientY);
  const b = DEFENSE.unit.bounds;
  const u = run.units.find((x) => x.uid === drag.uid);
  if (u) {
    u.tx = Math.max(b.x1, Math.min(b.x2, p.x)); // 네모 안으로 제한
    u.ty = Math.max(b.y1, Math.min(b.y2, p.y));
  }
}
function onDragUp() {
  window.removeEventListener('pointermove', onDragMove);
  if (drag && !drag.moved) openPanel(drag.uid); // 안 움직였으면 탭 = 패널
  drag = null;
}

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
/** 저장된 판이 있는가 — 타이틀에서 '이어하기'를 보여줄지 판단 */
export function hasSavedRun() {
  try { return !!localStorage.getItem(RD_KEY); } catch { return false; }
}

function heroCut(id) {
  return `./assets/heroes-cut/${id}.png`;
}
function enemyCut(id) {
  return `./assets/enemies-cut/${id}.png`;
}

// 전장 배경(아레나) — ~13라운드마다 교체
const ARENAS = ['arena-plain', 'arena-camp', 'arena-stone', 'arena-snow'];
let shownArena = '';
function updateBg() {
  const el = document.getElementById('rd-bg');
  if (!el || !run) return;
  const id = ARENAS[Math.floor((run.stage - 1) / 13) % ARENAS.length];
  if (id !== shownArena) {
    el.style.backgroundImage = `url('./assets/bg/${id}.png')`;
    shownArena = id;
  }
}

function measureField() {
  const r = fieldEl.getBoundingClientRect();
  fieldW = r.width;
  fieldH = r.height;
}
function place(el, x, y) {
  el.style.transform = `translate3d(${(x / 100) * fieldW}px, ${(y / 100) * fieldH}px, 0) translate(-50%, -50%)`;
}

// ── 투사체·명중 이펙트 — DOM 오브젝트 풀 (매번 create/remove 대신 재사용 → GC 스파이크↓, 저사양·3배속 대비) ──
const fxPool = [];
function getFxEl() {
  const el = fxPool.pop();
  if (el) { el.className = ''; el.style.cssText = ''; return el; }
  return document.createElement('i');
}
function releaseFxEl(el) {
  if (el.parentNode) el.parentNode.removeChild(el);
  if (fxPool.length < 48) fxPool.push(el);
}

// 참격·화살이 쏜 자리에서 맞는 자리로 날아가 불꽃을 터뜨린다
function spawnShot(fx) {
  if (!shotLayer || reduceMotion) return;
  if (shotLayer.childElementCount > 30) return; // 저사양 보호 — 밀리면 솎아낸다
  const sx = (fx.ux / 100) * fieldW, sy = (fx.uy / 100) * fieldH;
  const dxpx = ((fx.ex - fx.ux) / 100) * fieldW;
  const dypx = ((fx.ey - fx.uy) / 100) * fieldH;
  const ang = (Math.atan2(dypx, dxpx) * 180) / Math.PI;
  const weapon = HERO_WEAPON[fx.heroId] || 'slash';
  const color = ELEMENT_COLOR[fx.element] || '#e9d6a0';
  const t = weapon === 'arrow' ? 150 : 100; // 화살은 조금 더 오래 난다
  const el = getFxEl();
  el.className = `rd-shot ${weapon}`;
  el.style.left = `${sx}px`;
  el.style.top = `${sy}px`;
  el.style.setProperty('--dx', `${dxpx}px`);
  el.style.setProperty('--dy', `${dypx}px`);
  el.style.setProperty('--ang', `${ang}deg`);
  el.style.setProperty('--t', `${t}ms`);
  el.style.setProperty('--c', color);
  shotLayer.appendChild(el);
  setTimeout(() => {
    releaseFxEl(el);
    spawnImpact(fx.ex, fx.ey, color, weapon); // 명중 순간 불꽃
  }, t);
}
function spawnImpact(x, y, color, weapon) {
  if (!shotLayer || reduceMotion || shotLayer.childElementCount > 36) return;
  const s = getFxEl();
  s.className = `rd-impact ${weapon}`;
  s.style.left = `${(x / 100) * fieldW}px`;
  s.style.top = `${(y / 100) * fieldH}px`;
  s.style.setProperty('--c', color);
  shotLayer.appendChild(s);
  setTimeout(() => releaseFxEl(s), 260);
}

function hud() {
  const cap = engine.stageCap();
  return `
    <div class="rd-hud">
      <div class="rd-stat"><b id="rd-stage">1</b><span>/ ${cap} 라운드</span></div>
      <div class="rd-stat rd-gold"><b id="rd-gold">0</b><span>골드</span></div>
      <div class="rd-stat rd-alive"><b id="rd-alive">0</b><span>/ ${DEFENSE.wave.loseAt} 적</span></div>
      <div class="rd-stat rd-best"><b id="rd-best">${meta.best().stage}</b><span>최고</span></div>
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
  // 탭 전환엔 인메모리 run 유지. 아예 없을 때만(콜드 부팅) 표시용 새 런을 만들고, 시작 전까진 정지.
  // 게임오버/승리 run은 그대로 두고 아래에서 결과화면을 다시 그린다 — 탭 왕복으로 도전 무소모 재도전하는 우회 차단.
  if (!run) {
    run = engine.createRun({});
    started = false;
  }

  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="screen rd-screen">
      ${hud()}
      <div class="rd-field" id="rd-field">
        <div class="rd-bg" id="rd-bg" aria-hidden="true"></div>
        <div class="rd-track" style="${trackRectStyle()}" aria-hidden="true"></div>
        <div class="rd-units" id="rd-units" aria-hidden="true"></div>
        <div class="rd-enemies" id="rd-enemies" aria-hidden="true"></div>
        <div class="rd-shots" id="rd-shots" aria-hidden="true"></div>
        <button class="rd-save" id="rd-save" aria-label="저장">저장</button>
        <button class="rd-speed" id="rd-speed" aria-label="전투 배속">1×</button>
        <div class="rd-prep" id="rd-prep" hidden>
          <b class="rd-prep-n">15</b>
          <span class="rd-prep-sub">전투 시작까지 · 장수를 배치하세요</span>
        </div>
        <div class="rd-over" id="rd-over" hidden></div>
      </div>
      <div class="rd-panel" id="rd-panel" hidden></div>
      <p class="rd-tip" id="rd-tip">장수를 <b>탭</b>하면 단련·합성·반환</p>
      <div class="rd-controls">
        <button class="btn primary rd-summon10" id="rd-summon10">
          <b>10연 소환</b><span id="rd-s10-cost">무료 10회</span>
        </button>
        <button class="btn rd-summon" id="rd-summon">
          <b>소환</b><span id="rd-s1-cost">골드 ${DEFENSE.summon.cost}</span>
        </button>
      </div>
      <div class="rd-controls sub">
        <button class="btn rd-merge" id="rd-merge">
          <b>합성</b><span id="rd-merge-sub">같은 등급 3장→상위</span>
        </button>
        <button class="btn rd-gamble" id="rd-gamble">
          <b>도박</b><span>골드 ${DEFENSE.gamble.cost}에 한탕</span>
        </button>
      </div>
    </section>`
  );

  fieldEl = document.getElementById('rd-field');
  enemyLayer = document.getElementById('rd-enemies');
  unitLayer = document.getElementById('rd-units');
  shotLayer = document.getElementById('rd-shots');
  measureField();

  // 전투 배속 — 저장된 값에서 이어받아 칩에 반영
  speed = clampSpeed(getState().settings?.rdSpeed);
  updateSpeedChip();
  document.getElementById('rd-speed').addEventListener('click', () => {
    speed = speed >= 3 ? 1 : speed + 1;
    setSetting('rdSpeed', speed);
    updateSpeedChip();
    play('tap');
    vibrate(6);
  });

  // 저장 — 지금 판을 저장해 두면 다음에 타이틀에서 '이어하기'로 불러올 수 있다(1저장=1이어하기).
  document.getElementById('rd-save').addEventListener('click', () => {
    if (!run || run.gameOver || run.won) { vibrate(8); return; }
    saveRun();
    play('claim'); vibrate(12);
    floatText(window.innerWidth / 2, window.innerHeight * 0.42, '저장됨 — 다음에 이어하기', 'gold');
  });

  // 등급이 높을수록 크게 축포를 터뜨린다 (소환의 손맛)
  function summonFanfare(rarity) {
    if (rarity >= 5) { play('legend'); flash('gold'); vibrate(40); }
    else if (rarity >= 4) { play('epic'); flash('ember'); vibrate(22); }
    else if (rarity >= 3) { play('claim'); vibrate(10); }
    else play('tap');
  }

  document.getElementById('rd-summon').addEventListener('click', () => {
    const u = engine.summon(run);
    if (!u) {
      vibrate(8);
      const btn = document.getElementById('rd-summon');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      return;
    }
    summonFanfare(u.rarity);
    syncUnits();
    updateHud();
  });

  // 10연 소환 — 깃발이 하나씩 뒤집히는 리빌. 무료 소환권부터 쓰고, 모자라면 골드로.
  document.getElementById('rd-summon10').addEventListener('click', () => {
    const made = engine.summonMany(run, 10);
    if (!made.length) {
      vibrate(8);
      const btn = document.getElementById('rd-summon10');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      return;
    }
    syncUnits();
    updateHud();
    startReveal(made);
  });

  document.getElementById('rd-gamble').addEventListener('click', (e) => {
    const won = engine.gamble(run);
    if (won === null) { vibrate(8); return; }
    play(won > 0 ? 'claim' : 'foehit');
    floatText(e.clientX, e.clientY, won > 0 ? `+${fmt(won)} 골드!` : '꽝', won > 0 ? 'gold' : 'warn');
    updateHud();
  });

  // 합성(상시 버튼) — 누르면 '어떤 영웅을 합칠지' 먼저 고른다 (같은 영웅 3장 필요).
  document.getElementById('rd-merge').addEventListener('click', () => {
    play('tap');
    openMergePicker();
  });

  // 유닛: 짧게 탭 = 패널 / 끌기 = 8방향 이동(드래그한 지점으로 걸어간다)
  unitLayer.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.rd-unit');
    if (!el) return;
    drag = { uid: Number(el.dataset.uid), startX: e.clientX, startY: e.clientY, moved: false };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp, { once: true });
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
      const nu = engine.mergeHero(run, u.heroId);
      if (nu) { play('epic'); floatText(cx, cy, `합성! ${RARITY[nu.rarity].name} ${HERO_NAME.get(nu.heroId)}`, 'gold'); closePanel(); syncUnits(); updateHud(); }
      else vibrate(8);
    } else if (act.dataset.act === 'refund') {
      const v = engine.refund(run, uid);
      if (v > 0) { play('claim'); floatText(cx, cy, `+${fmt(v)} 골드`, 'jade'); closePanel(); syncUnits(); updateHud(); }
    }
  });

  window.addEventListener('resize', measureField);

  updateHud();
  updatePrep();
  shownArena = '';
  syncUnits();
  syncEnemies();
  updateBg();
  last = performance.now();
  rafId = requestAnimationFrame(loop);
  // 게임오버/승리 상태로 재진입(탭 복귀)했으면 결과화면을 다시 띄운다(새 판은 '다시 시작'=도전 소모로만)
  if (run.gameOver || run.won) showOver(run.won);
}

function updateHud() {
  if (!run) return;
  const s = document.getElementById('rd-stage');
  const g = document.getElementById('rd-gold');
  const a = document.getElementById('rd-alive');
  if (s) s.textContent = run.stage;
  if (g) g.textContent = fmt(Math.floor(run.gold));
  if (a) {
    a.textContent = run.enemies.length;
    a.parentElement.classList.toggle('danger', run.enemies.length >= DEFENSE.wave.loseAt * 0.75);
  }
  const cost = DEFENSE.summon.cost;
  const free = run.freePulls;

  // 단일 소환
  const btn = document.getElementById('rd-summon');
  const s1 = document.getElementById('rd-s1-cost');
  if (btn && s1) {
    s1.textContent = free > 0 ? `무료 · ${free}회 남음` : `골드 ${cost}`;
    btn.classList.toggle('can-buy', free > 0 || run.gold >= cost);
  }

  // 10연 소환 — 무료분부터 소진, 나머지는 골드
  const btn10 = document.getElementById('rd-summon10');
  const s10 = document.getElementById('rd-s10-cost');
  if (btn10 && s10) {
    const freeUse = Math.min(10, free);
    const paid = 10 - freeUse;
    const goldCost = paid * cost;
    s10.textContent =
      freeUse >= 10 ? '무료 10회' :
      freeUse > 0 ? `무료 ${freeUse} + 골드 ${fmt(goldCost)}` :
      `골드 ${fmt(goldCost)}`;
    btn10.classList.toggle('can-buy', free > 0 || run.gold >= cost);
  }

  // 합성(상시 버튼) — 같은 영웅 3장이 모인 종류 수를 안내하고, 없으면 흐리게
  const mb = document.getElementById('rd-merge');
  const ms = document.getElementById('rd-merge-sub');
  if (mb) {
    const groups = engine.mergeableHeroes(run);
    mb.classList.toggle('can-buy', groups.length > 0);
    if (ms) ms.textContent = groups.length ? `합성 가능 ${groups.length}종` : '같은 영웅 3장';
  }
}

// 합성 대상 선택 모달 — 같은 영웅 3장 모인 것만 보여주고, 고르면 상위 등급 랜덤으로 합성한다.
function openMergePicker() {
  const box = document.createElement('div');
  box.className = 'rd-merge-picker';
  const render = () => {
    const groups = engine.mergeableHeroes(run);
    if (!groups.length) {
      box.innerHTML = `<p class="rd-merge-empty"><b>같은 영웅 3장</b>을 모으면 상위 등급으로 합성할 수 있어요.<br>소환으로 같은 장수를 모아 보세요.</p>`;
      return;
    }
    box.innerHTML = groups
      .map(
        (g) => `
      <button class="rd-merge-opt r${g.rarity}" data-hero="${g.heroId}">
        <img src="${heroCut(g.heroId)}" alt="" draggable="false">
        <span class="rd-mo-body">
          <b class="rd-mo-name">${HERO_NAME.get(g.heroId)}</b>
          <span class="rd-mo-info">${RARITY[g.rarity].name} <em>×${g.count}</em> → ${RARITY[g.rarity + 1].name} 랜덤</span>
        </span>
        <span class="rd-mo-go">합성 ›</span>
      </button>`
      )
      .join('');
  };
  render();
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.rd-merge-opt');
    if (!btn) return;
    const nu = engine.mergeHero(run, btn.dataset.hero);
    if (nu) {
      play('epic'); vibrate(18);
      floatText(window.innerWidth / 2, window.innerHeight * 0.4, `합성! ${RARITY[nu.rarity].name} ${HERO_NAME.get(nu.heroId)}`, 'gold');
      syncUnits(); updateHud();
      render(); // 남은 합성 가능 목록 갱신 (연속 합성)
    } else {
      vibrate(8);
    }
  });
  showModal({ title: '영웅 합성 — 같은 장수 3장', body: box, actions: [{ label: '닫기' }] });
}

function clampSpeed(v) {
  const n = Math.round(Number(v) || 1);
  return n < 1 ? 1 : n > 3 ? 3 : n;
}
function updateSpeedChip() {
  const chip = document.getElementById('rd-speed');
  if (!chip) return;
  chip.textContent = `${speed}×`;
  chip.classList.toggle('boosted', speed > 1);
}

// 준비 카운트다운 — prepLeft>0 동안 남은 초를 크게 보여준다. 0에서 prepEnd fx가 마무리.
function updatePrep() {
  const el = document.getElementById('rd-prep');
  if (!el || !run) return;
  const prepping = run.prepLeft > 0;
  // 병력이 0인 채 프렙이 흐르면 첫 판을 헛되이 날릴 위험 → '10연 소환'을 강조하고 문구로 유도
  const need = prepping && run.units.length === 0;
  const b10 = document.getElementById('rd-summon10');
  if (b10) b10.classList.toggle('nudge', need);
  if (prepping) {
    if (el.hidden) el.hidden = false;
    const n = String(Math.ceil(run.prepLeft));
    const nb = el.querySelector('.rd-prep-n');
    if (nb && nb.textContent !== n) nb.textContent = n;
    const sub = el.querySelector('.rd-prep-sub');
    const txt = need ? "무료 '10연 소환'으로 병력을 모으세요!" : '전투 시작까지 · 장수를 배치하세요';
    if (sub && sub.textContent !== txt) sub.textContent = txt;
  }
}

function syncUnits() {
  if (!run) return;
  const seen = new Set();
  for (const u of run.units) {
    seen.add(u.uid);
    let el = unitNodes.get(u.uid);
    if (!el) {
      el = document.createElement('div');
      el.className = `rd-unit r${u.rarity}`;
      el.dataset.uid = u.uid;
      el.innerHTML = `
        <b class="rd-stars">${'★'.repeat(u.rarity)}</b>
        <div class="rd-body"><img class="rd-sprite" src="${heroCut(u.heroId)}" alt="" draggable="false"></div>
        <i class="rd-elem" style="background:${ELEMENT_COLOR[u.element]}">${ELEM_GLYPH[u.element]}</i>`;
      unitLayer.appendChild(el);
      unitNodes.set(u.uid, el);
      place(el, u.x, u.y);
    }
    if (u.face) el.style.setProperty('--face', u.face);
    el.classList.toggle('moving', !!u.moving);
    place(el, u.x, u.y); // 이동/드래그 위치 매 프레임 반영
  }
  for (const [uid, el] of unitNodes) {
    if (!seen.has(uid)) { el.remove(); unitNodes.delete(uid); }
  }
}

function closePanel() {
  const panel = document.getElementById('rd-panel');
  if (panel) { panel.hidden = true; panel.removeAttribute('data-uid'); }
  const tip = document.getElementById('rd-tip');
  if (tip) tip.hidden = false; // 패널 닫히면 안내 다시 표시
  for (const [, el] of unitNodes) el.classList.remove('picked');
}
function openPanel(uid) {
  const u = run.units.find((x) => x.uid === uid);
  const panel = document.getElementById('rd-panel');
  if (!u || !panel) return;
  const tip = document.getElementById('rd-tip');
  if (tip) tip.hidden = true; // 패널 열리면 안내 숨김(공간 양보)
  for (const [id, el] of unitNodes) el.classList.toggle('picked', id === uid);
  const upCost = engine.upgradeCost(u.upgradeLv);
  const maxed = u.upgradeLv >= DEFENSE.unit.upgrade.maxLevel;
  const refVal = engine.refundValue(u);
  const mergeable = engine.canMergeHero(run, u.heroId);
  const haveN = engine.sameHeroCount(run, u.heroId);
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
        <b>합성</b><span>${u.rarity >= 5 ? '최고 등급' : `같은 영웅 ${haveN}/3`}</span>
      </button>
      <button class="btn rd-act refund" data-act="refund">
        <b>반환</b><span>+골드 ${fmt(refVal)}</span>
      </button>
    </div>`;
}

function syncEnemies() {
  if (!run) return;
  const seen = new Set();
  for (const e of run.enemies) {
    seen.add(e.eid);
    let node = enemyNodes.get(e.eid);
    if (!node) {
      const el = document.createElement('div');
      el.className = `rd-enemy${e.isBoss ? ' boss' : ''} sz-${e.size}`;
      el.style.setProperty('--sz', DEFENSE.wave.sizes[e.size].scale * (e.isBoss ? DEFENSE.wave.boss.scale : 1));
      el.innerHTML = `
        <div class="rd-hpbar"><i></i></div>
        <div class="rd-body"><img class="rd-sprite" src="${enemyCut(e.spriteId)}" alt="" draggable="false"></div>
        <i class="rd-elem" style="background:${ELEMENT_COLOR[e.element]}"></i>`;
      enemyLayer.appendChild(el);
      node = { el, hp: -1, hitOn: false, face: 1 };
      enemyNodes.set(e.eid, node);
    }
    place(node.el, e.x, e.y);
    if (e.face !== node.face) { node.el.style.setProperty('--face', e.face); node.face = e.face; }
    // 체력은 숫자 대신 줄어드는 바 — node.hp에 마지막 비율을 저장해 바뀔 때만 갱신
    const pct = Math.max(0, e.hp / e.maxHp);
    if (pct !== node.hp) {
      node.el.style.setProperty('--hppct', pct);
      node.el.classList.toggle('hp-low', pct <= 0.35); // 낮으면 빨갛게
      node.hp = pct;
    }
    const hitOn = e.hit > 0;
    if (hitOn !== node.hitOn) { node.el.classList.toggle('hit', hitOn); node.hitOn = hitOn; }
  }
  for (const [eid, node] of enemyNodes) {
    if (!seen.has(eid)) {
      const el = node.el;
      el.classList.add('dying'); // 사망 연출 후 제거
      enemyNodes.delete(eid);
      setTimeout(() => el.remove(), 280);
    }
  }
}

function consumeFx() {
  for (const fx of engine.drainFx(run)) {
    if (fx.type === 'attack') {
      const el = unitNodes.get(fx.uid);
      if (el) {
        // 적이 위면 위로, 아래면 아래로 몸을 던진다 — '그 적'을 향해 찌르는 느낌 (세로는 안 뒤집힘)
        const ly = Math.max(-9, Math.min(9, (fx.ey - fx.uy) * 0.5));
        el.style.setProperty('--ly', `${ly.toFixed(1)}px`);
        el.classList.remove('fire'); void el.offsetWidth; el.classList.add('fire');
        setTimeout(() => el.classList.remove('fire'), 240); // 공격 끝나면 idle 숨쉬기로 복귀
      }
      spawnShot(fx); // 참격/화살이 적에게 날아가 명중 불꽃
    } else if (fx.type === 'kill') {
      play('foehit');
    } else if (fx.type === 'stageClear') {
      play('clear');
      // 방금 깬 스테이지(fx.stage - 1)가 보스 스테이지였으면 알린다 (보상 무료소환권은 엔진이 지급)
      if (engine.isBossStage(fx.stage - 1)) {
        floatText(window.innerWidth / 2, 120, '보스 격파! 무료 소환', 'gold');
      }
      updateHud();
    } else if (fx.type === 'bossReward') {
      play('epic');
      syncUnits();
    } else if (fx.type === 'summon') {
      syncUnits();
    } else if (fx.type === 'prepEnd') {
      // 준비 끝 — '전투 개시!' 한 번 번쩍이고 카운트다운을 걷는다
      play('drum'); vibrate(30);
      const el = document.getElementById('rd-prep');
      if (el) {
        el.classList.add('go');
        el.querySelector('.rd-prep-n').textContent = '';
        el.querySelector('.rd-prep-sub').textContent = '전투 개시!';
        setTimeout(() => { el.hidden = true; el.classList.remove('go'); }, 850);
      }
    } else if (fx.type === 'gameover') {
      showOver(false);
    } else if (fx.type === 'win') {
      showOver(true);
    }
  }
}

function wipeNodes() {
  for (const [, node] of enemyNodes) node.el.remove();
  enemyNodes.clear();
  for (const [, el] of unitNodes) el.remove();
  unitNodes.clear();
  if (shotLayer) shotLayer.innerHTML = '';
}
function beginRun(newRun) {
  closeReveal(); // 진행 중이던 10연 리빌 정리 — 안 그러면 revealing=true로 새 런 루프가 영구 정지(소프트락)
  run = newRun;
  const over = document.getElementById('rd-over');
  if (over) { over.hidden = true; over.innerHTML = ''; }
  wipeNodes();
  shownArena = '';
  syncUnits();
  syncEnemies();
  updateHud();
  updateBg();
  last = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function showOver(won) {
  cancelAnimationFrame(rafId);
  rafId = 0;
  const reachedStage = run.stage;
  const sec = Math.round(run.elapsed);
  clearRun(); // 런 종료 → 이어하기 세이브 삭제(패배 시 처음부터)
  const newBest = meta.recordRun(reachedStage, sec, won); // 최고 라운드 갱신
  const b = meta.best();
  const over = document.getElementById('rd-over');
  if (!over) return;
  play(won ? 'legend' : 'wipe');
  over.hidden = false;
  over.innerHTML = `
    <div class="rd-over-card">
      <b>${won ? `${engine.stageCap()}라운드 클리어!` : '패배'}</b>
      <span>${won ? '천하를 지켜냈다' : `${reachedStage}라운드에서 무너졌다`} · 최고 ${b.stage}라운드${newBest ? ' · 신기록!' : ''}</span>
      <button class="btn primary" id="rd-retry">다시 시작 <em>도전 ${meta.playsLeft()}회</em></button>
    </div>`;
  document.getElementById('rd-retry').addEventListener('click', () => startNewPlay());
}

// 새 판 시작 — 도전 1 소모(라운드1부터). 남은 도전이 없으면 결제 화면(plays:empty)으로.
// 방어 화면 준비(fieldEl) 후에만 소모 — 아니면 도전만 날리고 판이 안 열리는 버그 방지.
function startNewPlay() {
  if (!fieldEl) return;
  if (!meta.consumePlay()) { emit('plays:empty'); return; }
  started = true;
  beginRun(engine.createRun({}));
}

// ── 10연 소환 리빌 — 깃발을 하나씩 뒤집는다. 등급이 높을수록 빛·소리가 커진다(헌장 #3 가챠 연출). ──
function revealCardHtml(u, i) {
  return `
    <button class="rd-rcard r${u.rarity}" data-i="${i}" style="--i:${i}" aria-label="장수 확인">
      <span class="rd-rcard-in">
        <span class="rd-rcard-back">將</span>
        <span class="rd-rcard-face">
          <img class="rd-rcard-img" src="${heroCut(u.heroId)}" alt="" draggable="false">
          <em class="rd-rcard-rar">${RARITY[u.rarity].name}</em>
          <b class="rd-rcard-name">${HERO_NAME.get(u.heroId)}</b>
        </span>
      </span>
    </button>`;
}

function clearRevealTimers() {
  for (const t of revealTimers) clearTimeout(t);
  revealTimers = [];
}

function closeReveal() {
  clearRevealTimers();
  const stage = document.getElementById('rd-reveal');
  if (stage) stage.remove();
  if (revealing) {
    revealing = false;
    last = performance.now(); // 멈춰 있던 시간이 다음 프레임 dt로 튀지 않게
  }
}

function startReveal(units) {
  closeReveal();
  revealing = true;

  const top = Math.max(...units.map((u) => u.rarity));
  const stage = document.createElement('div');
  stage.className = 'rd-reveal';
  stage.id = 'rd-reveal';
  if (top >= 5) stage.classList.add('omen-legend');
  else if (top >= 4) stage.classList.add('omen-epic');
  stage.innerHTML = `
    <p class="rd-reveal-title">천하의 장수를 불러들인다</p>
    <div class="rd-reveal-grid">${units.map(revealCardHtml).join('')}</div>
    <button class="btn rd-reveal-skip" id="rd-reveal-skip">모두 공개</button>`;
  document.body.appendChild(stage);
  if (top >= 4) play('omen'); // 서광 — 큰 게 온다는 암시

  const cards = [...stage.querySelectorAll('.rd-rcard')];
  const skip = document.getElementById('rd-reveal-skip');
  let revealed = 0;

  const finish = () => {
    skip.textContent = '확인';
    skip.classList.add('primary');
  };

  const flip = (i) => {
    const card = cards[i];
    if (!card || card.classList.contains('open')) return;
    card.classList.remove('tremble');
    stage.classList.remove('dim');
    card.classList.add('open');
    const r = units[i].rarity;
    if (r >= 5) {
      stage.classList.add('flash-legend');
      play('legend'); flash('gold'); vibrate(50);
      setTimeout(() => stage.classList.remove('flash-legend'), 800);
    } else if (r >= 4) {
      stage.classList.add('flash-epic');
      play('epic'); flash('ember'); vibrate(24);
      setTimeout(() => stage.classList.remove('flash-epic'), 480);
    } else if (r >= 3) {
      play('claim'); vibrate(10);
    } else {
      play('tap');
    }
    if (++revealed === cards.length) finish();
  };

  // 순차 공개 — 전설(5성) 앞에서는 화면을 어둡게 깔고 깃발을 떨어 긴장을 만든다
  let at = 300;
  units.forEach((u, i) => {
    if (u.rarity >= 5) {
      const tensionAt = at;
      revealTimers.push(setTimeout(() => { stage.classList.add('dim'); cards[i].classList.add('tremble'); }, tensionAt));
      at += 1100;
      revealTimers.push(setTimeout(() => flip(i), at));
      at += 1400;
    } else if (u.rarity >= 4) {
      revealTimers.push(setTimeout(() => flip(i), at));
      at += 560;
    } else {
      revealTimers.push(setTimeout(() => flip(i), at));
      at += 240;
    }
  });

  // 깃발을 직접 눌러 먼저 확인할 수 있다 — '내가 뽑는' 손맛
  stage.querySelector('.rd-reveal-grid').addEventListener('click', (e) => {
    const c = e.target.closest('.rd-rcard');
    if (c) flip(cards.indexOf(c));
  });

  skip.addEventListener('click', () => {
    if (revealed < cards.length) {
      // 모두 공개 — 촤라락 넘기되 등급 팡파르는 그대로
      clearRevealTimers();
      cards.forEach((c, i) => revealTimers.push(setTimeout(() => flip(i), i * 70)));
      return;
    }
    closeReveal();
  });
}

function loop(now) {
  if (!run) { rafId = 0; return; }
  // 폰 가로 전환 중엔 월드 정지 — 세로 전용이라 화면이 '세로로 돌려주세요'로 덮여 있다
  if (landscapeMQ.matches) { last = now; if (rafId) rafId = requestAnimationFrame(loop); return; }
  // '시작하기' 전엔 월드 정지 — 로딩·타이틀 뒤에서 적이 미리 스폰되지 않게
  if (!started) { last = now; if (rafId) rafId = requestAnimationFrame(loop); return; }
  // 소환 리빌 중엔 월드를 멈춘다 — 깃발을 뒤집는 순간의 긴장을 온전히 (적이 새지 않게)
  if (revealing) { last = now; if (rafId) rafId = requestAnimationFrame(loop); return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // 배속 — 같은 dt로 speed번 틱해 물리를 안정적으로 유지한 채 시간만 빠르게 (x1/x2/x3)
  for (let i = 0; i < speed; i++) {
    engine.tick(run, dt);
    if (run.gameOver || run.won) break;
  }
  syncEnemies();
  syncUnits(); // 유닛이 이동하므로 매 프레임 위치·방향 갱신
  consumeFx();
  updateHud();
  updateBg();
  updatePrep();
  if (rafId) rafId = requestAnimationFrame(loop);
}

export function destroy() {
  closeReveal(); // 리빌 오버레이가 떠 있으면 걷어낸다
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  // 자동 저장 없음 — 세이브는 '저장' 버튼으로만(그래야 '저장한 경우에만 이어하기'가 성립). 탭 전환엔 인메모리 run 유지.
  window.removeEventListener('resize', measureField);
  window.removeEventListener('pointermove', onDragMove);
  drag = null;
  enemyNodes.clear();
  unitNodes.clear();
  if (shotLayer) shotLayer.innerHTML = '';
  fieldEl = enemyLayer = unitLayer = shotLayer = null;
  // run은 null로 만들지 않는다 — 탭 전환에도 인메모리로 유지
}
