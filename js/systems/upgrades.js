// 강화 — 공격 연마. 비용 곡선과 구매. DOM 접근 없음.
// 다음 비용 = round(baseCost × costGrowth^연마횟수)  →  20, 25, 31, 39, 49, …
// 효과 계산(회당 +max(5, 기본 화력의 5%))은 hero-unit.js의 atkPerUpgrade가 담당한다.

import { BALANCE } from '../data/balance.js';
import * as state from '../core/state.js';

export function atkUpgradeLevel(s = state.getState()) {
  return s?.upgrades?.atk ?? 0;
}

export function atkUpgradeCost(level = atkUpgradeLevel()) {
  const U = BALANCE.upgrades.atk;
  return Math.round(U.baseCost * Math.pow(U.costGrowth, level));
}

/** 연마 구매. 성공 시 { cost }, 엽전이 모자라면 null. */
export function buyAtkUpgrade() {
  const cost = atkUpgradeCost();
  return state.purchaseAtkUpgrade(cost) ? { cost } : null;
}
