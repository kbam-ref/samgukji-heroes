// 모집(뽑기) — 확률표와 천장. DOM 접근 없음.

import { GACHA_RATES } from '../data/gacha-tables.js';
import { HEROES } from '../data/heroes.js';
import { BALANCE } from '../data/balance.js';
import * as state from '../core/state.js';

const pools = new Map();
for (const hero of HEROES) {
  if (!pools.has(hero.rarity)) pools.set(hero.rarity, []);
  pools.get(hero.rarity).push(hero);
}

function rollRarity(pity) {
  if (pity + 1 >= BALANCE.gacha.pityLegend) return 5; // 천장 — 전설 확정
  const roll = Math.random();
  let acc = 0;
  for (const entry of GACHA_RATES) {
    acc += entry.rate;
    if (roll < acc) return entry.rarity;
  }
  return 1;
}

export function pullCost(count) {
  return count === 10 ? BALANCE.gacha.costTen : BALANCE.gacha.costSingle * count;
}

export function pityRemaining(s) {
  return BALANCE.gacha.pityLegend - s.gacha.pity;
}

function rollOnce() {
  const rarity = rollRarity(state.getState().gacha.pity);
  state.bumpPity(rarity === 5);
  const pool = pools.get(rarity);
  const hero = pool[Math.floor(Math.random() * pool.length)];
  const { dupe } = state.grantHero(hero.id);
  return { hero, dupe };
}

/**
 * count회 모집. 옥구슬이 모자라면 null.
 * 반환: [{ hero, dupe }]
 */
export function pull(count) {
  if (!state.spendJade(pullCost(count))) return null;
  return Array.from({ length: count }, rollOnce);
}

/** 오늘의 무료 모집 1회 — 이미 썼으면 null */
export function pullFree() {
  if (state.freePullUsed()) return null;
  state.markFreePull();
  return [rollOnce()];
}

export function freePullAvailable() {
  return !state.freePullUsed();
}
