// 삼국지 랜덤 디펜스 — 엔진 (순수 로직, DOM 접근 없음).
// UI(defense-screen.js)가 rAF로 tick(run, dt)을 돌리고 run 상태를 읽어 그린다.
// run.fx[]에 이번 프레임의 순간 이벤트(피격·처치·소환·보상)를 쌓아 UI가 소비한다.

import { HEROES } from '../data/heroes.js';
import {
  DEFENSE, SUMMON_POOL, HERO_ELEMENT, HERO_SIZE_ROLE,
  ELEMENT_BEATS, SIZE_ROLE_MULT, ENEMY_SPRITES, BOSS_SPRITE,
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

// ── 유닛 배치 칸 좌표 — 트랙 안쪽 4×4 그리드 ──
export function slotPos(i) {
  const cols = 4;
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: 26 + col * 16, y: 34 + row * 10.7 };
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
  const es = ['water', 'fire', 'earth'];
  return es[Math.floor(Math.random() * es.length)];
}

// ── 유닛 생성(소환) ──
let unitSeq = 1;
function makeUnit(heroId, slot) {
  return {
    uid: unitSeq++,
    heroId,
    rarity: RARITY.get(heroId),
    base: BASE.get(heroId),
    element: HERO_ELEMENT[heroId],
    sizeRole: HERO_SIZE_ROLE[heroId],
    upgradeLv: 0,
    slot,
    ...slotPos(slot),
    cd: 0,
  };
}
function freeSlot(run) {
  const used = new Set(run.units.map((u) => u.slot));
  for (let i = 0; i < DEFENSE.field.slots; i++) if (!used.has(i)) return i;
  return -1;
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
  run.units.push(unit);
  run.fx.push({ type: 'summon', uid: unit.uid, rarity, free: useFree });
  return unit;
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
export function upgrade(run, uid) {
  const u = run.units.find((x) => x.uid === uid);
  if (!u || u.upgradeLv >= DEFENSE.unit.upgrade.maxLevel) return false;
  const cost = upgradeCost(u.upgradeLv);
  if (run.gold < cost) return false;
  run.gold -= cost;
  u.upgradeLv += 1;
  run.fx.push({ type: 'upgrade', uid });
  return true;
}

// ── 반환(판매) — 등급값 + 단련 골드 50% 환급, 등급값은 소환가 이하 캡(데이터에서 이미 캡) ──
export function refundValue(u) {
  const base = DEFENSE.unit.refund.goldByRarity[u.rarity] ?? 0;
  return Math.round(base + sumUpgradeSpent(u.upgradeLv) * DEFENSE.unit.refund.upgradeReturn);
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

// ── 합성 — 같은 등급 아무 영웅 3장 → 상위 등급 랜덤 1장. 최고 단련 계승 + 나머지 50% 환급 ──
export function sameRarityCount(run, rarity) {
  return run.units.filter((u) => u.rarity === rarity).length;
}
export function canMerge(run, rarity) {
  return rarity < 5 && sameRarityCount(run, rarity) >= DEFENSE.merge.need;
}
export function merge(run, rarity) {
  if (!canMerge(run, rarity)) return null;
  const mats = run.units.filter((u) => u.rarity === rarity).slice(0, DEFENSE.merge.need);
  const topLv = Math.max(...mats.map((m) => m.upgradeLv));
  const totalSpent = mats.reduce((s, m) => s + sumUpgradeSpent(m.upgradeLv), 0);
  const refundGold = Math.round((totalSpent - sumUpgradeSpent(topLv)) * DEFENSE.merge.consumedUpgradeReturn);
  const slot = mats[0].slot;
  const matUids = new Set(mats.map((m) => m.uid));
  run.units = run.units.filter((u) => !matUids.has(u.uid));
  run.gold += refundGold;
  const nr = rarity + 1;
  const pool = SUMMON_POOL[nr];
  const heroId = pool[Math.floor(Math.random() * pool.length)];
  const unit = makeUnit(heroId, slot);
  unit.upgradeLv = topLv; // 최고 단련 계승
  run.units.push(unit);
  run.fx.push({ type: 'merge', rarity: nr, uid: unit.uid });
  return unit;
}

// ── 도박 — 골드 걸어 랜덤 획득(0이 최빈, 희박 잭팟) ──
export function gamble(run) {
  if (run.gold < DEFENSE.gamble.cost) return null;
  run.gold -= DEFENSE.gamble.cost;
  const won = pickWeighted(DEFENSE.gamble.outcomes, 'weight').gold;
  run.gold += won;
  run.fx.push({ type: 'gamble', won });
  return won;
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
  run.bossStage = isBossStage(run.stage);
  // 보스 스테이지: 일반(perStage - count) + 보스 count. 보스는 중반·후반 스폰 인덱스에 배정.
  const per = DEFENSE.wave.perStage;
  run.toSpawn = per;
  run.bossIdx = run.bossStage
    ? new Set([Math.floor(per * 0.5), per - 1].slice(0, DEFENSE.wave.boss.count))
    : new Set();
}

export function createRun() {
  const run = {
    stage: 1,
    gold: DEFENSE.summon.startGold,
    units: [],
    enemies: [],
    fx: [],
    gameOver: false,
    won: false,
    elapsed: 0,
    freePulls: 0, // 보스 보상 등 무료 소환 대기분
  };
  beginStage(run);
  run.freePulls = DEFENSE.summon.openingPulls; // 오프닝 무료 10연차 — 자동 배치 아님, 플레이어가 눌러 뽑는다
  return run;
}

function spawnEnemy(run) {
  const idx = run.spawned;
  const isBoss = run.bossIdx.has(idx);
  const size = isBoss ? rollSize() : rollSize(); // 보스도 소/중/대
  const hp = enemyHp(run.stage, idx, size, isBoss);
  run.enemies.push({
    eid: enemySeq++,
    spriteId: isBoss ? BOSS_SPRITE : ENEMY_SPRITES[(run.stage - 1) % ENEMY_SPRITES.length],
    isBoss,
    size,
    element: randElement(),
    hp,
    maxHp: hp,
    prog: Math.random() * 0.02, // 살짝 흩어져 스폰
    hit: 0,
  });
  run.spawned += 1;
}

/** 한 프레임 진행 — run 변이 + run.fx에 이벤트 적재 */
export function tick(run, dt) {
  if (run.gameOver || run.won) return;
  run.elapsed += dt;
  const w = DEFENSE.wave;

  // 스폰
  if (run.spawned < run.toSpawn) {
    run.spawnTimer += dt;
    while (run.spawned < run.toSpawn && run.spawnTimer >= w.spawnInterval) {
      run.spawnTimer -= w.spawnInterval;
      spawnEnemy(run);
    }
  }

  // 적 이동(트랙 보행)
  for (const e of run.enemies) {
    const sp = w.speed * (e.isBoss ? w.boss.speedMult : w.sizes[e.size].speed);
    e.prog += (sp / 100) * dt;
    if (e.hit > 0) e.hit -= dt;
    const pt = pathPoint(e.prog);
    e.x = pt.x;
    e.y = pt.y;
  }

  // 전투 — 유닛이 사거리 안 가장 가까운 적을 친다
  for (const u of run.units) {
    if (u.cd > 0) u.cd -= dt;
    if (u.cd > 0) continue;
    const range = DEFENSE.unit.byRarity[u.rarity].range;
    let target = null;
    let best = range;
    for (const e of run.enemies) {
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d <= best) { best = d; target = e; }
    }
    if (target) {
      const dmg = damage(u, target);
      target.hp -= dmg;
      target.hit = 0.18;
      u.cd = DEFENSE.unit.byRarity[u.rarity].cooldown;
      run.fx.push({ type: 'attack', uid: u.uid, eid: target.eid });
      if (target.hp <= 0) {
        target.dead = true;
        run.gold += killGold(run.stage, target.size, target.isBoss);
        run.killedThisStage += 1;
        run.fx.push({ type: 'kill', eid: target.eid, boss: target.isBoss, x: target.x, y: target.y });
        if (target.isBoss) {
          run.freePulls += bossPulls(run.stage);
          run.fx.push({ type: 'bossReward', pulls: bossPulls(run.stage) });
        }
      }
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
  }
}

/** UI가 이번 프레임 fx를 읽고 비운다 */
export function drainFx(run) {
  const fx = run.fx;
  run.fx = [];
  return fx;
}
