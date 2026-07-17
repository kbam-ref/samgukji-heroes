// 적 유닛 — 재사용 가능한 기본 적. DOM 접근 없음.
// 체력은 호출 쪽(battle.js)이 전장 데이터로 계산해 넘긴다.
// 등장할 때마다 새 객체를 만들므로 이전 적의 체력이 남을 수 없다.

import { BALANCE } from '../data/balance.js';

export function createEnemyUnit({ name = '적병', boss = false, maxHp }) {
  const hp = Math.max(1, Math.round(maxHp));
  return {
    name,
    boss,
    maxHp: hp,
    hp,
    atk: BALANCE.enemyUnit.atk, // 아직 사용하지 않음 — 반격은 다음 단계
  };
}

/** 피해를 입힌다. 쓰러졌으면 true. */
export function applyDamage(unit, amount) {
  if (!unit || unit.hp <= 0) return true; // 이미 쓰러진 적은 다시 때리지 않는다
  unit.hp = Math.max(0, unit.hp - amount);
  return unit.hp <= 0;
}
