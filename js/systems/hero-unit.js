// 아군 유닛 — 편성 전원이 전장에 선다. DOM 접근 없음.
// 파티 총 초당 피해는 전투력에서 파생되고, 각 유닛은 자기 전투력 몫만큼 때린다.

import { getState } from '../core/state.js';
import { heroDef, heroPower, partyPower, collectionBonus, bondBonus } from './growth.js';
import { atkUpgradeLevel } from './upgrades.js';
import { BALANCE } from '../data/balance.js';

/** 연마 이전의 기본 초당 피해 */
function baseDps() {
  return Math.max(1, Math.round(partyPower(getState()) * BALANCE.heroUnit.atkPerPower));
}

/** 연마 1회가 지금 주는 증가량 — 기본 화력의 5%, 최소 5 */
export function atkPerUpgrade() {
  const U = BALANCE.upgrades.atk;
  return Math.max(U.minPerLevel, Math.round(baseDps() * U.pctPerLevel));
}

/** 파티 전체의 초당 총 피해 — 기본 화력 + 연마 (즉시 반영) */
export function totalDps() {
  return baseDps() + atkUpgradeLevel() * atkPerUpgrade();
}

/** 유닛 최대 체력 — 돌파 판정과 같은 배율(도감·인연)을 체력에도 적용해 표기와 생존을 일치시킨다 */
export function unitMaxHp(heroId, s = getState()) {
  const heroState = s?.heroes?.[heroId];
  if (!heroState) return 1;
  const mult = (1 + collectionBonus(s)) * (1 + bondBonus(s));
  return Math.max(1, Math.round(heroPower(heroId, heroState) * mult * BALANCE.heroUnit.hpPerPower));
}

export function createHeroUnit(heroId) {
  const s = getState();
  const def = heroDef(heroId);
  const heroState = s?.heroes?.[heroId];
  if (!def || !heroState) return null;
  const U = BALANCE.heroUnit;
  const maxHp = unitMaxHp(heroId, s);
  return {
    id: def.id,
    name: def.name,
    faction: def.faction,
    maxHp,
    hp: maxHp,
    attackSpeed: U.attackSpeed, // 초당 공격 횟수
    charge: 0,                  // 다음 공격까지의 누적
  };
}

export function hpRatio(unit) {
  return unit && unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
}
