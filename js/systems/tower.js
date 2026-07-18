// 시련의 탑 — 전장에서 벽에 막혔을 때의 "다른 할 일". DOM 접근 없음.
// 파티 전투력으로 오를 수 있는 층까지 단숨에 오르고, 신기록 층수만큼 옥구슬을 받는다.

import { BALANCE } from '../data/balance.js';
import { partyPower } from './growth.js';
import * as state from '../core/state.js';

/** floor층에 필요한 전투력 */
export function floorPower(floor) {
  const T = BALANCE.tower;
  return Math.round(T.basePower * Math.pow(T.growth, floor - 1));
}

export function bestFloor(s = state.getState()) {
  return s.records?.bestTower ?? 0;
}

export function triesLeft() {
  return state.towerTriesLeft();
}

/**
 * 도전 — 최고 기록 다음 층부터 이길 수 있는 데까지 오른다.
 * 반환: { from, to, jade, nextNeed } / 남은 도전이 없으면 null
 */
export function climb() {
  if (state.towerTriesLeft() <= 0) return null;
  const s = state.getState();
  const power = partyPower(s);
  const from = bestFloor(s);
  let to = from;
  while (power >= floorPower(to + 1) && to - from < 500) to += 1;
  const jade = (to - from) * BALANCE.tower.jadePerFloor;
  state.recordTowerClimb(to, jade);
  return { from, to, jade, nextNeed: floorPower(to + 1) };
}
