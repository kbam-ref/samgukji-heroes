// 삼국지 랜덤 디펜스 — 엔진 (순수 로직, DOM 접근 없음).
// UI(defense-screen.js)가 rAF로 tick(run, dt)을 돌리고 run 상태를 읽어 그린다.
// run.fx[]에 이번 프레임의 순간 이벤트(피격·처치·소환·보상)를 쌓아 UI가 소비한다.

import { HEROES } from '../data/heroes.js';
import {
  DEFENSE, SUMMON_POOL, HERO_ELEMENT, HERO_SIZE_ROLE,
  ELEMENT_BEATS, SIZE_ROLE_MULT, ENEMY_SPRITES, BOSS_SPRITES, ELEMENTS, HERO_CAST,
} from '../data/defense.js';
import { chapterOf } from '../data/campaign.js';
import { MISSIONS, missionStat } from '../data/missions.js';

const BASE = new Map(HEROES.map((h) => [h.id, h.base]));
const RARITY = new Map(HEROES.map((h) => [h.id, h.rarity]));
const PERK = new Map(HEROES.map((h) => [h.id, h.perk]));

// ── 경로(사각 트랙) 둘레 위 한 점 — prog∈[0,1) ──
const PATH = DEFENSE.field.path;
const SEGS = PATH.map((p, i) => {
  const q = PATH[(i + 1) % PATH.length];
  return { x: p.x, y: p.y, dx: q.x - p.x, dy: q.y - p.y, len: Math.hypot(q.x - p.x, q.y - p.y) };
});
const PERIM = SEGS.reduce((s, seg) => s + seg.len, 0);

export function pathPoint(prog) {
  let d = ((prog % 1) + 1) % 1 * PERIM;
  for (const seg of SEGS) {
    if (d <= seg.len) {
      const t = seg.len ? d / seg.len : 0;
      return { x: seg.x + seg.dx * t, y: seg.y + seg.dy * t };
    }
    d -= seg.len;
  }
  return { x: PATH[0].x, y: PATH[0].y };
}

// ── 유닛 배치 칸 좌표 — 배치 박스(bounds) 안에 고루 편다. 배치칸 무제한(2026-07-20 수석)이라
//    30칸을 넘으면 다음 무리를 살짝 어긋나게 겹쳐 쌓는다(플레이어가 끌어 펴거나 합성). ──
// 2026-07-23 감사: 중앙 뭉침 기본 배치는 1성 사거리(18)가 트랙에 안 닿아 '방치하면 1라운드 0킬 전멸'.
//   → 처음 16자리는 트랙에 근접한 링(상·하·좌·우변 교대)으로 깔아, 안 옮겨도 교전이 되게 한다.
const RING_SPOTS = (() => {
  const b = DEFENSE.unit.bounds;
  const T = (x) => ({ x, y: b.y1 + 2 }), B = (x) => ({ x, y: b.y2 - 2 });
  const L = (y) => ({ x: b.x1 + 2, y }), R = (y) => ({ x: b.x2 - 2, y });
  // 교대 순서 — 소환 순서대로 사방에 고르게 퍼진다
  return [
    T(50), B(50), L(51), R(51), T(39), B(39), T(61), B(61),
    L(38), R(38), L(64), R(64), T(28), B(28), T(72), B(72),
  ];
})();
export function slotPos(i) {
  if (i < RING_SPOTS.length) return { ...RING_SPOTS[i] };
  // 17번째부터는 중앙 그리드(증원 — 플레이어가 끌어 재배치)
  const b = DEFENSE.unit.bounds;
  const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
  const j = i - RING_SPOTS.length;
  const cols = 5, rows = 4, per = cols * rows;
  const cell = j % per;
  const wrap = Math.floor(j / per) * 2.5; // 초과분은 살짝 어긋나 겹침
  const x = cx + ((cell % cols) - (cols - 1) / 2) * 7 + wrap;
  const y = cy + (Math.floor(cell / cols) - (rows - 1) / 2) * 6 + wrap;
  const mx = 3, my = 5;
  return { x: Math.max(b.x1 + mx, Math.min(b.x2 - mx, x)), y: Math.max(b.y1 + my, Math.min(b.y2 - my, y)) };
}

// ── 확률 유틸 ──
function pickWeighted(list, weightKey) {
  const total = list.reduce((s, o) => s + o[weightKey], 0);
  let r = Math.random() * total;
  for (const o of list) {
    r -= o[weightKey];
    if (r <= 0) return o;
  }
  return list[list.length - 1];
}
function rollRarity() {
  const r = Math.random();
  let acc = 0;
  for (const { rarity, rate } of DEFENSE.summon.rates) {
    acc += rate;
    if (r <= acc) return rarity;
  }
  return 1;
}
function rollSize() {
  const s = DEFENSE.wave.sizes;
  return pickWeighted(
    Object.keys(s).map((k) => ({ k, weight: s[k].weight })),
    'weight'
  ).k;
}
function randElement() {
  return ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
}
// 라운드 속성 — 한 라운드는 한 속성으로 통일(2026-07-20 수석). 직전 라운드와 다른 속성을 뽑아 변화를 준다.
function pickStageElement(prev) {
  const es = ELEMENTS.filter((e) => e !== prev);
  return es[Math.floor(Math.random() * es.length)];
}

// ── 유닛 생성(소환) ──
let unitSeq = 1;
function makeUnit(heroId, slot) {
  const pos = slotPos(slot);
  return {
    uid: unitSeq++,
    heroId,
    rarity: RARITY.get(heroId),
    base: BASE.get(heroId),
    element: HERO_ELEMENT[heroId],
    sizeRole: HERO_SIZE_ROLE[heroId],
    upgradeLv: 0,
    slot,
    x: pos.x,
    y: pos.y,
    tx: pos.x, // 목표 위치(드래그로 갱신) — 여기로 걸어간다
    ty: pos.y,
    face: 1,
    moving: false,
    cd: 0,
  };
}
function freeSlot(run) {
  // 배치칸 무제한(2026-07-20 수석 지시) — 상한 없이 항상 빈 인덱스를 찾아준다.
  const used = new Set(run.units.map((u) => u.slot));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

/** 소환 1회 — 무료 소환권(freePulls)이 있으면 무료, 없으면 골드 지불. 빈 칸 없으면 실패. */
export function summon(run) {
  const slot = freeSlot(run);
  if (slot < 0) return null;
  const useFree = run.freePulls > 0;
  if (!useFree && run.gold < DEFENSE.summon.cost) return null;
  if (useFree) run.freePulls -= 1;
  else run.gold -= DEFENSE.summon.cost;
  let rarity = rollRarity();
  // 천장(피티) — pulls마다 발동(헌장 #3). minRarity: 하한 등급 확정(전설 이상). 발동 시 카운터 리셋.
  const pity = DEFENSE.summon.pity;
  run.pity = (run.pity || 0) + 1;
  if (pity && run.pity >= pity.pulls) {
    if (pity.effect === 'minRarity') rarity = Math.max(rarity, pity.min || 4);
    else rarity = Math.min(6, rarity + 1); // 구 rarityUp 폴백
    run.pity = 0;
    run.fx.push({ type: 'pity', rarity }); // 천장 발동 — UI가 '확정' 연출
  }
  const pool = SUMMON_POOL[rarity];
  const heroId = pool[Math.floor(Math.random() * pool.length)];
  const unit = makeUnit(heroId, slot);
  const mate = run.units.find((x) => x.heroId === heroId);
  if (mate) unit.upgradeLv = mate.upgradeLv; // 같은 영웅이 이미 있으면 공유 단련 레벨 계승
  run.units.push(unit);
  run.summons = (run.summons || 0) + 1; // 과업 카운터
  run.fx.push({ type: 'summon', uid: unit.uid, rarity, free: useFree });
  return unit;
}

// 지정 등급 유닛을 무료 지급(보스 처치 보상 등) — 비용/확률 없이 그 등급에서 랜덤 영웅 1명.
function grantUnit(run, rarity) {
  const slot = freeSlot(run);
  if (slot < 0) return null;
  const pool = SUMMON_POOL[rarity];
  const heroId = pool[Math.floor(Math.random() * pool.length)];
  const unit = makeUnit(heroId, slot);
  const mate = run.units.find((x) => x.heroId === heroId);
  if (mate) unit.upgradeLv = mate.upgradeLv;
  run.units.push(unit);
  return unit;
}
function pickGrantRarity() {
  const g = DEFENSE.wave.boss.grant;
  if (!g || !g.length) return 4;
  const r = Math.random(); let acc = 0;
  for (const [rar, p] of g) { acc += p; if (r < acc) return rar; }
  return g[g.length - 1][0];
}

/** 승급 도박 — 골드 지불, chance 확률로 최고등급 미만 유닛 1명을 1등급 승급(위치 유지). */
export function gambleUpgrade(run) {
  const g = DEFENSE.gamble.up;
  if (!g || run.gold < g.cost) return { ok: false };
  const cands = run.units.filter((u) => u.rarity < 6);
  if (!cands.length) return { ok: false, noTarget: true }; // 승급 대상 없으면 비용 차감 안 함
  run.gold -= g.cost;
  if (Math.random() >= g.chance) { run.fx.push({ type: 'gambleUp', success: false }); return { ok: true, success: false }; }
  const u = cands[Math.floor(Math.random() * cands.length)];
  const nr = u.rarity + 1;
  const pool = SUMMON_POOL[nr];
  const newHeroId = pool[Math.floor(Math.random() * pool.length)];
  const nu = makeUnit(newHeroId, u.slot);
  nu.x = u.x; nu.y = u.y; nu.tx = u.tx; nu.ty = u.ty; // 있던 자리에서 승급
  const mate = run.units.find((x) => x.heroId === newHeroId && x.uid !== u.uid);
  if (mate) nu.upgradeLv = mate.upgradeLv;
  run.units = run.units.filter((x) => x.uid !== u.uid);
  run.units.push(nu);
  run.fx.push({ type: 'gambleUp', success: true, uid: nu.uid, rarity: nr, heroId: newHeroId });
  return { ok: true, success: true, uid: nu.uid, rarity: nr };
}

/** 여러 번 소환(10연 등) — 빈 칸/자원이 다할 때까지. 생성된 유닛 배열을 돌려준다(리빌 연출용). */
export function summonMany(run, n) {
  const made = [];
  for (let i = 0; i < n; i++) {
    const u = summon(run);
    if (!u) break;
    made.push(u);
  }
  return made;
}

// ── 단련(업그레이드) ──
export function upgradeCost(lv) {
  const u = DEFENSE.unit.upgrade;
  return u.costBase + lv * (u.costStep ?? 1); // 선형 — 25골드부터 레벨당 +1
}
function sumUpgradeSpent(lv) {
  let s = 0;
  for (let i = 0; i < lv; i++) s += upgradeCost(i);
  return s;
}
// 단련은 '영웅 단위' — 같은 영웅 전체가 같은 레벨을 공유한다(2026-07-20 수석: 조조 단련 시 모든 조조 적용).
//   그룹의 현재 레벨(최댓값) 기준 단일 비용으로 전원 +1. 중복 보유가 곧 단련 효율(수집 보상).
export function upgrade(run, uid) {
  const u = run.units.find((x) => x.uid === uid);
  if (!u) return false;
  const mates = run.units.filter((x) => x.heroId === u.heroId);
  const lv = Math.max(...mates.map((m) => m.upgradeLv || 0));
  if (lv >= DEFENSE.unit.upgrade.maxLevel) return false;
  const cost = upgradeCost(lv);
  if (run.gold < cost) return false;
  run.gold -= cost;
  for (const m of mates) m.upgradeLv = lv + 1;
  run.upgrades = (run.upgrades || 0) + 1; // 과업 카운터
  run.fx.push({ type: 'upgrade', uid });
  return true;
}

// ── 속성별 단련 — 속성 하나의 '공격력(atk)' 또는 '공속(spd)'을 올리면 그 속성 유닛 전체에 적용(런 스코프) ──
export function freshElemLevel() {
  return { water: { atk: 0, spd: 0 }, fire: { atk: 0, spd: 0 }, earth: { atk: 0, spd: 0 }, wind: { atk: 0, spd: 0 } };
}
function ensureElemLevel(run) {
  if (!run.elemLevel) run.elemLevel = freshElemLevel();
  for (const k of ELEMENTS) if (!run.elemLevel[k]) run.elemLevel[k] = { atk: 0, spd: 0 };
}
export function elemUpgradeCost(run, element, kind) {
  const e = DEFENSE.unit.elemUpgrade;
  const lv = run.elemLevel?.[element]?.[kind] || 0;
  return e.costBase + lv * (e.costStep ?? 1); // 선형 — 50골드부터 레벨당 +1
}
export function elemUpgrade(run, element, kind) {
  const e = DEFENSE.unit.elemUpgrade;
  ensureElemLevel(run);
  const lv = run.elemLevel[element][kind] || 0;
  if (lv >= e.maxLevel) return false;
  const cost = elemUpgradeCost(run, element, kind);
  if (run.gold < cost) return false;
  run.gold -= cost;
  run.elemLevel[element][kind] = lv + 1;
  run.upgrades = (run.upgrades || 0) + 1; // 과업 카운터(개별 단련과 합산)
  run.fx.push({ type: 'elemUpgrade', element, kind, level: lv + 1 });
  return true;
}

// ── 반환(판매) — 등급값 + 단련 골드 50% 환급, 등급값은 소환가 이하 캡(데이터에서 이미 캡) ──
export function refundValue(u) {
  // 단련은 '영웅 공유' 투자라 개별 유닛 반환값에 넣지 않는다(중복 반환 악용 차단).
  return DEFENSE.unit.refund.goldByRarity[u.rarity] ?? 0;
}
export function refund(run, uid) {
  const i = run.units.findIndex((x) => x.uid === uid);
  if (i < 0) return 0;
  const val = refundValue(run.units[i]);
  run.units.splice(i, 1);
  run.gold += val;
  run.fx.push({ type: 'refund', uid, gold: val });
  return val;
}

// ── 조건부 일괄 반환(2026-07-20 수석) — 성급(maxRarity 이하) + 성향(element)에 맞는 유닛을 한 번에 반환.
//    빠른 판 정리·골드 회수용. filter.element === 'all'이면 성향 무관, maxRarity null이면 성급 무관. ──
function matchRefund(u, f) {
  if (!f) return false;
  if (f.maxRarity != null && u.rarity > f.maxRarity) return false;
  if (f.element && f.element !== 'all' && u.element !== f.element) return false;
  return true;
}
/** 미리보기 — 조건에 맞는 유닛 수와 반환 골드 합계(변이 없음). */
export function refundPreview(run, filter) {
  let count = 0, gold = 0;
  for (const u of run.units) if (matchRefund(u, filter)) { count++; gold += refundValue(u); }
  return { count, gold };
}
/** 실제 일괄 반환 — 조건에 맞는 유닛 제거 + 골드 지급. {count, gold} 반환. */
export function refundBulk(run, filter) {
  const keep = [];
  let count = 0, gold = 0;
  for (const u of run.units) {
    if (matchRefund(u, filter)) { count += 1; gold += refundValue(u); }
    else keep.push(u);
  }
  if (count === 0) return { count: 0, gold: 0 };
  run.units = keep;
  run.gold += gold;
  run.fx.push({ type: 'refundBulk', count, gold });
  return { count, gold };
}

// ── 합성 — 2026-07-20 수석 지시: '같은 영웅' 3장 → 상위 등급 랜덤 1장 (같은 등급 아무거나 X).
//    소환가 50·작은 등급별 풀 덕에 같은 장수 3장 모으기가 실제로 가능해짐. 최고 단련 계승 + 나머지 50% 환급.
export function sameHeroCount(run, heroId) {
  return run.units.filter((u) => u.heroId === heroId).length;
}
/** 등급별 합성 필요 장수 — 높은 등급일수록 적게(사다리 유지). needByRarity 없으면 need 폴백. */
export function mergeNeed(rarity) {
  const by = DEFENSE.merge.needByRarity;
  return (by && by[rarity]) || DEFENSE.merge.need;
}
export function canMergeHero(run, heroId) {
  const r = RARITY.get(heroId);
  return r < 6 && sameHeroCount(run, heroId) >= mergeNeed(r);
}
/** 합성 가능한 '같은 영웅' 목록 — 합성 대상 선택 UI용. [{heroId, count, need, rarity}] */
export function mergeableHeroes(run) {
  const byHero = new Map();
  for (const u of run.units) byHero.set(u.heroId, (byHero.get(u.heroId) || 0) + 1);
  const out = [];
  for (const [heroId, count] of byHero) {
    const rarity = RARITY.get(heroId);
    if (rarity < 6 && count >= mergeNeed(rarity)) out.push({ heroId, count, need: mergeNeed(rarity), rarity });
  }
  return out.sort((a, b) => b.rarity - a.rarity || b.count - a.count);
}
// 자동 합성 — 성급 maxRarity 이하의 '같은 영웅 3장' 그룹을 전부 합성한다(더 없을 때까지 반복).
//   합성으로 생긴 상위 등급이 다시 3장이면 그것도 maxRarity 이하인 한 이어서 합성(연쇄).
export function mergeAuto(run, maxRarity) {
  let merged = 0, guard = 0;
  while (guard++ < 300) {
    const g = mergeableHeroes(run).find((x) => x.rarity <= maxRarity);
    if (!g || !mergeHero(run, g.heroId)) break;
    merged += 1;
  }
  return merged;
}
export function mergeHero(run, heroId) {
  if (!canMergeHero(run, heroId)) return null;
  const mats = run.units.filter((u) => u.heroId === heroId).slice(0, mergeNeed(RARITY.get(heroId)));
  const topLv = Math.max(...mats.map((m) => m.upgradeLv || 0)); // 승급체가 계승할 단련 레벨
  const matUids = new Set(mats.map((m) => m.uid));
  run.units = run.units.filter((u) => !matUids.has(u.uid));
  const slot = freeSlot(run); // 재료 제거 후 가장 낮은 빈 칸 = 가운데(합성체 중앙 출현, 수석)
  const nr = RARITY.get(heroId) + 1;
  const pool = SUMMON_POOL[nr];
  const newHeroId = pool[Math.floor(Math.random() * pool.length)];
  const unit = makeUnit(newHeroId, slot);
  unit.upgradeLv = topLv; // 최고 단련 계승
  run.units.push(unit);
  run.merges = (run.merges || 0) + 1; // 과업 카운터
  run.fx.push({ type: 'merge', rarity: nr, uid: unit.uid });
  return unit;
}

// ── 도박 — 주사위 2개. 같은 수(더블)면 잭팟, 아니면 합계 × perPip ──
export function gamble(run) {
  if (run.gambleCd > 0) return null; // 30초 쿨다운 중
  if (run.gold < DEFENSE.gamble.cost) return null;
  run.gold -= DEFENSE.gamble.cost;
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const jackpot = d1 === d2;
  const won = jackpot ? DEFENSE.gamble.doubleGold : (d1 + d2) * DEFENSE.gamble.perPip;
  run.gold += won;
  run.gambleCd = DEFENSE.gamble.cooldown ?? 30;
  run.fx.push({ type: 'gamble', won, d1, d2, jackpot });
  return { won, d1, d2, jackpot };
}

// ── 데미지 계산 ──
function damage(unit, enemy, perks) {
  const r = DEFENSE.unit.byRarity[unit.rarity];
  let d = unit.base * r.dmg * (1 + DEFENSE.unit.upgrade.dmgPerLevel * unit.upgradeLv);
  if (ELEMENT_BEATS[unit.element] === enemy.element) d *= DEFENSE.element.strong;
  else if (ELEMENT_BEATS[enemy.element] === unit.element) d *= DEFENSE.element.weak;
  d *= SIZE_ROLE_MULT[unit.sizeRole][enemy.size];
  // 특성(2026-07-23 실동작화) — might: 전군 공격력, boss: 적장 추가 피해
  if (perks) { d *= 1 + (perks.might || 0) / 100; if (enemy.isBoss) d *= 1 + (perks.boss || 0) / 100; }
  return d;
}

// ── 적 체력·보상 ──
function enemyHp(stage, index, size, isBoss) {
  const w = DEFENSE.wave;
  // 초반 온램프(2026-07-22 수석) — 1~3단계 HP를 배수로 낮춰 약한 로스터도 진입 가능. 4단계부터 1.0.
  const ramp = (w.hpOnramp && w.hpOnramp[stage - 1] != null) ? w.hpOnramp[stage - 1] : 1;
  // 후반 소프트캡(2026-07-23) — hpLateStage 이후는 완화된 지수(hpPerStageLate)로. 유닛 성장(선형)과
  //   적 HP(지수)의 격차가 후반에 폭주해 '초월을 뽑아도 30R 승리 불가'(시뮬 0/14)였던 것을 잡는다.
  const lateAt = w.hpLateStage ?? Infinity;
  const early = Math.max(0, Math.min(stage, lateAt) - 1);
  const late = Math.max(0, stage - lateAt);
  const base = w.hpBase * Math.pow(w.hpPerStage, early) * Math.pow(w.hpPerStageLate ?? w.hpPerStage, late)
    * (1 + w.hpPerIndex * index) * ramp;
  if (isBoss) return base * w.sizes.medium.hp * w.boss.hpMult;
  return base * w.sizes[size].hp;
}
function killGold(stage, size, isBoss) {
  const w = DEFENSE.wave;
  const mult = isBoss ? w.boss.goldMult : w.sizes[size].gold;
  // 소수 그대로 반환 — 킬마다 Math.round 하면 0.5→1로 반올림돼 소득이 2배 되던 버그(감사 2026-07-22).
  //   누적 반올림은 registerKill의 goldFrac에서 처리(10킬=5골드 정확히).
  return w.goldPerKill * mult * Math.pow(w.goldPerStage, stage - 1);
}
function bossPulls(stage) {
  return DEFENSE.wave.boss.rewardPullsBase + Math.floor(stage / 10) * DEFENSE.wave.boss.rewardPullsPerTen;
}

// ── 런 생성 ──
export function isBossStage(stage) {
  return stage % DEFENSE.wave.boss.everyStages === 0;
}
export function stageCap() {
  return Math.min(DEFENSE.buildCap ?? DEFENSE.stages, DEFENSE.stages);
}

let enemySeq = 1;
function beginStage(run) {
  run.spawned = 0;
  run.killedThisStage = 0;
  run.spawnTimer = 0;
  run.bossWarned = false; // 이번 스테이지 '보스 출현' 경보를 아직 안 울렸다
  run.stageElement = pickStageElement(run.stageElement); // 이번 라운드 적 속성(통일)
  run.bossStage = isBossStage(run.stage);
  // 보스 스테이지: 일반(perStage - count) + 보스 count. 보스는 중반·후반 스폰 인덱스에 배정.
  const per = DEFENSE.wave.perStage;
  run.toSpawn = per;
  run.bossIdx = run.bossStage
    ? new Set([Math.floor(per * 0.5), per - 1].slice(0, DEFENSE.wave.boss.count))
    : new Set();
}

// ── 이어하기 세이브 — 런을 평평한 객체로 (bossIdx는 stage에서 재계산, id 시퀀스 보존) ──
export function serializeRun(run) {
  if (!run || run.gameOver || run.won) return null;
  return {
    v: 1,
    stage: run.stage, gold: run.gold, elapsed: run.elapsed, freePulls: run.freePulls,
    kills: run.kills || 0, gambleCd: run.gambleCd || 0, roundLeft: run.roundLeft ?? DEFENSE.wave.roundTime,
    spawned: run.spawned, killedThisStage: run.killedThisStage,
    bossWarned: run.bossWarned || false,
    stageElement: run.stageElement || 'fire',
    units: run.units, enemies: run.enemies,
    dmgMult: run.dmgMult || 1,
    elemLevel: run.elemLevel || freshElemLevel(),
    prepLeft: run.prepLeft || 0,
    goldFrac: run.goldFrac || 0, // 소수 골드 캐리(감사)
    pity: run.pity || 0,         // 천장 카운터(감사)
    storms: run.storms || [],    // 진행 중 조조 스톰(감사: 저장 누락 → 부활 시 소멸하던 것 보존)
    // 과업 진행(사슬 위치 + 카운터)
    missionIdx: run.missionIdx || 0,
    summons: run.summons || 0, merges: run.merges || 0, upgrades: run.upgrades || 0,
    unitSeq, enemySeq,
  };
}
export function deserializeRun(o) {
  if (!o || o.v !== 1) return null;
  const run = {
    stage: o.stage, gold: o.gold, elapsed: o.elapsed || 0, freePulls: o.freePulls || 0,
    kills: o.kills || 0, gambleCd: o.gambleCd || 0, roundLeft: o.roundLeft ?? DEFENSE.wave.roundTime,
    units: o.units || [], enemies: o.enemies || [], fx: [],
    gameOver: false, won: false,
    spawned: o.spawned || 0, killedThisStage: o.killedThisStage || 0, spawnTimer: 0,
    dmgMult: o.dmgMult || 1,
    elemLevel: o.elemLevel || freshElemLevel(),
    prepLeft: o.prepLeft || 0,
    goldFrac: o.goldFrac || 0,
    pity: o.pity || 0,
    storms: Array.isArray(o.storms) ? o.storms : [],
    missionIdx: o.missionIdx || 0,
    summons: o.summons || 0, merges: o.merges || 0, upgrades: o.upgrades || 0,
  };
  run.bossStage = isBossStage(run.stage);
  run.bossWarned = o.bossWarned || false; // 이미 이번 스테이지 보스 경보를 울렸는지(중복 배너 방지)
  run.stageElement = o.stageElement || 'fire'; // 이번 라운드 통일 속성(이어하기 유지)
  const per = DEFENSE.wave.perStage;
  run.toSpawn = per;
  run.bossIdx = run.bossStage
    ? new Set([Math.floor(per * 0.5), per - 1].slice(0, DEFENSE.wave.boss.count))
    : new Set();
  // 저장된 시퀀스 + 실제 로드된 유닛/적 id에서도 하한을 잡는다(구버전 세이브에 unitSeq 필드가 없어도 uid 충돌 방지)
  unitSeq = Math.max(unitSeq, o.unitSeq || 0, ...run.units.map((u) => (u.uid || 0) + 1), 1);
  enemySeq = Math.max(enemySeq, o.enemySeq || 0, ...run.enemies.map((e) => (e.eid || 0) + 1), 1);
  return run;
}

export function createRun(boot = {}) {
  const run = {
    stage: 1,
    gold: DEFENSE.summon.startGold + (boot.startGold || 0), // 영구성장: 시작 골드
    units: [],
    enemies: [],
    fx: [],
    gameOver: false,
    won: false,
    elapsed: 0,
    kills: 0, // 누적 처치 수
    gambleCd: 0, // 도박 쿨다운(초)
    roundLeft: DEFENSE.wave.roundTime, // 라운드 제한 시간(전투 시작 시 리셋)
    freePulls: 0, // 보스 보상 등 무료 소환 대기분
    prepLeft: DEFENSE.prep?.seconds ?? 0, // 준비 카운트다운(초) — 이 동안 적이 안 나온다
    dmgMult: boot.dmgMult || 1, // 영구성장: 전 유닛 데미지 배수
    elemLevel: freshElemLevel(), // 속성별 단련(공격력·공속) 레벨
  };
  beginStage(run);
  run.freePulls = DEFENSE.summon.openingPulls + (boot.openingPulls || 0); // 오프닝 무료 소환(+영구성장)
  return run;
}

function spawnEnemy(run) {
  const idx = run.spawned;
  const isBoss = run.bossIdx.has(idx);
  const size = isBoss ? rollSize() : rollSize(); // 보스도 소/중/대
  const hp = enemyHp(run.stage, idx, size, isBoss);
  // 캠페인(장章) 테마 — 장별 적 병종 풀·적장 스프라이트(황건→적벽 사건 순서, 헌장 #2). 없으면 구 순환 폴백.
  const ch = chapterOf(run.stage);
  const spriteId = isBoss
    ? (ch.boss?.sprite || BOSS_SPRITES[Math.floor(run.stage / DEFENSE.wave.boss.everyStages - 1) % BOSS_SPRITES.length])
    : (ch.foes?.length
      ? ch.foes[(run.stage - ch.from + idx) % ch.foes.length] // 라운드+스폰순서로 풀 안에서 섞임(같은 장 안에서 병종이 섞여 나온다)
      : ENEMY_SPRITES[(run.stage - 1) % ENEMY_SPRITES.length]);
  run.enemies.push({
    eid: enemySeq++,
    spriteId,
    isBoss,
    size,
    element: run.stageElement || randElement(), // 라운드 통일 속성(구세이브 방어로 폴백)
    hp,
    maxHp: hp,
    prog: Math.random() * 0.02, // 살짝 흩어져 스폰
    hit: 0,
    face: 1, // 이동 방향으로 좌우 뒤집기
    wPhase: Math.random() * Math.PI * 2, // 약한 흔들림 위상
    wOut: 2 + Math.random() * 7,          // 고정 바깥 거리(%) — 적마다 달라 점선 밖에서 퍼져 돈다
    wSpeed: 0.4 + Math.random() * 0.7,    // 흔들림 속도
  });
  // 이번 스테이지 첫 보스가 나오는 순간 — 긴장 단계를 알린다(경보음·배너). 스테이지당 1회.
  if (isBoss && !run.bossWarned) {
    run.bossWarned = true;
    run.fx.push({ type: 'bossSpawn', sprite: spriteId });
  }
  run.spawned += 1;
}

// 광역 시전 중심 — 반경 안에 가장 많은 적이 드는 '적 밀집점'(살아있는 적 기준). 시전자 발밑이 아니라 적 무리에 깔린다.
function densestEnemyPoint(run, radius) {
  // 렉 완화(2026-07-22) — 적이 많을 때 O(n²) 스파이크 방지: 후보 중심을 최대 ~40개만 평가(O(40n)),
  //   거리비교는 제곱거리(sqrt 제거). 밀집점 근사 정확도는 충분.
  const alive = run.enemies.filter((e) => !e.dead);
  if (!alive.length) return null;
  const r2 = radius * radius;
  const step = Math.max(1, Math.floor(alive.length / 40));
  let best = null, bestCount = -1;
  for (let i = 0; i < alive.length; i += step) {
    const e = alive[i];
    let cnt = 0;
    for (const o of alive) { const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy <= r2) cnt++; }
    if (cnt > bestCount) { bestCount = cnt; best = { x: e.x, y: e.y }; }
  }
  return best;
}

// 적 처치 정산 — 골드·처치수·처치 fx·보스 보상. (일반타격·광역기 공용)
function registerKill(run, target) {
  target.dead = true;
  run.killedThisStage += 1;
  run.kills = (run.kills || 0) + 1;
  run.fx.push({ type: 'kill', eid: target.eid, boss: target.isBoss, sprite: target.spriteId, x: target.x, y: target.y });
  if (target.isBoss) {
    // 보스 = killGold + 라운드 비례(killGoldPerStage). 체급 기본 골드는 더하지 않는다(중복 지급 방지).
    const b = DEFENSE.wave.boss;
    const bg = Math.round(((b.killGold ?? 0) + (b.killGoldPerStage ?? 0) * run.stage) * (1 + (run.perks?.coin || 0) / 100));
    run.gold += bg;
    run.fx.push({ type: 'bossReward', gold: bg });
  } else {
    // 일반 킬 = 0.5/킬 균일(10킬=5골드). 소수 골드를 누적해 정확히 지급.
    run.goldFrac = (run.goldFrac || 0) + killGold(run.stage, target.size, false) * (1 + (run.perks?.coin || 0) / 100); // coin 특성
    const whole = Math.floor(run.goldFrac);
    if (whole > 0) { run.gold += whole; run.goldFrac -= whole; }
  }
}

/** 한 프레임 진행 — run 변이 + run.fx에 이벤트 적재 */
export function tick(run, dt) {
  if (run.gameOver || run.won) return;
  if (run.prepLeft <= 0) run.elapsed += dt; // 2026-07-21 수석: 경과시간은 몬스터 출현(프렙 종료) 후부터 카운팅
  if (run.gambleCd > 0) run.gambleCd = Math.max(0, run.gambleCd - dt); // 도박 쿨다운
  const w = DEFENSE.wave;

  // 과업 — 현재 과업 달성 검사(카운터 비교뿐이라 매 프레임 무료). 한 프레임에 여러 개 완수도 순서대로 처리.
  let guard = 0;
  while (guard++ < 8) {
    const m = MISSIONS[run.missionIdx ?? 0];
    if (!m || missionStat(run, m) < m.target) break;
    run.gold += m.gold;
    run.missionIdx = (run.missionIdx ?? 0) + 1;
    run.fx.push({ type: 'mission', text: m.text, gold: m.gold });
  }

  // 특성(perk) 집계 — 종류별 '출전 중 최고값'만 적용(합산 스택은 시뮬 13/14 승리로 과폭주 — 넓은 로스터
  //   깔아두기 악용 차단. '더 좋은 장수를 세울수록 오라가 세진다'는 유지). UI도 run.perks를 읽는다.
  const perks = { boss: 0, coin: 0, haste: 0, might: 0 };
  for (const u of run.units) {
    const p = PERK.get(u.heroId);
    if (p && perks[p.kind] != null && p.value > perks[p.kind]) perks[p.kind] = p.value;
  }
  run.perks = perks;

  // 준비 시간(프렙) — 적이 아직 안 나온다. 유닛 소환·이동만 진행. 0이 되면 전투 개시 + 라운드 타이머 시작.
  if (run.prepLeft > 0) {
    run.prepLeft -= dt;
    if (run.prepLeft <= 0) { run.prepLeft = 0; run.roundLeft = w.roundTime; run.fx.push({ type: 'prepEnd' }); }
  }
  const prepping = run.prepLeft > 0;

  // 스폰 (준비 중엔 멈춤)
  if (!prepping && run.spawned < run.toSpawn) {
    run.spawnTimer += dt;
    while (run.spawned < run.toSpawn && run.spawnTimer >= w.spawnInterval) {
      run.spawnTimer -= w.spawnInterval;
      spawnEnemy(run);
    }
  }

  // 적 이동 — 경로를 돌되 점선 '밖'에서 흔들려 자유롭게 다닌다.
  //   코너에서 바깥 오프셋 벡터가 급회전하면 렌더 위치가 코너를 크게 휘돌아 '빨라' 보인다 →
  //   실제 이동 거리를 기본 속도의 ~1.5배로 상한(cap)해 코너에서도 균일한 속도로 부드럽게 돈다.
  for (const e of run.enemies) {
    let sp = w.speed * (e.isBoss ? w.boss.speedMult : w.sizes[e.size].speed);
    if (e.slowT > 0) { e.slowT -= dt; sp *= (e.slowF || 1); } // 제갈량 끈끈이 — 이동 둔화
    const progStep = (sp / 100) * dt;
    e.prog += progStep;
    if (e.hit > 0) e.hit -= dt;
    const pt = pathPoint(e.prog);
    const ta = pathPoint(e.prog - 0.014), tb = pathPoint(e.prog + 0.014); // 완만한 접선
    const tx = tb.x - ta.x, ty = tb.y - ta.y;
    const tl = Math.hypot(tx, ty) || 1;
    e.wPhase = (e.wPhase || 0) + dt * (e.wSpeed || 1);
    const off = (e.wOut ?? 3) + Math.sin(e.wPhase) * 1.2; // 고정 바깥거리 + 약한 흔들림
    const targetX = pt.x + (ty / tl) * off;   // 바깥 법선
    const targetY = pt.y + (-tx / tl) * off;
    if (e.x === undefined) { e.x = targetX; e.y = targetY; } // 스폰 첫 프레임
    else {
      const cap = progStep * PERIM * 1.3 + 0.04; // 이번 프레임 이동 상한(코너 균일)
      const ddx = targetX - e.x, ddy = targetY - e.y, dd = Math.hypot(ddx, ddy);
      if (dd > cap) { e.x += (ddx / dd) * cap; e.y += (ddy / dd) * cap; }
      else { e.x = targetX; e.y = targetY; }
    }
    if (tx > 0.03) e.face = 1;        // 진행(접선) 방향으로 좌우 뒤집기
    else if (tx < -0.03) e.face = -1;
  }

  // 유닛 이동 — 드래그한 목표 지점(tx,ty)으로 걸어간다(8방향). 이동 방향으로 좌우 뒤집기.
  const usp = DEFENSE.unit.moveSpeed;
  for (const u of run.units) {
    if (u.tx == null) { u.tx = u.x; u.ty = u.y; } // 구세이브 방어
    const mdx = u.tx - u.x;
    const mdy = u.ty - u.y;
    const md = Math.hypot(mdx, mdy);
    if (md > 0.5) {
      const step = Math.min(md, usp * dt);
      u.x += (mdx / md) * step;
      u.y += (mdy / md) * step;
      if (mdx > 0.2) u.face = 1;
      else if (mdx < -0.2) u.face = -1;
      u.moving = true;
    } else {
      u.x = u.tx;
      u.y = u.ty;
      u.moving = false;
    }
  }

  // 전투 — 사거리 안 가까운 적부터 multi명 동시 타격. 초월(6)은 10초마다 광역기로 전 적 타격.
  const eu = DEFENSE.unit.elemUpgrade;
  for (const u of run.units) {
    const info = DEFENSE.unit.byRarity[u.rarity];
    const lv = run.elemLevel?.[u.element] || null;
    const atkBoost = 1 + eu.atkPerLevel * (lv?.atk || 0);
    const spdMul = Math.max(0.25, 1 - eu.spdPerLevel * (lv?.spd || 0));

    // 광역기(초월) — 간격마다 전 적을 한 번에 타격 (공격 쿨다운과 별개)
    // 프렙 게이트 제거(2026-07-22) — 라운드간 정비 중에도 기존 적을 상대로 전투 유지. 초기 프렙은 적 0이라 무동작.
    if (info.aoe) {
      u.aoeCd = (u.aoeCd ?? info.aoe.interval) - dt;
      if (u.aoeCd <= 0 && run.enemies.length) {
        u.aoeCd = info.aoe.interval;
        // 개별 단련도 광역기에 반영(감사 2026-07-23: 누락돼 초월 단련이 절반만 일하던 것)
        const aoeDmg = u.base * info.dmg * info.aoe.dmgMult * (run.dmgMult || 1) * atkBoost
          * (1 + DEFENSE.unit.upgrade.dmgPerLevel * (u.upgradeLv || 0)) * (1 + (perks.might || 0) / 100);
        // 2026-07-22 수석: 광역기 연출은 시전자 발밑이 아니라 '적 무리' 위에 터지게(자기가 얻어맞는 듯 보이던 문제).
        let cx = 0, cy = 0, na = 0;
        for (const e of run.enemies) { if (!e.dead) { cx += e.x; cy += e.y; na++; } }
        const ax = na ? cx / na : u.x, ay = na ? cy / na : u.y;
        run.fx.push({ type: 'aoe', uid: u.uid, x: ax, y: ay, element: u.element });
        for (const e of run.enemies) {
          e.hp -= aoeDmg; e.hit = 0.18;
          if (e.hp <= 0 && !e.dead) registerKill(run, e);
        }
      }
    }

    // 마법 시전(제갈량 끈끈이) — cd초마다 적 밀집점에 슬로우 장 전개
    const cast = HERO_CAST[u.heroId];
    if (cast && cast.type === 'slow') {
      u.castCd = (u.castCd ?? cast.cd) - dt;
      if (u.castCd <= 0 && run.enemies.length) {
        u.castCd = cast.cd;
        // 2026-07-22 수석: 시전자 발밑이 아니라 '적 밀집점'에 깔리게(자기한테 걸린 것처럼 보이던 문제)
        const c = densestEnemyPoint(run, cast.radius);
        if (c) {
          for (const e of run.enemies) {
            if (!e.dead && Math.hypot(e.x - c.x, e.y - c.y) <= cast.radius) { e.slowT = cast.dur; e.slowF = cast.factor; }
          }
          run.fx.push({ type: 'slowField', uid: u.uid, x: c.x, y: c.y, radius: cast.radius, element: u.element });
        }
      }
    }
    // 싸이오닉 스톰(조조) — cd초마다 적 밀집점에 전기 폭풍 소환(지속 광역 데미지)
    if (cast && cast.type === 'storm') {
      u.castCd = (u.castCd ?? cast.cd) - dt;
      if (u.castCd <= 0 && run.enemies.length) {
        u.castCd = cast.cd;
        const c = densestEnemyPoint(run, cast.radius); // 적 밀집점에 폭풍
        if (c) {
          const dmg = u.base * info.dmg * cast.dmgMult * (run.dmgMult || 1) * atkBoost
            * (1 + DEFENSE.unit.upgrade.dmgPerLevel * (u.upgradeLv || 0)) * (1 + (perks.might || 0) / 100); // 단련·특성 반영
          (run.storms = run.storms || []).push({ x: c.x, y: c.y, radius: cast.radius, dmg, t: 0, dur: cast.dur, tickCd: 0, tickEvery: cast.tickEvery });
          run.fx.push({ type: 'storm', uid: u.uid, x: c.x, y: c.y, radius: cast.radius, dur: cast.dur, element: u.element });
        }
      }
    }

    if (u.cd > 0) { u.cd -= dt; continue; }
    // 사거리 내 적을 거리순으로 정렬 — 가까운 multi명을 동시에 친다
    const inRange = [];
    for (const e of run.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d <= info.range) inRange.push({ e, d });
    }
    if (!inRange.length) continue;
    inRange.sort((a, b) => a.d - b.d);
    const targets = inRange.slice(0, info.multi || 1);
    u.cd = info.cooldown * spdMul * Math.max(0.5, 1 - (perks.haste || 0) / 100); // haste 특성 — 전군 공속
    u.face = targets[0].e.x < u.x ? -1 : 1; // 공격 대상 쪽으로 몸을 돌린다
    for (const { e: target } of targets) {
      const dmg = damage(u, target, perks) * (run.dmgMult || 1) * atkBoost;
      target.hp -= dmg;
      target.hit = 0.18;
      // 투사체 연출용 — 쏜 자리(u)·맞는 자리(target)·병기 판별용 heroId·속성색
      run.fx.push({
        type: 'attack', uid: u.uid, eid: target.eid, face: u.face,
        heroId: u.heroId, element: u.element, rarity: u.rarity, // rarity → 등급 높을수록 큰 이펙트
        ux: u.x, uy: u.y, ex: target.x, ey: target.y,
      });
      if (target.hp <= 0 && !target.dead) registerKill(run, target);
    }
  }
  // 싸이오닉 스톰 지속 데미지 — 지속 시간 동안 tick마다 반경 내 적을 지진다
  if (run.storms && run.storms.length) {
    for (const s of run.storms) {
      s.t += dt; s.tickCd -= dt;
      if (s.tickCd <= 0) {
        s.tickCd = s.tickEvery;
        for (const e of run.enemies) {
          if (!e.dead && Math.hypot(e.x - s.x, e.y - s.y) <= s.radius) { e.hp -= s.dmg; e.hit = 0.14; if (e.hp <= 0 && !e.dead) registerKill(run, e); }
        }
      }
    }
    run.storms = run.storms.filter((s) => s.t < s.dur);
  }
  run.enemies = run.enemies.filter((e) => !e.dead);

  // 패배 — 살아있는 적 100 누적
  if (run.enemies.length >= w.loseAt) {
    run.gameOver = true;
    run.fx.push({ type: 'gameover' });
    return;
  }

  // 2026-07-21 수석: 웨이브(타이머)가 끝나도 남은 적을 '치우지 않는다'. 시간은 계속 흐르고 적은 누적된다.
  //   타이머는 이제 '다음 웨이브(더 강한 스테이지·보스) 투입' 신호일 뿐 — 필드는 그대로 이어진다.
  //   살아있는 적 100 누적(loseAt)이 유일한 패배. 못 잡고 쌓으면 진다(진짜 생존 디펜스).
  if (run.prepLeft <= 0 && !run.won && !run.gameOver) {
    run.roundLeft = (run.roundLeft ?? w.roundTime) - dt;
    if (run.roundLeft <= 0) {
      if (run.stage >= stageCap()) {
        run.won = true;
        run.fx.push({ type: 'win' });
        return;
      }
      run.gold += w.roundClearGold ?? 0; // 웨이브 돌파 보너스 골드(적은 그대로 누적)
      run.stage += 1;
      run.fx.push({ type: 'stageClear', stage: run.stage, bonus: w.roundClearGold ?? 0 });
      beginStage(run); // 다음 웨이브 스폰 개시 — 기존 적 위에 더 얹는다(run.enemies 유지)
      // 2026-07-22 수석: 라운드간 정비창 — 다음 웨이브 신규 스폰을 betweenSeconds 동안 멈춘다.
      //   (기존 적·전투는 그대로 진행) 번 골드로 소환/합성/단련하는 숨 고르기. 0이면 종전처럼 즉시 다음 웨이브.
      run.prepLeft = DEFENSE.prep?.betweenSeconds ?? 0;
      run.roundLeft = w.roundTime;
    }
  }
}

/** UI가 이번 프레임 fx를 읽고 비운다 */
export function drainFx(run) {
  const fx = run.fx;
  run.fx = [];
  return fx;
}
