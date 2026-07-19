// 성장 계산 — 전투력, 단련 비용, 도감 보너스. DOM 접근 없음.

import { HEROES } from '../data/heroes.js';
import { BONDS } from '../data/bonds.js';
import { TALES } from '../data/tales.js';
import { BALANCE } from '../data/balance.js';
import { gearBonus } from './gear.js';

const TALE_BY_BOND = new Map(TALES.map((t) => [t.bondId, t]));

const byId = new Map(HEROES.map((h) => [h.id, h]));

export function heroDef(id) {
  return byId.get(id);
}

/** 개별 영웅의 전투력 (레벨·별 반영, 도감 보너스 제외) */
export function heroPower(id, heroState) {
  const def = byId.get(id);
  if (!def || !heroState) return 0;
  const g = BALANCE.growth;
  const levelMult = 1 + g.powerPerLevel * (heroState.level - 1);
  const starMult = g.starMultiplier[heroState.stars - 1] ?? 1;
  return Math.round(def.base * levelMult * starMult);
}

/** 세력 전원을 모은 세력 수 */
export function factionSetsCompleted(state) {
  const totals = new Map();
  const owned = new Map();
  for (const hero of HEROES) {
    totals.set(hero.faction, (totals.get(hero.faction) ?? 0) + 1);
    if (state.heroes[hero.id]) owned.set(hero.faction, (owned.get(hero.faction) ?? 0) + 1);
  }
  let sets = 0;
  for (const [faction, total] of totals) {
    if ((owned.get(faction) ?? 0) === total) sets += 1;
  }
  return sets;
}

/** 도감 보너스 — 보유 영웅 수 비례 + 세력 세트 완성 보너스 */
export function collectionBonus(state) {
  const g = BALANCE.growth;
  const owned = Object.keys(state.heroes).length;
  return owned * g.collectionBonusPerHero + factionSetsCompleted(state) * g.factionSetBonus;
}

/** 임의 편성(ids)으로 발동하는 인연들 */
export function activeBondsFor(partyIds) {
  const set = new Set(partyIds);
  return BONDS.filter((bond) => bond.heroes.every((id) => set.has(id)));
}

/** 지금 편성으로 발동 중인 인연들 */
export function activeBonds(state) {
  return activeBondsFor(state.party);
}

/** 임의 편성(ids)의 인연 보너스 합 — 최강 편성 탐색용 */
export function bondBonusFor(state, partyIds) {
  return activeBondsFor(partyIds).reduce((sum, bond) => sum + effectiveBondBonus(state, bond), 0);
}

/** 인연 하나의 실효 보너스 — 기본 + 열전(+1%p) + 숙련(우두머리 격파 단계) */
export function effectiveBondBonus(state, bond) {
  let bonus = bond.bonus;
  const tale = TALE_BY_BOND.get(bond.id);
  if (tale && (state.tales?.read ?? []).includes(tale.id)) {
    bonus += BALANCE.tales.bondBonusAdd;
  }
  const bossKills = state.bondsMastery?.[bond.id] ?? 0;
  for (const tier of BALANCE.bondMastery.tiers) {
    if (bossKills >= tier.bossKills) bonus += tier.bonusAdd;
  }
  return bonus;
}

/** 인연 보너스 합 (파티 전투력 배율 가산) */
export function bondBonus(state) {
  return activeBonds(state).reduce((sum, bond) => sum + effectiveBondBonus(state, bond), 0);
}

/** 출전 편성 전체 전투력 (도감·인연·무기 보너스 포함) */
export function partyPower(state) {
  let sum = 0;
  for (const id of state.party) {
    sum += heroPower(id, state.heroes[id]);
  }
  return Math.round(
    sum * (1 + collectionBonus(state)) * (1 + bondBonus(state)) * (1 + gearBonus(state, 'power'))
  );
}

/** 현재 레벨에서 다음 레벨로 가는 단련 비용(엽전) */
export function levelCost(level) {
  const g = BALANCE.growth;
  return Math.round(g.levelCostBase * Math.pow(g.levelCostGrowth, level - 1));
}

export const MAX_STARS = BALANCE.growth.starMultiplier.length;

/** 다음 별로 가는 승급에 필요한 겹침 수 (최고 별이면 Infinity) */
export function starUpCost(stars) {
  return BALANCE.growth.starDupeCost[stars - 1] ?? Infinity;
}

/** 지금 당장 승급 가능한 장수가 있는가 — 영웅 탭 알림 점(2-10) 판정 (DOM 없음) */
export function canStarUpAny(state) {
  return Object.entries(state.heroes).some(([id, hs]) => {
    if (!byId.has(id)) return false;
    return hs.stars < MAX_STARS && hs.dupes >= starUpCost(hs.stars);
  });
}

/** 인연(도감·열전·숙련 무관, 파티 무관)을 뺀 원시 개별 전투력 상위 정렬 */
function ownedByPower(state) {
  return Object.keys(state.heroes)
    .filter((id) => byId.has(id))
    .sort((a, b) => heroPower(b, state.heroes[b]) - heroPower(a, state.heroes[a]));
}

/** 인연 배율까지 반영한 진짜 최강 5인 편성 — C(보유,5) 전탐색 (수 ms).
 *  도감·무기 보너스는 파티 무관 상수라 비교식에서 생략(모든 후보에 동일 배율). */
export function bestParty(state) {
  const ids = ownedByPower(state);
  if (ids.length <= 5) return ids.slice();

  // 후보를 상위 전투력 순으로 자르면 최적을 놓칠 수 있으나(인연), 전탐색이므로 전체를 쓴다.
  const powerOf = (id) => heroPower(id, state.heroes[id]);
  let best = null;
  let bestScore = -1;
  const n = ids.length;
  const pick = [0, 0, 0, 0, 0];
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            pick[0] = ids[a]; pick[1] = ids[b]; pick[2] = ids[c]; pick[3] = ids[d]; pick[4] = ids[e];
            const raw = powerOf(pick[0]) + powerOf(pick[1]) + powerOf(pick[2]) + powerOf(pick[3]) + powerOf(pick[4]);
            const score = raw * (1 + bondBonusFor(state, pick));
            if (score > bestScore) {
              bestScore = score;
              best = pick.slice();
            }
          }
  return best ?? ids.slice(0, 5);
}
