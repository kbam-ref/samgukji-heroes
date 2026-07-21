// 삼국지 랜덤 디펜스 — 화면(DOM·연출). 엔진(systems/defense.js)을 rAF로 돌리고 상태를 그린다.
// 성능: 적/유닛 DOM을 id로 재사용하고 transform(translate3d)만 매 프레임 갱신(레이아웃 회피).

import { DEFENSE, ELEMENT_COLOR, ELEMENT_LABEL, SIZE_LABEL, HERO_WEAPON, HERO_ATTACK_TYPE } from '../data/defense.js';
import { HEROES, RARITY, FACTIONS, PERK_LABELS } from '../data/heroes.js';
import * as engine from '../systems/defense.js';
import * as r3d from './defense-3d.js'; // 3D 필드 렌더러(Three.js 빌보드)
import * as dice3d from './dice-3d.js'; // 3D 주사위(Three.js 육면체)
import * as meta from '../systems/rd-meta.js';
import { on, emit } from '../core/events.js';
import { getState, setSetting } from '../core/state.js';
import { fmt } from './format.js';
import { floatText, flash } from './effects.js';
import { showModal } from './modal.js';
import { play, vibrate } from './sound.js';

const HERO_NAME = new Map(HEROES.map((h) => [h.id, h.name]));
const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));
const WNAME = { bow: '활', spear: '창', sword: '칼', magic: '마법' };
const ELEM_GLYPH = { water: '水', fire: '火', earth: '土', wind: '風' }; // 속성 배지 글자 — 색만으론 헷갈려서

// 공격 형태 아이콘 — 이름 앞 작은 네모 안에 창·칼·활·기마 모양
const WEAPON_SVG = {
  spear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 19 5"/><path d="M19 5 13 6.5 M19 5 17.5 11"/></svg>',
  sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 17 7 20 4"/><path d="M5 17 3 21 M7 19 9 21 M15 9 18 12"/></svg>',
  bow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3a13 13 0 0 1 0 18"/><path d="M7 3 7 21"/><path d="M5 12 20 12 16.5 9 M20 12 16.5 15"/></svg>',
  magic: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c1 3-.5 4.5-1.8 6C8.5 10 8 12 9 14c-2-.5-3-2-2.7-4.2C4.7 11 4 13 4.5 15.3 5.4 19.2 8.4 22 12 22c4 0 7-3 7-7 0-3-1.6-5-2.8-6.7C15 6 14 4.5 12 2z"/></svg>',
};
function weaponIcon(heroId) {
  const t = HERO_ATTACK_TYPE[heroId] || 'sword';
  return `<i class="rd-wpn wpn-${t}">${WEAPON_SVG[t]}</i>`;
}

// ── 3D 주사위 — 6면 핀홀 큐브. 굴릴 땐 텀블 애니, 멈추면 결과 면을 앞으로 회전(입체적으로 굴러가는 느낌) ──
const DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const DIE_ROT = { // 결과 값을 앞면으로 + 강한 아이소메트릭 기울기(3면 보이게 = 확실히 서 있는 큐브)
  1: 'rotateX(-25deg) rotateY(-32deg)',
  2: 'rotateX(-25deg) rotateY(148deg)',
  3: 'rotateX(-25deg) rotateY(-122deg)',
  4: 'rotateX(-25deg) rotateY(58deg)',
  5: 'rotateX(-62deg) rotateY(-30deg)',
  6: 'rotateX(62deg) rotateY(-30deg)',
};
function dieFaceHtml(val, cls) {
  let s = '';
  for (let c = 0; c < 9; c++) s += DIE_PIPS[val].includes(c) ? '<i class="rd-pip"></i>' : '<i></i>';
  return `<span class="rd-die-face ${cls}">${s}</span>`;
}
function dieCubeHtml(id) {
  return `<span class="rd-die" id="${id}">${[1, 2, 3, 4, 5, 6].map((v) => dieFaceHtml(v, 'f' + v)).join('')}</span>`;
}

let run = null;
let rafId = 0;
let last = 0;
let speed = 1;            // 전투 배속 x1/x2/x3 (설정에 영속)
let revealing = false;    // 10연 소환 연출 중 — 월드를 멈춘다
let revealTimers = [];
let started = false;      // '시작하기'를 누르기 전엔 월드가 돌지 않는다 (로딩·타이틀 뒤 스폰 방지)
let dangerLevel = 0;      // 패배 임박 경보 단계(0/1/2) — 임계를 넘을 때만 1회 울린다
let sheetMode = null;     // 하단 컨텍스트 시트: null/'summon'/'refund'/'gamble'
let rfFilter = { maxRarity: 1, element: 'all' }; // 반환 조건(성급 이하 · 성향)
let autoMergeMax = 0;     // 자동 합성 고정 성급(0=끔) — 소환할 때마다 이하 그룹 자동 합성(설정 영속)
let autoRefundOn = false; // 자동 반환 스위치 — 켜두면 소환할 때마다 현재 조건(rfFilter)에 맞는 유닛 자동 반환
let gambleTimer = null;   // 주사위 굴림 애니메이션 타이머
let rolling = false;      // 주사위 굴리는 중

// 타이틀의 '시작하기' → 도전 1 소모하고 새 판(라운드1). 도전이 없으면 결제 화면으로.
on('game:begin', () => startNewPlay());

// 저장해 둔 판을 불러온다. 불러오면 세이브 소모(1저장=1이어하기). 방어 화면 준비 후에만
// 부작용(clearRun) 실행 — 설정탭 등 fieldEl 없을 때 세이브만 지워지고 로드 안 되는 버그 방지.
on('game:load', () => {
  if (!fieldEl) emit('nav:battle'); // 설정 탭 등에서 방어 화면이 언마운트됐으면 먼저 마운트
  if (!fieldEl) return;
  const saved = loadRun();
  clearRun();
  started = true;
  beginRun(saved || engine.createRun({}));
});

// 앱이 백그라운드로 나갔다 시작화면이 다시 뜨는 동안 — 월드 정지 + 리빌 잔재 정리
on('game:suspend', () => { started = false; closeReveal(); });

// 하단바 액션(소환/합성/반환/도박) — tabs.js가 이벤트를 쏘면 여기서 처리한다.
// 방어 화면이 언마운트(설정 탭 등)면 nav:battle로 먼저 되살린 뒤 실행.
function actGuard(fn) {
  if (!fieldEl) emit('nav:battle');
  if (fieldEl) fn();
}
on('rd:summon', () => actGuard(() => { closeSheet(); doSummon1(); })); // 원클릭 소환(시트 없이 바로 1회). 꾹 누르면 tabs.js가 반복 발행
on('rd:upgrade', () => actGuard(() => toggleSheet('upgrade')));
on('rd:merge', () => actGuard(() => { closeSheet(); play('tap'); openMergePicker(); }));
on('rd:refund', () => actGuard(() => toggleSheet('refund')));
on('rd:gamble', () => actGuard(() => toggleSheet('gamble')));

let fieldEl = null;
let labelLayer = null; // 유닛 이름·별 오버레이(3D 위에 투영)
let shotLayer = null; // 투사체(참격·화살)·명중 불꽃 레이어
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const labelNodes = new Map(); // uid -> {el, rarity, element}
let fieldW = 0;
let fieldH = 0;
let saveTick = 0;
const AUTOSAVE_SEC = 3; // 연속 자동저장 주기(초) — 강제종료 되감기(세이브 스컴) 방지
let drag = null; // { uid, startX, startY, moved }
// 폰 가로 전환 — 세로 전용이라 가로에선 게임 루프를 멈춘다(CSS #rotate-guard가 화면을 덮음)

// ── 왼쪽 정보 패널 — 영웅을 탭하면 그 영웅 상세를 표시(v114 가로) ──
let selectedUid = null;
function selectHero(uid) {
  selectedUid = uid;
  play('tap'); vibrate(6);
  renderHeroInfo();
}
function renderHeroInfo() {
  const box = document.getElementById('rd-hero-info');
  if (!box) return;
  const u = run && selectedUid != null ? run.units.find((x) => x.uid === selectedUid) : null;
  if (!u) { selectedUid = null; box.innerHTML = '<p class="rd-hi-empty">영웅을 탭하면<br>정보가 나와요</p>'; return; }
  const h = HERO_BY_ID.get(u.heroId) || {};
  const info = DEFENSE.unit.byRarity[u.rarity] || {};
  const atype = HERO_ATTACK_TYPE[u.heroId] || 'sword';
  const tier = Math.min(6, u.rarity);
  const atk = Math.round((u.base || h.base || 0) * (info.dmg || 1));
  const rate = info.cooldown ? (1 / info.cooldown).toFixed(2) : '—';
  box.innerHTML = `
    <div class="rd-hi-name tier-${tier}">${weaponIcon(u.heroId)}<b>${h.name || ''}</b></div>
    <div class="rd-hi-sub">${RARITY[u.rarity]?.name || ''} · ${FACTIONS[h.faction]?.name || '군웅'}</div>
    ${h.title ? `<div class="rd-hi-title">「${h.title}」</div>` : ''}
    <div class="rd-hi-badges">
      <span class="rd-hi-elem" style="color:${ELEMENT_COLOR[u.element]}">${ELEM_GLYPH[u.element] || ''} ${ELEMENT_LABEL[u.element] || ''}</span>
      <span class="rd-hi-wpn wpn-${atype}">${WNAME[atype] || '칼'}</span>
    </div>
    <ul class="rd-hi-stats">
      <li><span>무력</span><b>${fmt(h.base || 0)}</b></li>
      <li><span>공격력</span><b>${fmt(atk)}</b></li>
      <li><span>사거리</span><b>${info.range || '—'}</b></li>
      <li><span>공격속도</span><b>${rate}/초</b></li>
      <li><span>동시타격</span><b>${info.multi || 1}명</b></li>
      ${info.aoe ? `<li><span>광역기</span><b>${info.aoe.interval}초</b></li>` : ''}
    </ul>
    ${h.perk ? `<div class="rd-hi-perk">특성 · ${PERK_LABELS[h.perk.kind] || ''} +${h.perk.value}%</div>` : ''}`;
}

// 화면 좌표 → 필드 %(3D 바닥 레이캐스트). 강제 가로(90°CW 회전) 땐 포인터를 필드 로컬 px로 역매핑.
function fieldFromClient(clientX, clientY) {
  const r = fieldEl.getBoundingClientRect();
  if (document.body.classList.contains('force-rotate')) {
    // 회전 매핑: 필드로컬 x = clientY - r.top, y = (r.left + r.width) - clientX
    return r3d.fieldFromPx(clientY - r.top, r.left + r.width - clientX);
  }
  return r3d.fieldFromPx(clientX - r.left, clientY - r.top);
}
// 누른 지점에서 가장 가까운 유닛을 잡는다(9% 이내). 배치 드래그 대상 선택.
function pickUnitAt(clientX, clientY) {
  if (!run) return null;
  const p = fieldFromClient(clientX, clientY);
  if (!p) return null;
  let best = null, bestD = 1e9;
  for (const u of run.units) {
    const d = Math.hypot(u.x - p.x, u.y - p.y);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best && bestD <= 9 ? best.uid : null;
}
function onDragMove(e) {
  if (!drag || !run) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 16) drag.moved = true; // 탭 관대하게(모바일 손가락 오차 — Z.ai 리뷰 반영 11→16)
  if (!drag.moved) return;
  const p = fieldFromClient(e.clientX, e.clientY);
  if (!p) return;
  const b = DEFENSE.unit.bounds;
  const u = run.units.find((x) => x.uid === drag.uid);
  if (u) { // 링 안에 확실히 들어오게 여유(inset). 아래(y2)·왼쪽(x1)은 원근상 더 안쪽으로.
    u.tx = Math.max(b.x1 + 4, Math.min(b.x2 - 3, p.x));
    u.ty = Math.max(b.y1 + 2, Math.min(b.y2 - 5, p.y));
  }
}
// 리사이즈 — 필드 크기 재측정 + 3D 렌더러 리사이즈
function onResize() {
  measureField();
  r3d.resize(fieldW, fieldH);
}
function onDragUp() {
  window.removeEventListener('pointermove', onDragMove);
  if (drag && !drag.moved) selectHero(drag.uid); // v114: 탭 = 왼쪽 정보 패널에 그 영웅 표시(끌면 이동)
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
/** 콜드 부팅 시 호출 — 재실행은 항상 새 판(수석). 남은 세이브를 지워 자동 이어하기를 막는다. */
export function clearSavedRun() { clearRun(); }

function heroCut(id) {
  return `./assets/heroes-cut/${id}.png`;
}
function enemyCut(id) {
  return `./assets/enemies-cut/${id}.png`;
}

// 전장 배경(아레나) — ~13라운드마다 교체
const ARENAS = ['arena-plain', 'arena-grass', 'arena-sand', 'arena-camp', 'arena-stone', 'arena-marsh', 'arena-ash', 'arena-snow', 'arena-jade', 'arena-crimson'];
let shownArena = '';
function updateBg() {
  if (!run) return;
  const id = ARENAS[Math.floor((run.stage - 1) / 3) % ARENAS.length]; // ~3라운드마다 전장 교체(30라운드에 10종 순환)
  if (id !== shownArena) { r3d.setArena(`./assets/bg/${id}.png`); shownArena = id; } // 3D 전장 바닥에 아레나 그림
}

function measureField() {
  const r = fieldEl.getBoundingClientRect();
  // 강제 가로(90° 회전) 상태면 getBoundingClientRect가 회전된 AABB를 줘 가로/세로가 뒤바뀜 → 되돌린다
  if (document.body.classList.contains('force-rotate')) { fieldW = r.height; fieldH = r.width; }
  else { fieldW = r.width; fieldH = r.height; }
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
  if (!shotLayer) return;
  // 3D 투영 — 유닛 몸통(0.55h)에서 적 몸통(0.42h)으로. 원근에 맞게 화면 좌표로.
  const a = r3d.project(fx.ux, fx.uy, 0.55);
  const c = r3d.project(fx.ex, fx.ey, 0.42);
  const sx = a.sx, sy = a.sy;
  const dxpx = c.sx - a.sx;
  const dypx = c.sy - a.sy;
  const ang = (Math.atan2(dypx, dxpx) * 180) / Math.PI;
  const weapon = HERO_WEAPON[fx.heroId] || 'slash';
  const color = ELEMENT_COLOR[fx.element] || '#e9d6a0';
  // 동작 줄이기(reduce motion) 폰에서도 공격 피드백은 남긴다 — 날아가는 연출 없이 명중 불꽃만.
  if (reduceMotion) { spawnImpact(fx.ex, fx.ey, color, weapon, ang); return; }
  if (shotLayer.childElementCount > 30) return; // 저사양 보호 — 밀리면 솎아낸다
  const t = weapon === 'arrow' ? 240 : 100; // 화살은 더 오래 날아 잘 보인다(원거리)
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
    spawnImpact(fx.ex, fx.ey, color, weapon, ang); // 명중 순간 불꽃(+화살이면 꽂힘)
  }, t);
}
function spawnImpact(x, y, color, weapon, ang = 0) {
  if (!shotLayer || shotLayer.childElementCount > 36) return; // 명중 불꽃은 동작줄이기에서도 남긴다(공격 피드백)
  const p = r3d.project(x, y, 0.42);
  const s = getFxEl();
  s.className = `rd-impact ${weapon}`;
  s.style.left = `${p.sx}px`;
  s.style.top = `${p.sy}px`;
  s.style.setProperty('--c', color);
  shotLayer.appendChild(s);
  setTimeout(() => releaseFxEl(s), 260);
  // 화살류는 명중 지점에 화살이 잠깐 꽂힌다
  if (weapon === 'arrow' && shotLayer.childElementCount < 40) {
    const a = getFxEl();
    a.className = 'rd-stuck';
    a.style.left = `${p.sx}px`;
    a.style.top = `${p.sy}px`;
    a.style.setProperty('--ang', `${ang}deg`);
    shotLayer.appendChild(a);
    setTimeout(() => releaseFxEl(a), 460);
  }
}

// 초월 광역기 파문 — 유닛 자리에서 링이 전장 크기로 퍼진다
function aoeRing(x, y, element) {
  if (!fieldEl || reduceMotion) return;
  const p = r3d.project(x, y, 0.1);
  const r = document.createElement('i');
  r.className = 'rd-aoe';
  r.style.left = `${p.sx}px`;
  r.style.top = `${p.sy}px`;
  r.style.setProperty('--c', ELEMENT_COLOR[element] || '#ffe6a2');
  (shotLayer || fieldEl).appendChild(r);
  setTimeout(() => r.remove(), 640);
}

// 보스 출현 배너 — 필드 위로 '보스 출현!'이 크게 밀려들었다 사라진다 (긴장 연출)
function bossBanner() {
  if (!fieldEl || reduceMotion) return;
  const old = fieldEl.querySelector('.rd-boss-banner');
  if (old) old.remove();
  const b = document.createElement('div');
  b.className = 'rd-boss-banner';
  b.innerHTML = '<b>보스 출현!</b><span>강한 적이 밀려온다</span>';
  fieldEl.appendChild(b);
  setTimeout(() => b.remove(), 1600);
}

function hud() {
  const cap = engine.stageCap();
  const per = DEFENSE.wave.perStage;
  return `
    <div class="rd-hud">
      <div class="rd-stat"><b id="rd-stage">1</b><span>/ ${cap} 라운드</span></div>
      <div class="rd-stat rd-gold"><b id="rd-gold">0</b><span>골드</span></div>
      <div class="rd-stat rd-alive"><b id="rd-alive">0</b><span>/ ${DEFENSE.wave.loseAt} 화면 적</span></div>
      <div class="rd-stat rd-time"><b id="rd-time">0:00</b><span>경과</span></div>
    </div>
    <div class="rd-spawnbar" aria-hidden="true">
      <i id="rd-spawn-fill"></i>
      <b id="rd-spawn-txt">이번 라운드 0 / ${per} 출현</b>
      <em id="rd-round-elem" class="rd-round-elem"></em>
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

  const cap = engine.stageCap();
  const per = DEFENSE.wave.perStage;
  const loseAt = DEFENSE.wave.loseAt;
  root.insertAdjacentHTML(
    'beforeend',
    `
    <section class="screen rd-screen">
      <aside class="rd-info" id="rd-info">
        <div class="rd-hud">
          <div class="rd-stat"><b id="rd-stage">1</b><span>/ ${cap} 라운드</span></div>
          <div class="rd-stat rd-gold"><b id="rd-gold">0</b><span>골드</span></div>
          <div class="rd-stat rd-alive"><b id="rd-alive">0</b><span>/ ${loseAt} 화면 적</span></div>
          <div class="rd-stat rd-time"><b id="rd-time">0:00</b><span>경과</span></div>
        </div>
        <div class="rd-hero-info" id="rd-hero-info"><p class="rd-hi-empty">영웅을 탭하면<br>정보가 나와요</p></div>
      </aside>
      <div class="rd-center">
        <div class="rd-spawnbar" aria-hidden="true">
          <i id="rd-spawn-fill"></i>
          <b id="rd-spawn-txt">이번 라운드 0 / ${per} 출현</b>
          <em id="rd-round-elem" class="rd-round-elem"></em>
        </div>
        <div class="rd-field" id="rd-field">
        <div class="rd-3d-wrap" id="rd-3d-wrap" aria-hidden="true"></div>
        <div class="rd-labels" id="rd-labels" aria-hidden="true"></div>
        <div class="rd-shots" id="rd-shots" aria-hidden="true"></div>
        <button class="rd-gear" id="rd-gear" aria-label="설정"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.8 V6 M12 18 V20.2 M3.8 12 H6 M18 12 H20.2 M6.3 6.3 L7.9 7.9 M16.1 16.1 L17.7 17.7 M17.7 6.3 L16.1 7.9 M7.9 16.1 L6.3 17.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
        <button class="rd-speed" id="rd-speed" aria-label="전투 배속">1×</button>
        <div class="rd-timer" id="rd-timer" hidden><b id="rd-timer-n">60</b><span>초</span></div>
        <div class="rd-prep" id="rd-prep" hidden>
          <b class="rd-prep-n">15</b>
          <span class="rd-prep-sub">전투 시작까지 · 장수를 배치하세요</span>
        </div>
        <button class="rd-next" id="rd-next" hidden>다음 라운드 ▶</button>
        <div class="rd-over" id="rd-over" hidden></div>
      </div>
        <p class="rd-tip" id="rd-tip"><b>소환</b>한 장수를 <b>끌어</b> 적 길목에 배치하세요</p>
      </div>
      <div class="rd-sheet" id="rd-sheet" hidden></div>
    </section>`
  );

  fieldEl = document.getElementById('rd-field');
  labelLayer = document.getElementById('rd-labels');
  shotLayer = document.getElementById('rd-shots');
  measureField();
  // 3D 필드 렌더러 — 캔버스를 rd-3d-wrap에 마운트(엔진 좌표를 빌보드로)
  r3d.dispose();
  r3d.init(document.getElementById('rd-3d-wrap'), fieldW, fieldH);

  // 설정 — 상단 톱니 버튼이 설정 오버레이를 연다
  document.getElementById('rd-gear').addEventListener('click', () => { play('tap'); emit('nav:settings'); });

  // 다음 라운드 — 다 잡았는데 타이머가 남았으면 기다리지 않고 바로 넘어간다(수석)
  document.getElementById('rd-next').addEventListener('click', () => {
    if (!run || run.prepLeft > 0 || run.gameOver || run.won) return;
    run.roundLeft = 0.02; // 타이머를 끝내 즉시 다음 라운드로(엔진이 처리)
    play('drum'); vibrate(20);
  });

  // 전투 배속 — 저장된 값에서 이어받아 칩에 반영
  speed = clampSpeed(getState().settings?.rdSpeed);
  updateSpeedChip();
  autoMergeMax = Math.max(0, Math.min(5, Math.round(Number(getState().settings?.rdAutoMerge) || 0))); // 자동 합성 고정(영속)
  autoRefundOn = !!getState().settings?.rdAutoRefund; // 자동 반환 스위치(영속)
  const rf = getState().settings?.rdRefund;
  if (rf) rfFilter = { maxRarity: rf.maxRarity ?? 1, element: rf.element ?? 'all' };
  document.getElementById('rd-speed').addEventListener('click', () => {
    speed = speed >= 3 ? 1 : speed + 1;
    setSetting('rdSpeed', speed);
    updateSpeedChip();
    play('tap');
    vibrate(6);
  });

  // 하단 컨텍스트 시트 — 소환/반환/도박 옵션을 여기 빈 공간에 펼친다(tabs.js 이벤트로 열림).
  const sheetEl = document.getElementById('rd-sheet');
  sheetEl.addEventListener('click', onSheetClick);
  sheetEl.addEventListener('pointerdown', onSheetPointerDown); // 홀드 반복(소환1회·단련)
  sheetEl.addEventListener('pointerup', stopHold);
  sheetEl.addEventListener('pointercancel', stopHold);
  sheetEl.addEventListener('pointerleave', stopHold);

  // 유닛 배치 — 필드를 눌러 가장 가까운 유닛을 잡고 끌면 그 지점으로 걸어간다(레이캐스트로 바닥 히트).
  fieldEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .rd-over, .rd-prep')) return; // 버튼/오버레이 위는 제외
    const uid = pickUnitAt(e.clientX, e.clientY);
    if (uid == null) return;
    drag = { uid, startX: e.clientX, startY: e.clientY, moved: false };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp, { once: true });
  });

  window.addEventListener('resize', onResize);

  updateHud();
  updatePrep();
  shownArena = '';
  syncEnemies();
  syncUnits();
  r3d.frame(0); // 첫 페인트
  updateBg();
  last = performance.now();
  rafId = requestAnimationFrame(loop);
  // 게임오버/승리 상태로 재진입(탭 복귀)했으면 결과화면을 다시 띄운다(새 판은 '다시 시작'=도전 소모로만)
  if (run.gameOver || run.won) showOver(run.won);
}

// 소환 실패 안내 — 배치칸이 무제한이라 실패 사유는 골드 부족뿐
function summonFail(btnId) {
  vibrate(8);
  const btn = document.getElementById(btnId);
  if (btn) { btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); }
  floatText(window.innerWidth / 2, window.innerHeight * 0.52, '골드가 부족해요', 'warn');
}

function updateHud() {
  if (!run) return;
  const s = document.getElementById('rd-stage');
  const g = document.getElementById('rd-gold');
  const a = document.getElementById('rd-alive');
  if (s) s.textContent = run.stage;
  if (g) g.textContent = fmt(Math.floor(run.gold));
  if (a) {
    const alive = run.enemies.length;
    const loseAt = DEFENSE.wave.loseAt;
    a.textContent = alive;
    a.parentElement.classList.toggle('danger', alive >= loseAt * 0.75);
    // 패배 임박 경보 — 임계를 '처음' 넘는 순간 1회 소리·진동(방치·배속 중 조용히 100 도달 방지)
    const lvl = alive >= loseAt * 0.9 ? 2 : alive >= loseAt * 0.75 ? 1 : 0;
    if (lvl > dangerLevel && !run.prepLeft) {
      if (lvl === 2) { play('danger'); vibrate([0, 60, 50, 80]); }
      else { play('foehit'); vibrate(30); }
    }
    dangerLevel = lvl;
  }
  // 경과 시간(기록) — 처치 수 대신
  const tEl = document.getElementById('rd-time');
  if (tEl) {
    const s = Math.floor(run.elapsed || 0);
    tEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  // '다음 라운드' 버튼 — 이번 라운드 다 스폰+다 처치했는데 타이머가 남았을 때만
  const nextBtn = document.getElementById('rd-next');
  if (nextBtn) {
    const cleared = !run.prepLeft && !run.gameOver && !run.won
      && run.spawned >= (run.toSpawn || 1e9) && run.enemies.length === 0 && (run.roundLeft ?? 0) > 1;
    nextBtn.hidden = !cleared;
  }
  // 라운드 제한 시간 — 전투 중에만 표시, 10초 이하 빨갛게
  const timer = document.getElementById('rd-timer');
  if (timer) {
    if (run.prepLeft > 0 || run.gameOver || run.won) {
      timer.hidden = true;
    } else {
      timer.hidden = false;
      const t = Math.max(0, Math.ceil(run.roundLeft ?? DEFENSE.wave.roundTime));
      const n = document.getElementById('rd-timer-n');
      if (n) n.textContent = t;
      timer.classList.toggle('low', t <= 10);
    }
  }
  // 이번 라운드 출현 진행 (스폰 N / 총)
  const per = DEFENSE.wave.perStage;
  const spawned = Math.min(run.spawned || 0, per);
  const fill = document.getElementById('rd-spawn-fill');
  const stxt = document.getElementById('rd-spawn-txt');
  if (fill) {
    fill.style.width = `${(spawned / per) * 100}%`;
    if (run.stageElement) { fill.style.background = ELEMENT_COLOR[run.stageElement]; fill.style.opacity = '0.5'; }
  }
  if (stxt) stxt.textContent = `이번 라운드 ${spawned} / ${per} 출현`;
  // 이번 라운드 적 속성(라운드마다 통일) — 상성 유닛을 배치하도록 색·글자로 안내
  const re = document.getElementById('rd-round-elem');
  if (re && run.stageElement) {
    re.textContent = `${ELEM_GLYPH[run.stageElement]} ${ELEMENT_LABEL[run.stageElement]}`;
    re.style.color = ELEMENT_COLOR[run.stageElement];
  }
  // 하단바 '합성' 배지 — 합성 가능(3장) 또는 자동 합성 고정 중이면 점등
  const mergeBadge = document.querySelector('#rd-nav-merge .nav-badge');
  if (mergeBadge) mergeBadge.hidden = autoMergeMax === 0 && engine.mergeableHeroes(run).length === 0;

  // 열려 있는 시트 내용 실시간 갱신(소환 비용 / 속성단련 / 반환 미리보기 / 도박 쿨다운)
  if (sheetMode === 'summon') updateSummonSheet();
  else if (sheetMode === 'upgrade') updateUpgradeSheet();
  else if (sheetMode === 'refund') updateRefundSheet();
  else if (sheetMode === 'gamble') updateGambleSheet();
}

// ── 등급이 높을수록 크게 축포를 터뜨린다 (소환의 손맛) ──
function summonFanfare(rarity) {
  if (rarity >= 5) { play('legend'); flash('gold'); vibrate(40); }
  else if (rarity >= 4) { play('epic'); flash('ember'); vibrate(22); }
  else if (rarity >= 3) { play('claim'); vibrate(10); }
  else play('tap');
}
// 전설(4)·신화(5)·초월(6) 소환 — 전투화면 가운데에 등급 획득 연출(빛살+등급명+영웅명). 메이플 운빨 디펜스식 희열.
const GRADE_NAME = { 4: '전설', 5: '신화', 6: '초월' };
function gradeReveal(rarity, heroName) {
  if (rarity < 4) return;
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = `rd-grade-reveal tier-${rarity}`;
  el.innerHTML = `<i class="rd-gr-rays"></i><i class="rd-gr-burst"></i><b class="rd-gr-grade">${GRADE_NAME[rarity]} 획득!</b><span class="rd-gr-name">${heroName || ''}</span>`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), rarity >= 5 ? 2100 : 1700);
}

// ── 하단 컨텍스트 시트 — 소환/반환/도박 옵션을 도크 빈 공간에 펼친다 ──
function toggleSheet(mode) {
  if (sheetMode === mode) { closeSheet(); return; }
  openSheet(mode);
}
function openSheet(mode) {
  const sheet = document.getElementById('rd-sheet');
  const tip = document.getElementById('rd-tip');
  if (!sheet) return;
  sheetMode = mode;
  if (mode === 'summon') sheet.innerHTML = sheetSummonHtml();
  else if (mode === 'upgrade') sheet.innerHTML = sheetUpgradeHtml();
  else if (mode === 'refund') sheet.innerHTML = sheetRefundHtml();
  else if (mode === 'gamble') sheet.innerHTML = sheetGambleHtml();
  sheet.dataset.mode = mode;
  sheet.hidden = false;
  if (tip) tip.hidden = true;
  if (mode === 'gamble') { // 3D 주사위 캔버스 초기화(레이아웃 후)
    const cv = document.getElementById('rd-dice3d');
    if (cv) requestAnimationFrame(() => { const w = Math.round(cv.clientWidth) || 260, h = Math.round(cv.clientHeight) || 96; dice3d.dispose(); dice3d.init(cv, w, h); });
  }
  play('tap');
  if (mode === 'summon') updateSummonSheet();
  else if (mode === 'upgrade') updateUpgradeSheet();
  else if (mode === 'refund') updateRefundSheet();
  else if (mode === 'gamble') updateGambleSheet();
}
function closeSheet() {
  const sheet = document.getElementById('rd-sheet');
  const tip = document.getElementById('rd-tip');
  stopHold();
  if (gambleTimer) { clearInterval(gambleTimer); gambleTimer = null; }
  if (dice3d.ready()) dice3d.dispose(); // 3D 주사위 렌더러 해제
  rolling = false;
  sheetMode = null;
  if (sheet) { sheet.hidden = true; sheet.innerHTML = ''; sheet.removeAttribute('data-mode'); }
  if (tip) tip.hidden = false;
  // 하단바 액션 하이라이트 해제
  for (const b of document.querySelectorAll('#tab-bar .tab.act')) b.classList.remove('sheet-open');
}

function sheetSummonHtml() {
  return `
    <div class="rd-sheet-head"><b>소환</b><span class="rd-sheet-hint">꾹 누르면 연속 소환</span><button class="rd-sheet-x" data-x aria-label="닫기">✕</button></div>
    <div class="rd-summon-opts">
      <button class="btn primary rd-summon-one" data-s="1"><b>소환</b><span id="rd-s1-cost"></span></button>
    </div>`;
}
function sheetUpgradeHtml() {
  const rows = ['fire', 'wind', 'earth', 'water'].map((k) =>
    `<div class="rd-eu-row">
      <b class="rd-eu-name" style="color:${ELEMENT_COLOR[k]}">${ELEM_GLYPH[k]} ${ELEMENT_LABEL[k]}</b>
      <button class="rd-eu-btn" data-eu="${k}" data-euk="atk"><span>공격 <em data-eulv="${k}-atk"></em></span><span class="rd-eu-cost" data-eucost="${k}-atk"></span></button>
      <button class="rd-eu-btn" data-eu="${k}" data-euk="spd"><span>공속 <em data-eulv="${k}-spd"></em></span><span class="rd-eu-cost" data-eucost="${k}-spd"></span></button>
    </div>`).join('');
  return `
    <div class="rd-sheet-head"><b>속성 단련 — 그 속성 전 유닛 공격력·공속</b><button class="rd-sheet-x" data-x aria-label="닫기">✕</button></div>
    <div class="rd-eu-list">${rows}</div>`;
}
function sheetRefundHtml() {
  const rar = [1, 2, 3, 4].map((r) => `<button class="rd-chip${rfFilter.maxRarity === r ? ' on' : ''}" data-mr="${r}">${r}★ 이하</button>`).join('');
  const els = [['all', '전체'], ['fire', '火'], ['wind', '風'], ['water', '水'], ['earth', '土']]
    .map(([k, l]) => `<button class="rd-chip${rfFilter.element === k ? ' on' : ''}" data-el="${k}">${l}</button>`).join('');
  return `
    <div class="rd-sheet-head"><b>반환 — 조건 선택</b><button class="rd-sheet-x" data-x aria-label="닫기">✕</button></div>
    <div class="rd-rf-row"><span>성급</span><div class="rd-chips">${rar}</div></div>
    <div class="rd-rf-row"><span>성향</span><div class="rd-chips">${els}</div></div>
    <button class="btn primary rd-rf-go" data-go></button>
    <button class="rd-auto-switch${autoRefundOn ? ' on' : ''}" data-autorf>
      <span class="rd-switch"><i></i></span>
      <b>자동 반환 ${autoRefundOn ? '켜짐 — 소환 시 이 조건 자동' : '꺼짐'}</b>
    </button>`;
}
function sheetGambleHtml() {
  const g = DEFENSE.gamble;
  return `
    <div class="rd-sheet-head"><b>도박 — 주사위 두 개</b><button class="rd-sheet-x" data-x aria-label="닫기">✕</button></div>
    <canvas class="rd-dice3d" id="rd-dice3d"></canvas>
    <div class="rd-gm-result" id="rd-gm-result" hidden></div>
    <div class="rd-gm-info" id="rd-gm-info">합계 ×${g.perPip}골드 · <em>더블이면 럭키! ${g.doubleGold}골드</em></div>
    <button class="btn primary rd-gm-go" data-roll>굴리기 · 골드 ${g.cost}</button>`;
}

function updateSummonSheet() {
  if (!run) return;
  const cost = DEFENSE.summon.cost;
  const free = run.freePulls;
  const s1 = document.getElementById('rd-s1-cost');
  if (s1) s1.textContent = free > 0 ? `무료 · ${free}회 남음` : `골드 ${cost}`;
  const s10 = document.getElementById('rd-s10-cost');
  if (s10) {
    const freeUse = Math.min(10, free);
    const goldCost = (10 - freeUse) * cost;
    s10.textContent = freeUse >= 10 ? '무료 10회' : freeUse > 0 ? `무료 ${freeUse} + 골드 ${fmt(goldCost)}` : `골드 ${fmt(goldCost)}`;
  }
}
function updateRefundSheet() {
  if (!run) return;
  const go = document.querySelector('#rd-sheet .rd-rf-go');
  if (!go) return;
  const { count, gold } = engine.refundPreview(run, rfFilter);
  go.textContent = count ? `조건 ${count}명 반환 · +${fmt(gold)} 골드` : '해당 조건에 맞는 장수 없음';
  go.disabled = count === 0;
}
function updateUpgradeSheet() {
  if (!run) return;
  const eu = DEFENSE.unit.elemUpgrade;
  for (const k of ['fire', 'wind', 'earth', 'water']) {
    for (const kind of ['atk', 'spd']) {
      const lv = run.elemLevel?.[k]?.[kind] || 0;
      const lvEl = document.querySelector(`[data-eulv="${k}-${kind}"]`);
      const costEl = document.querySelector(`[data-eucost="${k}-${kind}"]`);
      if (lvEl) lvEl.textContent = `Lv.${lv}`;
      if (costEl) costEl.textContent = lv >= eu.maxLevel ? '최대' : fmt(engine.elemUpgradeCost(run, k, kind));
    }
  }
}
function updateGambleSheet() {
  if (!run) return;
  const go = document.querySelector('#rd-sheet .rd-gm-go');
  if (!go) return;
  if (rolling) { go.disabled = true; return; }
  if (run.gambleCd > 0) { go.textContent = `${Math.ceil(run.gambleCd)}초 후 가능`; go.disabled = true; }
  else { go.textContent = `굴리기 · 골드 ${DEFENSE.gamble.cost}`; go.disabled = false; }
}
function doElemUpgrade(el, kind) {
  if (engine.elemUpgrade(run, el, kind)) {
    play('claim'); vibrate(10);
    floatText(window.innerWidth / 2, window.innerHeight * 0.42, `${ELEMENT_LABEL[el]} ${kind === 'spd' ? '공속' : '공격'} +1`, 'gold');
    syncUnits(); updateHud(); updateUpgradeSheet();
  } else { vibrate(8); }
}

// 자동 합성 고정 — 소환 직후 이하 성급 그룹을 자동으로 합성(소환하다 요건되면 바로 합쳐진다)
function autoMergeIfPinned() {
  if (autoMergeMax > 0 && run) {
    const n = engine.mergeAuto(run, autoMergeMax);
    if (n) { play('claim'); floatText(window.innerWidth / 2, window.innerHeight * 0.34, `자동 합성 ${n}회`, 'gold'); syncUnits(); updateHud(); }
  }
}
function doSummon1() {
  const u = engine.summon(run);
  if (!u) { summonFail(); return; }
  summonFanfare(u.rarity);
  gradeReveal(u.rarity, HERO_NAME.get(u.heroId)); // 전설+ 중앙 획득 연출
  syncUnits();
  updateHud();
  autoMergeIfPinned();
  autoRefundIfOn();
}
function doSummon10() {
  const made = engine.summonMany(run, 10);
  if (!made.length) { summonFail(); return; }
  syncUnits();
  updateHud();
  startReveal(made);
  autoMergeIfPinned();
  autoRefundIfOn();
}
function doRefundBulk() {
  const { count, gold } = engine.refundBulk(run, rfFilter);
  if (!count) { vibrate(8); return; }
  play('claim'); vibrate(12);
  floatText(window.innerWidth / 2, window.innerHeight * 0.42, `${count}명 반환 · +${fmt(gold)} 골드`, 'jade');
  syncUnits();
  updateHud();
  updateRefundSheet();
}
function doGamble() {
  if (rolling) return;
  if (run.gambleCd > 0) {
    vibrate(8);
    floatText(window.innerWidth / 2, window.innerHeight * 0.42, `${Math.ceil(run.gambleCd)}초 후 가능`, 'warn');
    return;
  }
  if (run.gold < DEFENSE.gamble.cost) {
    vibrate(8);
    floatText(window.innerWidth / 2, window.innerHeight * 0.42, '골드가 부족해요', 'warn');
    return;
  }
  const res = engine.gamble(run); // {won,d1,d2,jackpot} — 골드는 즉시 차감·지급
  if (!res) { vibrate(8); return; }
  rolling = true;
  play('tap'); vibrate(8);
  dice3d.lucky(false);
  const resEl = document.getElementById('rd-gm-result');
  if (resEl) { resEl.hidden = true; resEl.classList.remove('pop'); } // 이전 결과 숨김
  const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  dice3d.roll(res.d1, res.d2, () => { // 3D 주사위가 물리적으로 굴러 결과 면이 위로 안착
    rolling = false;
    const dice = `<span class="rd-gm-face">${FACE[res.d1]}</span><span class="rd-gm-face">${FACE[res.d2]}</span>`;
    if (res.jackpot) {
      if (resEl) resEl.innerHTML = `<div class="rd-gm-dice lucky">${dice}<em>더블 ${res.d1}!</em></div><b class="rd-gm-won lucky">럭키! +${fmt(res.won)}골드</b>`;
      dice3d.lucky(true);
      play('legend'); flash('gold'); vibrate(50);
    } else {
      if (resEl) resEl.innerHTML = `<div class="rd-gm-dice">${dice}<em>= ${res.d1 + res.d2}</em></div><b class="rd-gm-won">+${fmt(res.won)}골드</b>`;
      play('claim'); vibrate(12);
    }
    if (resEl) { resEl.hidden = false; void resEl.offsetWidth; resEl.classList.add('pop'); } // 리플로우 후 팝 애니
    updateHud();
  });
}

// 홀드 반복 — 소환 1회·속성 단련 버튼을 꾹 누르면 연속 실행 (수석: 버튼 누르고 있으면 반복)
let holdTimer = null, holdInterval = null, holdFn = null;
function startHold(fn) {
  stopHold();
  holdFn = fn;
  fn(); // 즉시 1회
  holdTimer = setTimeout(() => { holdInterval = setInterval(() => { if (holdFn) holdFn(); }, 150); }, 360);
}
function stopHold() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
  holdFn = null;
}
function onSheetPointerDown(e) {
  const s = e.target.closest('[data-s]');
  if (s && s.dataset.s === '1') { startHold(doSummon1); return; } // 1회 소환 홀드(10연은 리빌 때문에 단발)
  const eu = e.target.closest('[data-eu]');
  if (eu) { startHold(() => doElemUpgrade(eu.dataset.eu, eu.dataset.euk)); return; } // 속성 단련 홀드
}

function onSheetClick(e) {
  if (e.target.closest('[data-x]')) { closeSheet(); return; }
  const s = e.target.closest('[data-s]');
  if (s) { if (s.dataset.s === '10') doSummon10(); return; } // 1회 소환·단련은 홀드(pointerdown)에서 처리
  const mr = e.target.closest('[data-mr]');
  if (mr) { rfFilter.maxRarity = Number(mr.dataset.mr); refreshRefundChips(); return; }
  const el = e.target.closest('[data-el]');
  if (el) { rfFilter.element = el.dataset.el; refreshRefundChips(); return; }
  if (e.target.closest('[data-go]')) { doRefundBulk(); return; }
  if (e.target.closest('[data-autorf]')) { toggleAutoRefund(); return; }
  if (e.target.closest('[data-roll]')) { doGamble(); return; }
}
// 자동 반환 스위치 — 켜면 지금 한 번 반환 + 이후 소환할 때마다 이 조건으로 자동 반환
function toggleAutoRefund() {
  autoRefundOn = !autoRefundOn;
  setSetting('rdAutoRefund', autoRefundOn);
  vibrate(12);
  if (autoRefundOn) {
    const { count, gold } = engine.refundBulk(run, rfFilter);
    if (count) { play('claim'); floatText(window.innerWidth / 2, window.innerHeight * 0.42, `${count}명 반환 · +${fmt(gold)} 골드`, 'jade'); syncUnits(); updateHud(); }
  }
  const sheet = document.getElementById('rd-sheet');
  if (sheet && sheetMode === 'refund') { sheet.innerHTML = sheetRefundHtml(); updateRefundSheet(); }
}
// 소환 직후 자동 반환(스위치 켜졌을 때)
function autoRefundIfOn() {
  if (autoRefundOn && run) {
    const { count, gold } = engine.refundBulk(run, rfFilter);
    if (count) { play('claim'); floatText(window.innerWidth / 2, window.innerHeight * 0.28, `자동 반환 ${count} · +${fmt(gold)}`, 'jade'); syncUnits(); updateHud(); }
  }
}
// 반환 칩 선택 상태만 다시 칠하고 미리보기 갱신(시트 통째 재렌더 대신 — 입력 흐름 유지)
function refreshRefundChips() {
  const sheet = document.getElementById('rd-sheet');
  if (!sheet) return;
  for (const c of sheet.querySelectorAll('[data-mr]')) c.classList.toggle('on', Number(c.dataset.mr) === rfFilter.maxRarity);
  for (const c of sheet.querySelectorAll('[data-el]')) c.classList.toggle('on', c.dataset.el === rfFilter.element);
  updateRefundSheet();
  setSetting('rdRefund', { maxRarity: rfFilter.maxRarity, element: rfFilter.element }); // 조건 영속
  play('tap');
}

// 합성 대상 선택 모달 — 같은 영웅 3장 모인 것만 보여주고, 고르면 상위 등급 랜덤으로 합성한다.
function openMergePicker() {
  const box = document.createElement('div');
  box.className = 'rd-merge-picker';
  const render = () => {
    const groups = engine.mergeableHeroes(run);
    // 자동 합성 고정 — 성급을 켜두면 지금 한 번 합성 + 소환할 때마다 그 이하 그룹을 자동 합성(수석)
    const autoRow = `
      <div class="rd-merge-auto">
        <span>자동 합성 고정</span>
        <div class="rd-chips">
          ${[2, 3, 4, 5].map((r) => `<button class="rd-chip${autoMergeMax === r ? ' on' : ''}" data-auto="${r}">${r}★ 이하</button>`).join('')}
        </div>
      </div>
      <p class="rd-merge-hint">켜두면 <b>소환할 때마다</b> 그 성급 이하가 자동으로 합성돼요</p>`;
    const list = groups.length
      ? groups.map((g) => `
        <button class="rd-merge-opt r${g.rarity}" data-hero="${g.heroId}">
          <img src="${heroCut(g.heroId)}" alt="" draggable="false">
          <span class="rd-mo-body">
            <b class="rd-mo-name">${HERO_NAME.get(g.heroId)}</b>
            <span class="rd-mo-info">${RARITY[g.rarity].name} <em>×${g.count}</em> → ${RARITY[g.rarity + 1].name} 랜덤</span>
          </span>
          <span class="rd-mo-go">합성 ›</span>
        </button>`).join('')
      : `<p class="rd-merge-empty"><b>같은 영웅 3장</b>을 모으면 상위 등급으로 합성할 수 있어요.<br>소환으로 같은 장수를 모아 보세요.</p>`;
    box.innerHTML = autoRow + list;
  };
  render();
  box.addEventListener('click', (e) => {
    const auto = e.target.closest('[data-auto]');
    if (auto) {
      const r = Number(auto.dataset.auto);
      autoMergeMax = autoMergeMax === r ? 0 : r; // 고정 토글
      setSetting('rdAutoMerge', autoMergeMax);
      vibrate(12);
      if (autoMergeMax) {
        const n = engine.mergeAuto(run, autoMergeMax);
        if (n) { play('epic'); floatText(window.innerWidth / 2, window.innerHeight * 0.4, `자동 합성 ${n}회!`, 'gold'); }
        syncUnits(); updateHud();
      }
      render();
      return;
    }
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
  // 병력이 0인 채 프렙이 흐르면 첫 판을 헛되이 날릴 위험 → 하단바 '소환'을 강조하고 문구로 유도
  const need = prepping && run.units.length === 0;
  const bSummon = document.getElementById('rd-nav-summon');
  if (bSummon) bSummon.classList.toggle('nudge', need);
  if (prepping) {
    if (el.hidden) el.hidden = false;
    const n = String(Math.ceil(run.prepLeft));
    const nb = el.querySelector('.rd-prep-n');
    if (nb && nb.textContent !== n) nb.textContent = n;
    const sub = el.querySelector('.rd-prep-sub');
    const txt = need ? "아래 '소환'을 꾹 눌러 병력을 모으세요!" : '전투 시작까지 · 장수를 배치하세요';
    if (sub && sub.textContent !== txt) sub.textContent = txt;
  }
}

function styleLabel(n, u) {
  // 등급은 캐릭터 몸의 오라(3D)로 표현 — 이름표엔 등급 테두리색만 얹어 한눈에.
  n.nameEl.className = `rd-name3d tier-${Math.min(6, u.rarity)}`;
  n.nameEl.innerHTML = weaponIcon(u.heroId) + HERO_NAME.get(u.heroId); // 무기 아이콘 + 이름
  n.rarity = u.rarity; n.element = u.element;
}
function syncUnits() {
  if (!run) return;
  r3d.syncUnits(run.units); // 3D 빌보드 갱신(생성·이동·제거)
  // 별(머리 위)·이름(발밑) 오버레이 — 화면 좌표로 투영
  const seen = new Set();
  for (const u of run.units) {
    seen.add(u.uid);
    let n = labelNodes.get(u.uid);
    if (!n) {
      const nameEl = document.createElement('div'); nameEl.className = 'rd-name3d';
      labelLayer.append(nameEl);
      n = { nameEl, rarity: -1, element: '' };
      labelNodes.set(u.uid, n);
      styleLabel(n, u);
    } else if (n.rarity !== u.rarity || n.element !== u.element) {
      styleLabel(n, u); // 합성/변경 반영
    }
    const head = r3d.project(u.x, u.y, 1.12);
    n.nameEl.style.transform = `translate(${head.sx}px, ${head.sy}px) translate(-50%, -100%)`; // 머리 위 이름표
  }
  for (const [uid, n] of labelNodes) if (!seen.has(uid)) { n.nameEl.remove(); labelNodes.delete(uid); }
  if (selectedUid != null) renderHeroInfo(); // 선택 영웅이 합성/반환되면 패널 갱신(사라지면 비움)
}

function syncEnemies() {
  if (!run) return;
  r3d.syncEnemies(run.enemies); // 3D 빌보드 갱신(위치·좌우·피격). 사망은 다음 sync에서 제거.
}

function consumeFx() {
  for (const fx of engine.drainFx(run)) {
    if (fx.type === 'attack') {
      r3d.playAttack(fx.uid); // 영웅 스켈레탈 공격 애니 1회(창찌르기/휘두르기)
      r3d.lunge(fx.uid, fx.ex, fx.ey); // 그 적을 향해 살짝 돌진
      r3d.spawnShot3d(fx.ux, fx.uy, fx.ex, fx.ey, HERO_ATTACK_TYPE[fx.heroId] || 'sword', ELEMENT_COLOR[fx.element] || '#e9d6a0', reduceMotion, fx.rarity || 1); // 무기별 3D 공격(활/창/칼/마법), 등급↑=큰 이펙트
    } else if (fx.type === 'kill') {
      play('foehit');
    } else if (fx.type === 'stageClear') {
      play('clear');
      if (fx.bonus) floatText(window.innerWidth / 2, 150, `라운드 클리어! +${fmt(fx.bonus)} 골드`, 'gold');
      updateHud();
    } else if (fx.type === 'bossSpawn') {
      // 보스 등장 — 헌장 #3(긴장 단계). 경보음·섬광·배너로 "온다"를 알린다.
      play('boss'); flash('ember'); vibrate([0, 45, 60, 45]);
      bossBanner();
    } else if (fx.type === 'bossReward') {
      play('epic'); vibrate(24);
      const parts = [];
      if (fx.pulls) parts.push(`무료 소환 +${fx.pulls}`);
      if (fx.gold) parts.push(`+${fmt(fx.gold)} 골드`);
      floatText(window.innerWidth / 2, window.innerHeight * 0.3, `보스 격파! ${parts.join(' · ')}`, 'gold');
      syncUnits();
    } else if (fx.type === 'aoe') {
      // 초월 광역기 — 유닛 자리에서 3D 파문이 전장을 훑고 섬광
      play('legend'); flash('gold'); vibrate(28);
      r3d.spawnAoe3d(fx.x, fx.y, ELEMENT_COLOR[fx.element] || '#ffe6a2');
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
  for (const [, n] of labelNodes) { n.nameEl.remove(); }
  labelNodes.clear();
  if (r3d.ready()) { r3d.syncUnits([]); r3d.syncEnemies([]); } // 3D 풀 비우기
  if (shotLayer) shotLayer.innerHTML = '';
}
function beginRun(newRun) {
  closeReveal(); // 진행 중이던 10연 리빌 정리 — 안 그러면 revealing=true로 새 런 루프가 영구 정지(소프트락)
  closeSheet();  // 열려 있던 소환/반환/도박 시트 정리
  run = newRun;
  dangerLevel = 0; // 새 판 — 경보 단계 초기화
  saveTick = 0;    // 자동저장 주기 초기화
  const over = document.getElementById('rd-over');
  if (over) { over.hidden = true; over.innerHTML = ''; }
  wipeNodes();
  shownArena = '';
  syncEnemies();
  syncUnits();
  r3d.frame(0);
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
  // 기록·세이브 삭제·종료음은 판당 1회만 — 탭 왕복으로 재진입해도 '신기록' 라벨이 사라지거나
  // 종료음이 다시 울리지 않게(run에 캐시). recordRun 재호출 시 newBest=false로 뒤집히던 버그 수리.
  if (!run.recorded) {
    clearRun(); // 런 종료 → 이어하기 세이브 삭제(패배 시 처음부터)
    run.recorded = { newBest: meta.recordRun(reachedStage, sec, won) };
    play(won ? 'legend' : 'wipe');
  }
  const newBest = run.recorded.newBest;
  const b = meta.best();
  const over = document.getElementById('rd-over');
  if (!over) return;
  over.hidden = false;
  over.innerHTML = `
    <div class="rd-over-card">
      <b>${won ? `${engine.stageCap()}라운드 클리어!` : '패배'}</b>
      <span>${won ? '천하를 지켜냈다' : `${reachedStage}라운드에서 무너졌다`} · 최고 ${b.stage}라운드${newBest ? ' · 신기록!' : ''}</span>
      <span class="rd-over-stat">처치 <b>${fmt(run.kills || 0)}</b> · <b>${formatSec(sec)}</b> 생존</span>
      <button class="btn primary" id="rd-retry">다시 시작 <em>도전 ${meta.playsLeft()}회</em></button>
    </div>`;
  document.getElementById('rd-retry').addEventListener('click', () => startNewPlay());
}

// 초 → "1분 20초" / "45초"
function formatSec(s) {
  if (s >= 60) return `${Math.floor(s / 60)}분 ${s % 60}초`;
  return `${s}초`;
}

// 새 판 시작 — 도전 1 소모(라운드1부터). 남은 도전이 없으면 결제 화면(plays:empty)으로.
// 방어 화면 준비(fieldEl) 후에만 소모 — 아니면 도전만 날리고 판이 안 열리는 버그 방지.
function startNewPlay() {
  if (!fieldEl) emit('nav:battle'); // 설정 탭 등에서 방어 화면이 언마운트됐으면 먼저 마운트
  if (!fieldEl) return;             // 그래도 없으면(이론상) 도전만 날리지 않게 중단
  if (!meta.consumePlay()) { emit('plays:empty'); return; }
  speed = 1; setSetting('rdSpeed', 1); updateSpeedChip(); // 새 판은 배속 1부터(수석)
  started = true;
  beginRun(engine.createRun({}));
}

// SW 자동 업데이트로 새로고침되기 직전 — 진행 중이던 판을 저장해 새 버전에서 도전 소모 없이 이어가게 한다.
// (우리 배포로 유저의 판·유료 도전이 증발하지 않도록. 저장 1칸을 자동으로 채운다.)
export function saveActiveRun() {
  if (run && started && !run.gameOver && !run.won) saveRun();
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
  // v117: 세로로 들어도 강제 가로로 렌더하므로 방향에 따른 정지 없음(항상 진행)
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
  r3d.frame(dt); // 3D 씬 렌더(빌보드 facing·bob·돌진·피격 반영)
  updateHud();
  updateBg();
  updatePrep();
  // 연속 자동저장 — 몇 초마다 '지금 이 순간'을 저장한다. 강제종료해도 되감기가 아니라
  // 그 자리(위험한 상태)에서 이어지므로 죽음 회피용 세이브 스컴이 막힌다. (게임오버/승리면 saveRun이 no-op)
  saveTick += dt;
  if (saveTick >= AUTOSAVE_SEC) { saveTick = 0; saveRun(); }
  if (rafId) rafId = requestAnimationFrame(loop);
}

export function destroy() {
  closeReveal(); // 리빌 오버레이가 떠 있으면 걷어낸다
  stopHold();
  if (gambleTimer) { clearInterval(gambleTimer); gambleTimer = null; rolling = false; } // 주사위 타이머 정리
  sheetMode = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  // 세이브는 loop()의 연속 자동저장 + main.js의 백그라운드/종료 스냅샷이 담당. 탭 전환엔 인메모리 run 유지.
  window.removeEventListener('resize', onResize);
  window.removeEventListener('pointermove', onDragMove);
  drag = null;
  for (const [, n] of labelNodes) { n.nameEl.remove(); }
  labelNodes.clear();
  if (shotLayer) shotLayer.innerHTML = '';
  r3d.dispose(); // 3D 씬·캔버스 해제
  fieldEl = labelLayer = shotLayer = null;
  // run은 null로 만들지 않는다 — 탭 전환에도 인메모리로 유지
}
