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

/** 지금 편성으로 발동 중인 인연들 */
export function activeBonds(state) {
  return BONDS.filter((bond) => bond.heroes.every((id) => state.party.includes(id)));
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
