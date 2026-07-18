// 게임 상태의 단일 소유자.
// 상태 변경은 반드시 이 파일의 함수로만 하고, UI는 이벤트 버스로 구독한다.
//
// 이벤트 목록:
//   coin        { total, gained }      엽전 변화
//   jade        { total, gained }      옥구슬 변화
//   hero:add    { id }                 새 영웅 획득
//   hero:dupe   { id, dupes }          겹침 획득
//   hero:level  { id, level }          단련(레벨 상승)
//   party       { party }              출전 편성 변화
//   stage:kill  { kills, coins, farm } 적 처치 (farm=우두머리 못 이겨 반복 사냥 중)
//   stage:clear { chapter, index }     전장 돌파
//   gacha:pity  { pity }               천장 카운터 변화
//   stats:kill  { total }              누적 처치 수 변화
//   upgrade:atk { level }              공격 연마
//   hero:star   { id, stars }          승급(별 상승)
//   quest:claim { id, jade }           목표/업적 보상 수령
//   setting     { key, value }         설정 변경

import { emit } from './events.js';
import { CHAPTERS } from '../data/stages.js';
import { BALANCE } from '../data/balance.js';

let state = null;

export function initState(save) {
  state = save;
}

export function getState() {
  return state;
}

// ── 재화 ──────────────────────────────────────────────

export function addCoin(n) {
  if (n <= 0) return;
  state.resources.coin += n;
  emit('coin', { total: state.resources.coin, gained: n });
}

export function spendCoin(n) {
  if (state.resources.coin < n) return false;
  state.resources.coin -= n;
  emit('coin', { total: state.resources.coin, gained: -n });
  return true;
}

export function addJade(n) {
  if (n <= 0) return;
  state.resources.jade += n;
  emit('jade', { total: state.resources.jade, gained: n });
}

export function spendJade(n) {
  if (state.resources.jade < n) return false;
  state.resources.jade -= n;
  emit('jade', { total: state.resources.jade, gained: -n });
  return true;
}

// ── 영웅 ──────────────────────────────────────────────

export function ownsHero(id) {
  return Boolean(state.heroes[id]);
}

/** 영웅을 얻는다. 이미 보유했다면 겹침으로 쌓인다. */
export function grantHero(id) {
  if (state.heroes[id]) {
    state.heroes[id].dupes += 1;
    emit('hero:dupe', { id, dupes: state.heroes[id].dupes });
    return { dupe: true };
  }
  state.heroes[id] = { level: 1, stars: 1, dupes: 0 };
  emit('hero:add', { id });
  if (state.party.length < 5 && !state.party.includes(id)) {
    state.party.push(id);
    emit('party', { party: [...state.party] });
  }
  return { dupe: false };
}

/** 단련 — 비용 계산은 systems/growth.js가 담당하고 여기서는 지불과 상승만 한다. */
export function levelUpHero(id, cost) {
  const hero = state.heroes[id];
  if (!hero || hero.level >= BALANCE.growth.maxLevel) return false;
  if (!spendCoin(cost)) return false;
  hero.level += 1;
  emit('hero:level', { id, level: hero.level });
  return true;
}

/** 승급 — 겹침(dupeCost개)을 태워 별을 올린다. 비용 계산은 growth.starUpCost. */
export function starUpHero(id, dupeCost) {
  const hero = state.heroes[id];
  const maxStars = BALANCE.growth.starMultiplier.length;
  if (!hero || hero.stars >= maxStars) return false;
  if (hero.dupes < dupeCost) return false;
  hero.dupes -= dupeCost;
  hero.stars += 1;
  emit('hero:star', { id, stars: hero.stars });
  return true;
}

export function setParty(party) {
  const next = party.slice(0, 5).filter((id) => state.heroes[id]);
  if (next.length === 0) return false; // 전장에 최소 한 명은 서야 한다
  state.party = next;
  emit('party', { party: [...state.party] });
  return true;
}

/** 출전 5인 넣고 빼기 — 성공 시 true */
export function togglePartyMember(id) {
  if (!state.heroes[id]) return false;
  const idx = state.party.indexOf(id);
  if (idx >= 0) {
    if (state.party.length <= 1) return false; // 마지막 한 명은 못 뺀다
    return setParty(state.party.filter((x) => x !== id));
  }
  if (state.party.length >= 5) return false;
  return setParty([...state.party, id]);
}

// ── 출석·기록·일일 편의 ───────────────────────────────

/** 출석 현황 — claimable이면 오늘 보상을 아직 안 받았다 */
export function attendanceInfo() {
  state.attendance = state.attendance ?? { lastClaim: '', cycleDay: 0, totalDays: 0 };
  return { ...state.attendance, claimable: state.attendance.lastClaim !== todayKey() };
}

/** 오늘의 출석 보상 수령 — 7일 순환. 성공 시 받은 옥구슬, 이미 받았으면 0 */
export function claimAttendance() {
  const a = (state.attendance = state.attendance ?? { lastClaim: '', cycleDay: 0, totalDays: 0 });
  if (a.lastClaim === todayKey()) return 0;
  a.cycleDay = (a.cycleDay % BALANCE.attendance.rewards.length) + 1;
  a.totalDays += 1;
  a.lastClaim = todayKey();
  const jade = BALANCE.attendance.rewards[a.cycleDay - 1];
  addJade(jade);
  emit('attendance:claim', { day: a.cycleDay, jade, totalDays: a.totalDays });
  return jade;
}

export function freePullUsed() {
  return Boolean(ensureDaily().freePullUsed);
}
export function markFreePull() {
  ensureDaily().freePullUsed = true;
  emit('gacha:free', {});
}

export function offlineDoubled() {
  return Boolean(ensureDaily().offlineDoubled);
}
export function markOfflineDoubled() {
  ensureDaily().offlineDoubled = true;
}

/** 1회성 플래그 (온보딩 등) */
export function setFlag(key) {
  state.flags = state.flags ?? {};
  if (!state.flags[key]) {
    state.flags[key] = true;
    emit('flag', { key });
  }
}

/** 시련의 탑 — 오늘 남은 도전 횟수 */
export function towerTriesLeft() {
  return Math.max(0, BALANCE.tower.perDay - (ensureDaily().towerTries ?? 0));
}

/** 시련의 탑 등반 기록 — 시도 1회 소모, 신기록이면 갱신하고 옥구슬 지급 */
export function recordTowerClimb(newBest, jade) {
  const d = ensureDaily();
  d.towerTries = (d.towerTries ?? 0) + 1;
  state.records = state.records ?? {};
  if (newBest > (state.records.bestTower ?? 0)) state.records.bestTower = newBest;
  if (jade > 0) addJade(jade);
  emit('tower:climb', { best: state.records.bestTower ?? 0, jade });
}

/** 전투력 신기록 갱신 — 마일스톤(자릿수 문턱)을 넘기면 알린다 */
export function noteBestPower(power) {
  state.records = state.records ?? {};
  const prev = state.records.bestPower ?? 0;
  if (power <= prev) return;
  state.records.bestPower = power;
  for (const m of BALANCE.milestones) {
    if (prev < m && power >= m) emit('milestone', { value: m, power });
  }
}

// ── 전장 ──────────────────────────────────────────────

export function recordKill(coins, { farm = false } = {}) {
  if (!farm) state.stage.kills += 1;
  addCoin(coins);
  emit('stage:kill', { kills: state.stage.kills, coins, farm });
}

/** 전장 돌파 — 다음 전장으로. 20장을 다 돌면 난이도가 오르며 1장부터 다시.
 *  난이도 20의 마지막 전장이면 머무른다 (진짜 끝). */
export function clearStage() {
  const chapterCount = CHAPTERS.length;
  const chapter = CHAPTERS[state.stage.chapter - 1];
  const cleared = {
    difficulty: state.stage.difficulty ?? 1,
    chapter: state.stage.chapter,
    index: state.stage.index,
  };

  if (state.stage.index < chapter.stages.length) {
    state.stage.index += 1;
  } else if (state.stage.chapter < chapterCount) {
    state.stage.chapter += 1;
    state.stage.index = 1;
  } else if ((state.stage.difficulty ?? 1) < BALANCE.scenario.difficultyCount) {
    state.stage.difficulty = (state.stage.difficulty ?? 1) + 1;
    state.stage.chapter = 1;
    state.stage.index = 1;
    emit('difficulty:up', { difficulty: state.stage.difficulty });
  }
  state.stage.kills = 0;
  state.stats.totalClears += 1;
  ensureDaily().clears += 1;
  state.records = state.records ?? {};
  state.records.bestStage = `난이도 ${cleared.difficulty} ‧ ${cleared.chapter}장 ${cleared.index}전장`;
  emit('stage:clear', cleared);
}

// ── 일일 목표 ─────────────────────────────────────────

function todayKey(now = new Date()) {
  // 기기 현지 날짜 기준 (sv-SE 로케일 = YYYY-MM-DD)
  return now.toLocaleDateString('sv-SE');
}

/** 날짜가 바뀌었으면 일일 진행을 새로 시작한다. */
export function ensureDaily() {
  const key = todayKey();
  if (state.daily.date !== key) {
    state.daily = {
      date: key,
      kills: 0,
      pulls: 0,
      clears: 0,
      raids: 0,
      bountyDone: false,
      claimed: [],
      freePullUsed: false,   // 오늘의 무료 모집
      offlineDoubled: false, // 복귀 보상 2배 받기
      towerTries: 0,         // 오늘 시련의 탑 도전 수
    };
  }
  return state.daily;
}

/** 오늘 남은 급습 명령 횟수 */
export function raidsLeft() {
  const daily = ensureDaily();
  return Math.max(0, BALANCE.raids.perDay - (daily.raids ?? 0));
}

/**
 * 숙적 격파 기록. 첫 격파면 옥구슬을 얹어준다 — 벽에 막혀도 가챠가 돌게.
 * 반환: 첫 격파 여부
 */
export function recordRivalKill(heroId) {
  state.rivalKills = state.rivalKills ?? {};
  const first = !state.rivalKills[heroId];
  state.rivalKills[heroId] = (state.rivalKills[heroId] ?? 0) + 1;
  if (first) {
    addJade(BALANCE.battle.rivalFirstJade);
    emit('rival:first', { heroId, jade: BALANCE.battle.rivalFirstJade });
  }
  return first;
}

/** 급습 명령 사용 — 보상 계산은 systems/offline.js가 한다. */
export function useRaid(coins) {
  const daily = ensureDaily();
  if ((daily.raids ?? 0) >= BALANCE.raids.perDay) return false;
  daily.raids = (daily.raids ?? 0) + 1;
  addCoin(coins);
  emit('raid:used', { left: raidsLeft(), coins });
  return true;
}

/** 적 하나를 쓰러뜨릴 때마다 (일반·우두머리 모두) — 누적·일일 집계 */
export function tallyKill() {
  state.stats.totalKills += 1;
  ensureDaily().kills += 1;
  emit('stats:kill', { total: state.stats.totalKills });
}

/** 일일 목표 보상 수령 — 검증은 systems/quests.js가 한다. */
export function claimDailyQuest(id, jade) {
  const daily = ensureDaily();
  if (daily.claimed.includes(id)) return false;
  daily.claimed.push(id);
  addJade(jade);
  emit('quest:claim', { id, jade });
  return true;
}

/** 업적 보상 수령 — 검증은 systems/quests.js가 한다. */
export function claimAchievement(id, jade) {
  if (state.achievements.claimed.includes(id)) return false;
  state.achievements.claimed.push(id);
  addJade(jade);
  emit('quest:claim', { id, jade });
  return true;
}

/** 오늘의 현상수배 완수 — 대상 판정은 systems/quests.js가 한다. */
export function claimBounty(jade) {
  const daily = ensureDaily();
  if (daily.bountyDone) return false;
  daily.bountyDone = true;
  addJade(jade);
  emit('bounty:done', { jade });
  return true;
}

// ── 열전·숙련·군령 ────────────────────────────────────

/** 열전 첫 열람 — 옥구슬과 함께 인연이 영구히 깊어진다. */
export function readTale(id, jade) {
  state.tales = state.tales ?? { read: [] };
  if (state.tales.read.includes(id)) return false;
  state.tales.read.push(id);
  addJade(jade);
  emit('tale:read', { id, jade });
  return true;
}

/** 인연을 발동한 채 우두머리를 꺾음 — 숙련이 쌓인다. */
export function bumpBondMastery(bondId) {
  state.bondsMastery = state.bondsMastery ?? {};
  state.bondsMastery[bondId] = (state.bondsMastery[bondId] ?? 0) + 1;
  emit('bond:mastery', { bondId, bossKills: state.bondsMastery[bondId] });
}

/** 세력 군령 발동/해제 — 해금 검증은 systems/orders.js가 한다. */
export function setOrder(orderId) {
  state.orders = state.orders ?? { active: null };
  state.orders.active = orderId;
  emit('order:set', { orderId });
}

// ── 설정 ──────────────────────────────────────────────

export function setSetting(key, value) {
  state.settings[key] = value;
  emit('setting', { key, value });
}

// ── 강화 ──────────────────────────────────────────────

/** 공격 연마 — 비용 계산은 systems/upgrades.js가 담당한다. */
export function purchaseAtkUpgrade(cost) {
  if (!spendCoin(cost)) return false;
  state.upgrades.atk += 1;
  emit('upgrade:atk', { level: state.upgrades.atk });
  return true;
}

// ── 모집 ──────────────────────────────────────────────

export function bumpPity(gotLegend) {
  state.gacha.total += 1;
  state.gacha.pity = gotLegend ? 0 : state.gacha.pity + 1;
  ensureDaily().pulls += 1;
  emit('gacha:pity', { pity: state.gacha.pity });
}
