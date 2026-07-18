// 방치 전투 — 편성 전원이 전장에 서서 각자 때리고, 적도 맨 앞을 반격한다.
// 적이 쓰러지면 0.7초 뒤 새 적이 하나만 등장하고, 전원이 쓰러지면 3초 재정비 후 되살아난다.
// 전투 계산은 여기(시스템)에만 있고, UI는 이벤트로만 구독한다. DOM 접근 없음.
//
// 흐름: 적 10 처치 → 우두머리(이길 수 있을 때만 등장) → 돌파. 못 이기면 일반 적 반복 사냥.
//
// 이벤트:
//   battle:spawn  { enemy }              새 적 등장 (enemy.rival = 보유 장수와 같은 숙적)
//   battle:hit    { damage, hp, maxHp }  아군의 공격이 맞음
//   battle:death  { boss, rival }        적이 쓰러짐
//   battle:allies { units }              아군 상태 변화 (피격·회복·교체) — [{id,name,faction,hp,maxHp}]
//   battle:wipe   {}                     전원 쓰러짐 — 재정비 시작
//   battle:recover{}                     재정비 끝 — 전원 복귀

import { BALANCE } from '../data/balance.js';
import { CHAPTERS } from '../data/stages.js';
import { HEROES } from '../data/heroes.js';
import * as state from '../core/state.js';
import { emit } from '../core/events.js';
import { partyPower, heroPower, bondBonus, activeBonds } from './growth.js';
import { createHeroUnit, totalDps, unitMaxHp } from './hero-unit.js';
import { createEnemyUnit, applyDamage } from './enemy-unit.js';
import { orderEffect } from './orders.js';
import { bountyTarget } from './quests.js';

let units = [];        // 아군 유닛들 (편성과 동기화)
let enemy = null;      // 동시에 한 마리만 존재한다
let respawnLeft = 0;   // 새 적 등장까지 남은 시간(초)
let wipeLeft = 0;      // 재정비 남은 시간(초)
let enemyCharge = 0;   // 적의 다음 공격까지 누적
let comboCharge = 0;   // 협공기 충전 (인연 발동 중의 아군 공격 횟수)
let tapGiven = 0;      // 지금 적에게서 이미 거둔 터치 엽전 — 연타 악용 상한용

// ── 조회 ─────────────────────────────────────────────

export function currentChapter(s) {
  return CHAPTERS[Math.min(s.stage.chapter, CHAPTERS.length) - 1];
}

/** 임의 지점의 전장 전투력 — 곡선(balance.scenario)에서 계산 */
export function stagePowerAt(difficulty, chapterNo, index) {
  const SC = BALANCE.scenario;
  const g = (chapterNo - 1) * 10 + index; // 전역 전장 번호 1~200
  return SC.basePower * Math.pow(SC.stageGrowth, g - 1) * Math.pow(SC.difficultyPowerMult, (difficulty ?? 1) - 1);
}

/** 현재 전장 — 이름·우두머리는 데이터, 전투력·엽전은 곡선에서 파생해 돌려준다 */
export function currentStage(s) {
  const chapter = currentChapter(s);
  const index = Math.min(s.stage.index, chapter.stages.length);
  const raw = chapter.stages[index - 1];
  const SC = BALANCE.scenario;
  const diff = s.stage.difficulty ?? 1;
  const basePower = SC.basePower * Math.pow(SC.stageGrowth, (s.stage.chapter - 1) * 10 + index - 1);
  return {
    ...raw,
    enemyPower: Math.round(basePower * Math.pow(SC.difficultyPowerMult, diff - 1)),
    coinPerKill: Math.max(1, Math.round(basePower * SC.coinRatio * Math.pow(SC.difficultyCoinMult, diff - 1))),
  };
}

/** 우두머리가 나오는 전장인가 — 5·10번째만 */
export function isBossStage(s) {
  return s.stage.index % 5 === 0;
}

/** 다음 우두머리 전장의 돌파 필요 전투력 (일반 전장에서는 다가올 보스전 기준을 보여준다) */
export function nextBossGate(s) {
  const bossIndex = Math.min(Math.ceil(s.stage.index / 5) * 5, 10);
  return Math.ceil(
    stagePowerAt(s.stage.difficulty ?? 1, s.stage.chapter, bossIndex) * BALANCE.battle.bossPowerRatio
  );
}

export function isBossPhase(s) {
  return s.stage.kills >= BALANCE.battle.killsPerStage;
}

export function canBeatBoss(s) {
  return partyPower(s) >= currentStage(s).enemyPower * BALANCE.battle.bossPowerRatio;
}

/** 진짜 마지막 — 난이도 20의 20장 10전장 */
export function isFinalStage(s) {
  return (
    (s.stage.difficulty ?? 1) >= BALANCE.scenario.difficultyCount &&
    s.stage.chapter === CHAPTERS.length &&
    s.stage.index === CHAPTERS[CHAPTERS.length - 1].stages.length
  );
}

export function currentEnemy() {
  return enemy;
}

/** 전장 비우기 — 세이브 교체(초기화·가져오기) 직후 호출 */
export function reset() {
  units = [];
  enemy = null;
  respawnLeft = 0;
  wipeLeft = 0;
  enemyCharge = 0;
  comboCharge = 0;
  tapGiven = 0;
}

// ── 협공기 — 인연이 발동 중일 때 아군의 공격이 쌓이면 한 방 ──

export function comboProgress() {
  return Math.min(1, comboCharge / BALANCE.combo.strikes);
}

export function comboReady() {
  return comboCharge >= BALANCE.combo.strikes;
}

/** 협공 발동 — 총 화력 × 배율의 한 방. 성공 시 true */
export function fireCombo() {
  const s = state.getState();
  if (!s || !enemy || wipeLeft > 0) return false;
  if (bondBonus(s) <= 0 || !comboReady()) return false;

  comboCharge = 0;
  const bond = activeBonds(s)[0];
  emit('combo:fired', { bond });
  applyHit(s, Math.round(totalDps() * BALANCE.combo.dpsMult), 'combo');
  emit('combo:charge', { progress: 0, ready: false });
  return true;
}

export function isRecovering() {
  return wipeLeft > 0;
}

export function alliesSnapshot() {
  return units.map((u) => ({ id: u.id, name: u.name, faction: u.faction, hp: u.hp, maxHp: u.maxHp }));
}

/** 현재 적에게 입힌 피해 비율 (전장 게이지용, 적이 없으면 0) */
export function killProgress() {
  return enemy ? 1 - enemy.hp / enemy.maxHp : 0;
}

/** 이 전장 일반 적의 최대 체력 — 전장 전투력에서 파생 */
export function enemyMaxHp(stage) {
  return Math.round(stage.enemyPower * BALANCE.enemyUnit.hpPerPower);
}

/** 초당 처치 수 — 총 피해량과 재등장 간격으로 계산 (복귀 보상용) */
export function killRatePerSecond(s = state.getState()) {
  const secondsPerKill = enemyMaxHp(currentStage(s)) / totalDps() + BALANCE.battle.respawnSeconds;
  return 1 / secondsPerKill;
}

// ── 아군 관리 ─────────────────────────────────────────

function emitAllies() {
  emit('battle:allies', { units: alliesSnapshot() });
}

/** 편성·성장과 유닛을 맞춘다. 최대 체력이 바뀌면 비율을 유지한 채 갱신. */
function syncUnits(s) {
  const ids = s.party;
  const changed = units.length !== ids.length || units.some((u, i) => u.id !== ids[i]);

  if (changed) {
    units = ids
      .map((id) => createHeroUnit(id))
      .filter(Boolean);
    units.forEach((u, i) => {
      u.charge = i / Math.max(1, units.length); // 공격 시점을 엇갈리게
    });
    emitAllies();
    return;
  }

  for (const u of units) {
    const expected = unitMaxHp(u.id, s);
    if (expected !== u.maxHp) {
      const ratio = u.hp / u.maxHp;
      u.maxHp = expected;
      u.hp = Math.round(expected * ratio);
      emitAllies();
    }
  }
}

function healAfterKill() {
  let touched = false;
  for (const u of units) {
    const next = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * BALANCE.heroUnit.healOnKill));
    if (next !== u.hp) {
      u.hp = next;
      touched = true;
    }
  }
  if (touched) emitAllies();
}

function reviveAll() {
  for (const u of units) u.hp = u.maxHp;
  units.forEach((u, i) => {
    u.charge = i / Math.max(1, units.length);
  });
  emit('battle:recover', {});
  emitAllies();
}

// ── 적 관리 ─────────────────────────────────────────

/** 우두머리가 보유 장수와 같은 인물이면 숙적이다. 해당 영웅을 돌려준다. */
function rivalHero(s, bossName) {
  const hero = HEROES.find((h) => h.name === bossName);
  return hero && s.heroes[hero.id] ? hero : null;
}

function spawnEnemy(s) {
  const chapter = currentChapter(s);
  const stage = currentStage(s);
  // 우두머리는 5·10전장에서, 이길 수 있을 때만 나온다 — 못 이기는 동안은 일반 적으로 반복 사냥
  const boss = isBossStage(s) && isBossPhase(s) && canBeatBoss(s);
  const rival = boss ? rivalHero(s, stage.boss) : null;
  const baseHp = enemyMaxHp(stage);
  const E = BALANCE.enemyUnit;

  enemy = createEnemyUnit({
    name: boss ? `우두머리 ‧ ${stage.boss}` : chapter.foe,
    boss,
    maxHp: boss ? baseHp * E.bossHpRatio : baseHp,
  });
  enemy.rival = Boolean(rival);
  enemy.rivalId = rival?.id ?? null;
  // 군령: 강동 수비진이 적의 공격을 무디게 한다
  enemy.atk = Math.max(
    1,
    Math.round(stage.enemyPower * E.atkPerPower * orderEffect(s, 'enemyAtkMult', 1)) * (boss ? E.bossAtkRatio : 1)
  );
  enemyCharge = 0;
  tapGiven = 0; // 새 적 — 터치 보상 상한도 새로
  emit('battle:spawn', { enemy });
}

/** 적이 쓰러졌을 때의 보상·진행 — 상태 변경은 전부 state 함수로 */
function resolveDeath(s, wasBoss, wasRival, enemyRivalId) {
  const stage = currentStage(s);
  const B = BALANCE.battle;

  if (!wasBoss) {
    const farm = isBossPhase(s); // 보스 전장에서 관문에 막혀 반복 사냥 중일 때만 참
    const coins = Math.round(stage.coinPerKill * (farm ? B.farmCoinRatio : 1));
    state.recordKill(coins, { farm });
    // 일반 전장(우두머리 없음)은 정원을 채우면 그대로 돌파 — 보스는 5·10전장에서만
    if (!isBossStage(s) && s.stage.kills >= B.killsPerStage) {
      state.addCoin(Math.round(stage.coinPerKill * BALANCE.scenario.stageClearCoinMult));
      state.clearStage();
    }
  } else if (canBeatBoss(s)) {
    const rivalMult = wasRival ? B.rivalCoinRatio : 1;
    state.addCoin(Math.round(stage.coinPerKill * B.bossCoinRatio * rivalMult));
    for (const bond of activeBonds(s)) state.bumpBondMastery(bond.id); // 인연 숙련
    if (wasRival && enemyRivalId) {
      state.recordRivalKill(enemyRivalId); // 첫 격파면 옥구슬
      const target = bountyTarget(s);
      if (target && target.id === enemyRivalId) state.claimBounty(BALANCE.bounty.jade); // 현상수배
    }
    if (isFinalStage(s)) {
      state.recordKill(stage.coinPerKill, { farm: true }); // 마지막 전장 — 머무르며 사냥
    } else {
      if (s.stage.index === currentChapter(s).stages.length) {
        // 장 평정 — 다음 장 진입의 발판이 될 엽전 뭉치
        state.addCoin(Math.round(stage.coinPerKill * B.chapterClearCoinMult));
      }
      state.addJade(B.jadeOnClear); // 전장 돌파 옥구슬 — 모집이 계속 흐르게
      state.clearStage();
    }
  } else {
    state.recordKill(Math.round(stage.coinPerKill * B.farmCoinRatio), { farm: true });
  }
}

// ── 전투 진행 ─────────────────────────────────────────

/** 피해 한 방을 적에게 적용하고, 쓰러지면 죽음 처리까지 잇는다. */
function applyHit(s, damage, attackerId) {
  if (!enemy || enemy.hp <= 0) return;

  if (enemy.boss) damage = Math.round(damage * orderEffect(s, 'bossDamageMult', 1)); // 군령: 난세의 기세
  const dead = applyDamage(enemy, damage);
  emit('battle:hit', { damage, hp: enemy.hp, maxHp: enemy.maxHp, attackerId });
  if (!dead) return;

  const wasBoss = enemy.boss;
  const wasRival = Boolean(enemy.rival);
  const wasRivalId = enemy.rivalId;
  enemy = null;
  respawnLeft = BALANCE.battle.respawnSeconds; // 타이머는 이 한 곳에서만 건다
  state.tallyKill();
  emit('battle:death', { boss: wasBoss, rival: wasRival });
  resolveDeath(s, wasBoss, wasRival, wasRivalId);
  healAfterKill(); // 한숨 돌리며 전열을 추스른다
}

function strikeBy(unit, s) {
  if (!enemy || enemy.hp <= 0) return;

  // 자기 전투력 몫만큼 때린다 — 합계는 totalDps와 같다
  let sumPower = 0;
  for (const u of units) sumPower += heroPower(u.id, s.heroes[u.id]);
  const share = sumPower > 0 ? heroPower(unit.id, s.heroes[unit.id]) / sumPower : 1 / units.length;
  const damage = Math.max(1, Math.round(totalDps() * share));

  applyHit(s, damage, unit.id);

  // 협공 충전 — 인연이 발동 중일 때만 쌓인다 (군령: 의기충천이 빠르게 한다)
  if (bondBonus(s) > 0 && comboCharge < BALANCE.combo.strikes) {
    comboCharge += orderEffect(s, 'comboChargeMult', 1);
    emit('combo:charge', { progress: comboProgress(), ready: comboReady() });
  }
}

function enemyStrike() {
  const target = units.find((u) => u.hp > 0);
  if (!target) return;
  target.hp = Math.max(0, target.hp - enemy.atk);
  emit('battle:foeStrike', { targetId: target.id, boss: enemy.boss }); // 반격 연출용
  emitAllies();

  if (units.every((u) => u.hp <= 0)) {
    // 전멸 — 적은 기세를 회복하고, 아군은 잠시 물러난다
    enemy.hp = enemy.maxHp;
    enemyCharge = 0;
    wipeLeft = BALANCE.battle.wipeRecoverSeconds;
    emit('battle:wipe', {});
  }
}

export function tick(dt) {
  const s = state.getState();
  if (!s) return;

  syncUnits(s);

  if (wipeLeft > 0) {
    wipeLeft -= dt;
    if (wipeLeft <= 0) reviveAll();
    return;
  }

  if (!enemy) {
    respawnLeft -= dt;
    if (respawnLeft <= 0) spawnEnemy(s);
    return;
  }

  // 아군 공격 — 각자 엇갈린 박자로
  for (const u of units) {
    if (u.hp <= 0) continue;
    u.charge += u.attackSpeed * dt;
    while (u.charge >= 1 && enemy) {
      u.charge -= 1;
      strikeBy(u, s);
    }
    if (!enemy) return;
  }

  // 적의 반격 — 맨 앞의 아군을 때린다
  enemyCharge += dt / BALANCE.enemyUnit.attackSeconds;
  while (enemyCharge >= 1 && enemy) {
    enemyCharge -= 1;
    enemyStrike();
    if (wipeLeft > 0) return;
  }
}

/** 전장 터치 보상 — 즉각 반응 장치. 적 1마리당 상한까지만 준다(연타 악용 차단). */
export function tapReward() {
  const s = state.getState();
  const stage = currentStage(s);
  const B = BALANCE.battle;
  const cap = Math.round(stage.coinPerKill * B.tapCapRatio);
  const gain = Math.max(1, Math.round(stage.coinPerKill * B.tapBonusRatio));
  const grant = Math.max(0, Math.min(gain, cap - tapGiven));
  if (grant > 0) {
    tapGiven += grant;
    state.addCoin(grant);
  }
  return grant;
}
