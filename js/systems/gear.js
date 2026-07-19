// 보물(장비) — 레벨·별과 병렬인 세 번째 성장축. DOM 접근 없음.
// 무기=전투력, 갑옷=체력, 군마=공격 속도, 병법서=엽전. 강화석으로 강화한다.

import { BALANCE } from '../data/balance.js';

export function gearLevel(s, slotId) {
  return s.gear?.[slotId] ?? 0;
}

/** 해당 효과(effect)의 보너스 비율 합 (0.06 = +6%) */
export function gearBonus(s, effect) {
  let sum = 0;
  for (const slot of BALANCE.gear.slots) {
    if (slot.effect === effect) sum += gearLevel(s, slot.id) * slot.perLevel;
  }
  return sum;
}

/** level → level+1 강화 비용(강화석) */
export function upgradeCost(level) {
  const G = BALANCE.gear;
  return Math.round(G.costBase * Math.pow(G.costGrowth, level));
}
