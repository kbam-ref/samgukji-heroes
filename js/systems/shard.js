// 명성 조각 — 최대 승급 장수의 남는 겹침을 조각으로 방출하고, 조각으로 원하는 장수를 지정 교환한다.
// 천장의 상위 호환: 미보유 전설도 "언젠가 반드시" 얻을 수 있는 장기 목표. DOM 접근 없음.

import { BALANCE } from '../data/balance.js';
import { HEROES } from '../data/heroes.js';
import { MAX_STARS, starUpCost } from './growth.js';
import * as state from '../core/state.js';

const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));

/** 방출 대상 — 별이 최대이고 겹침이 남은 장수들. [{ id, dupes, shards }] */
export function releasePreview(s = state.getState()) {
  const list = [];
  for (const [id, hs] of Object.entries(s.heroes)) {
    const def = HERO_BY_ID[id];
    if (!def || hs.stars < MAX_STARS || hs.dupes <= 0) continue;
    list.push({ id, dupes: hs.dupes, shards: hs.dupes * BALANCE.shard.valueByRarity[def.rarity] });
  }
  return list;
}

/** 방출 실행 — 얻은 조각 총량 (없으면 0) */
export function releaseAll() {
  const preview = releasePreview();
  let total = 0;
  for (const entry of preview) {
    if (state.clearDupes(entry.id)) total += entry.shards;
  }
  if (total > 0) state.addShard(total);
  return total;
}

export function exchangeCost(heroId) {
  const def = HERO_BY_ID[heroId];
  return def ? BALANCE.shard.costByRarity[def.rarity] : Infinity;
}

/** 지정 교환 — 조각으로 원하는 장수를 데려온다 (보유 중이면 겹침 +1) */
export function exchange(heroId) {
  const cost = exchangeCost(heroId);
  if (!state.spendShard(cost)) return null;
  return state.grantHero(heroId);
}

// 참고: 승급에 겹침이 얼마나 더 필요할지는 starUpCost가 안다 — UI 안내용으로 재노출
export { starUpCost };
