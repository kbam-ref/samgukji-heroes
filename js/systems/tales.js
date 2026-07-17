// 열전 — 인연 완성으로 열리는 이야기와 보상. DOM 접근 없음.

import { TALES } from '../data/tales.js';
import { BONDS } from '../data/bonds.js';
import { BALANCE } from '../data/balance.js';
import * as state from '../core/state.js';

/** 화면용 목록 — [{ tale, bond, unlocked, read }] */
export function taleList(s = state.getState()) {
  return TALES.map((tale) => {
    const bond = BONDS.find((b) => b.id === tale.bondId);
    const unlocked = Boolean(bond && bond.heroes.every((id) => s.heroes[id]));
    const read = (s.tales?.read ?? []).includes(tale.id);
    return { tale, bond, unlocked, read };
  });
}

/** 읽을 수 있는데 아직 안 읽은 열전이 있는가 (배지용) */
export function hasUnreadTale(s = state.getState()) {
  return taleList(s).some((e) => e.unlocked && !e.read);
}

/** 첫 열람 보상. 이미 읽었거나 잠겨 있으면 0 */
export function finishTale(taleId) {
  const s = state.getState();
  const entry = taleList(s).find((e) => e.tale.id === taleId);
  if (!entry || !entry.unlocked || entry.read) return 0;
  return state.readTale(taleId, BALANCE.tales.jade) ? BALANCE.tales.jade : 0;
}
