// 삼국지 랜덤 디펜스 — 엔진 (순수 로직, DOM 접근 없음).
// UI(defense-screen.js)가 rAF로 tick(run, dt)을 돌리고 run 상태를 읽어 그린다.
// run.fx[]에 이번 프레임의 순간 이벤트(피격·처치·소환·보상)를 쌓아 UI가 소비한다.

import { HEROES } from '../data/heroes.js';
import {
  DEFENSE, SUMMON_POOL, HERO_ELEMENT, HERO_SIZE_ROLE,
  ELEMENT_BEATS, SIZE_ROLE_MULT, ENEMY_SPRITES, BOSS_SPRITES, ELEMENTS,
} from '../data/defense.js';

const BASE = new Map(HEROES.map((h) => [h.id, h.base]));
const RARITY = new Map(HEROES.map((h) => [h.id, h.rarity]));

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
export function slotPos(i) {
  const b = DEFENSE.unit.bounds;
  const cx = (b.x1 + b.x2) / 2; // 가로 중앙
  const cy = (b.y1 + b.y2) / 2; // 세로 중앙
  // 2026-07-20 수석: 가운데를 중심으로 촘촘히 모아 배치(소환/합성이 중앙 위주로 출현). 중앙 살짝 위에서 아래로.
  const cols = 6, gx = 6.5, gy = 6;
  const col = i % cols;
  const row = Math.floor(i / cols);
  const x = cx + (col - (cols - 1) / 2) * gx;
  const y = cy - gy + row * gy;
  return { x: Math.max(b.x1, Math.min(b.x2, x)), y: Math.max(b.y1, Math.min(b.y2, y)) };
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
  const rarity = rollRarity();
  const pool = SUMMON_POOL[rarity];
  const heroId = pool[Math.floor(Math.random() * pool.length)];
  const unit = makeUnit(heroId, slot);
  const mate = run.units.find((x) => x.heroId === heroId);
  if (mate) unit.upgradeLv = mate.upgradeLv; // 같은 영웅이 이미 있으면 공유 단련 레벨 계승
  run.units.push(unit);
  run.fx.push({ type: 'summon', uid: unit.uid, rarity, free: useFree });
  return unit;
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
  return Math.round(u.costBase * Math.pow(u.costGrowth, lv));
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
  return Math.round(e.costBase * Math.pow(e.costGrowth, lv));
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
export function canMergeHero(run, heroId) {
  return RARITY.get(heroId) < 6 && sameHeroCount(run, heroId) >= DEFENSE.merge.need;
}
/** 3장 이상 모인 '같은 영웅' 목록 — 합성 대상 선택 UI용. [{heroId, count, rarity}] */
export function mergeableHeroes(run) {
  const byHero = new Map();
  for (const u of run.units) byHero.set(u.heroId, (byHero.get(u.heroId) || 0) + 1);
  const out = [];
  for (const [heroId, count] of byHero) {
    const rarity = RARITY.get(heroId);
    if (count >= DEFENSE.merge.need && rarity < 6) out.push({ heroId, count, rarity });
  }
  return out.sort((a, b) => b.rarity - a.rarity || b.count - a.count);
}
export function mergeHero(run, heroId) {
  if (!canMergeHero(run, heroId)) return null;
  const mats = run.units.filter((u) => u.heroId === heroId).slice(0, DEFENSE.merge.need);
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
function damage(unit, enemy) {
  const r = DEFENSE.unit.byRarity[unit.rarity];
  let d = unit.base * r.dmg * (1 + DEFENSE.unit.upgrade.dmgPerLevel * unit.upgradeLv);
  if (ELEMENT_BEATS[unit.element] === enemy.element) d *= DEFENSE.element.strong;
  else if (ELEMENT_BEATS[enemy.element] === unit.element) d *= DEFENSE.element.weak;
  d *= SIZE_ROLE_MULT[unit.sizeRole][enemy.size];
  return d;
}

// ── 적 체력·보상 ──
function enemyHp(stage, index, size, isBoss) {
  const w = DEFENSE.wave;
  const base = w.hpBase * Math.pow(w.hpPerStage, stage - 1) * (1 + w.hpPerIndex * index);
  if (isBoss) return base * w.sizes.medium.hp * w.boss.hpMult;
  return base * w.sizes[size].hp;
}
function killGold(stage, size, isBoss) {
  const w = DEFENSE.wave;
  const mult = isBoss ? w.boss.goldMult : w.sizes[size].gold;
  return Math.round(w.goldPerKill * mult * Math.pow(w.goldPerStage, stage - 1));
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
  run.enemies.push({
    eid: enemySeq++,
    spriteId: isBoss
      ? BOSS_SPRITES[Math.floor(run.stage / DEFENSE.wave.boss.everyStages - 1) % BOSS_SPRITES.length]
      : ENEMY_SPRITES[(run.stage - 1) % ENEMY_SPRITES.length],
    isBoss,
    size,
    element: run.stageElement || randElement(), // 라운드 통일 속성(구세이브 방어로 폴백)
    hp,
    maxHp: hp,
    prog: Math.random() * 0.02, // 살짝 흩어져 스폰
    hit: 0,
    face: 1, // 이동 방향으로 좌우 뒤집기
    wPhase: Math.random() * Math.PI * 2, // 자유 이동 위상(경로 바깥 흔들림)
    wAmp: 2 + Math.random() * 6,          // 바깥 이탈 진폭(%) — 점선 밖에서만
    wSpeed: 0.5 + Math.random() * 0.9,    // 흔들림 속도
  });
  // 이번 스테이지 첫 보스가 나오는 순간 — 긴장 단계를 알린다(경보음·배너). 스테이지당 1회.
  if (isBoss && !run.bossWarned) {
    run.bossWarned = true;
    run.fx.push({ type: 'bossSpawn' });
  }
  run.spawned += 1;
}

// 적 처치 정산 — 골드·처치수·처치 fx·보스 보상. (일반타격·광역기 공용)
function registerKill(run, target) {
  target.dead = true;
  run.gold += killGold(run.stage, target.size, target.isBoss);
  run.killedThisStage += 1;
  run.kills = (run.kills || 0) + 1;
  run.fx.push({ type: 'kill', eid: target.eid, boss: target.isBoss, x: target.x, y: target.y });
  if (target.isBoss) {
    run.freePulls += bossPulls(run.stage);
    run.fx.push({ type: 'bossReward', pulls: bossPulls(run.stage) });
  }
}

/** 한 프레임 진행 — run 변이 + run.fx에 이벤트 적재 */
export function tick(run, dt) {
  if (run.gameOver || run.won) return;
  run.elapsed += dt;
  if (run.gambleCd > 0) run.gambleCd = Math.max(0, run.gambleCd - dt); // 도박 쿨다운
  const w = DEFENSE.wave;

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

  // 적 이동 — 경로를 돌되 수직으로 흔들려 점선 안팎을 자유롭게 다닌다(딱 선만 따라가지 않게).
  for (const e of run.enemies) {
    const sp = w.speed * (e.isBoss ? w.boss.speedMult : w.sizes[e.size].speed);
    e.prog += (sp / 100) * dt;
    if (e.hit > 0) e.hit -= dt;
    const pt = pathPoint(e.prog);
    const pt2 = pathPoint(e.prog + 0.004);          // 진행 방향(접선)
    const tx = pt2.x - pt.x, ty = pt2.y - pt.y;
    const tl = Math.hypot(tx, ty) || 1;
    e.wPhase = (e.wPhase || 0) + dt * (e.wSpeed || 1);
    // 점선 '밖에서만' 돈다(수석) — 경로의 바깥 법선(인방향의 반대)으로 항상 양수 오프셋
    const off = 2 + (0.5 + 0.5 * Math.sin(e.wPhase)) * (e.wAmp || 0);
    const px = pt.x + (ty / tl) * off;
    const py = pt.y + (-tx / tl) * off;
    const dx = px - e.x;
    if (dx > 0.03) e.face = 1;
    else if (dx < -0.03) e.face = -1;
    e.x = px;
    e.y = py;
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
    if (info.aoe && !prepping) {
      u.aoeCd = (u.aoeCd ?? info.aoe.interval) - dt;
      if (u.aoeCd <= 0 && run.enemies.length) {
        u.aoeCd = info.aoe.interval;
        const aoeDmg = u.base * info.dmg * info.aoe.dmgMult * (run.dmgMult || 1) * atkBoost;
        run.fx.push({ type: 'aoe', uid: u.uid, x: u.x, y: u.y, element: u.element });
        for (const e of run.enemies) {
          e.hp -= aoeDmg; e.hit = 0.18;
          if (e.hp <= 0 && !e.dead) registerKill(run, e);
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
    u.cd = info.cooldown * spdMul;
    u.face = targets[0].e.x < u.x ? -1 : 1; // 공격 대상 쪽으로 몸을 돌린다
    for (const { e: target } of targets) {
      const dmg = damage(u, target) * (run.dmgMult || 1) * atkBoost;
      target.hp -= dmg;
      target.hit = 0.18;
      // 투사체 연출용 — 쏜 자리(u)·맞는 자리(target)·병기 판별용 heroId·속성색
      run.fx.push({
        type: 'attack', uid: u.uid, eid: target.eid, face: u.face,
        heroId: u.heroId, element: u.element,
        ux: u.x, uy: u.y, ex: target.x, ey: target.y,
      });
      if (target.hp <= 0 && !target.dead) registerKill(run, target);
    }
  }
  run.enemies = run.enemies.filter((e) => !e.dead);

  // 패배 — 살아있는 적 100 누적
  if (run.enemies.length >= w.loseAt) {
    run.gameOver = true;
    run.fx.push({ type: 'gameover' });
    return;
  }

  // 스테이지 클리어 — 다 스폰하고 다 잡음
  if (run.spawned >= run.toSpawn && run.enemies.length === 0) {
    if (run.stage >= stageCap()) {
      run.won = true;
      run.fx.push({ type: 'win' });
      return;
    }
    run.stage += 1;
    run.fx.push({ type: 'stageClear', stage: run.stage });
    beginStage(run);
    run.roundLeft = DEFENSE.wave.roundTime; // 라운드 사이 정비 없음(수석) — 새 라운드 60초 타이머만 리셋
  }

  // 라운드 제한 시간 — 전투 중(프렙 아님) 시간을 못 지키면 패배. 방금 클리어로 프렙 들어갔으면 제외.
  if (run.prepLeft <= 0 && !run.won && !run.gameOver) {
    run.roundLeft = (run.roundLeft ?? w.roundTime) - dt;
    if (run.roundLeft <= 0) { run.gameOver = true; run.fx.push({ type: 'gameover' }); }
  }
}

/** UI가 이번 프레임 fx를 읽고 비운다 */
export function drainFx(run) {
  const fx = run.fx;
  run.fx = [];
  return fx;
}
