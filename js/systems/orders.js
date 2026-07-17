// 세력 군령 — 세력 도감을 완성해야 내릴 수 있는 명령. DOM 접근 없음.

import { ORDERS } from '../data/orders.js';
import { HEROES } from '../data/heroes.js';
import * as state from '../core/state.js';

/** 해당 세력의 장수를 도감에서 전부 모았는가 */
export function isFactionComplete(s, faction) {
  return HEROES.filter((h) => h.faction === faction).every((h) => s.heroes[h.id]);
}

/** 화면용 목록 — [{ order, unlocked, active }] */
export function orderList(s = state.getState()) {
  return ORDERS.map((order) => ({
    order,
    unlocked: isFactionComplete(s, order.faction),
    active: s.orders?.active === order.id,
  }));
}

/** 군령 발동/해제. 해금 안 됐으면 false. 같은 군령을 다시 누르면 거둔다. */
export function toggleOrder(orderId) {
  const s = state.getState();
  if (s.orders?.active === orderId) {
    state.setOrder(null);
    return true;
  }
  const entry = orderList(s).find((e) => e.order.id === orderId);
  if (!entry || !entry.unlocked) return false;
  state.setOrder(orderId);
  return true;
}

/** 발동 중인 군령의 효과값 — 없으면 기본값 */
export function orderEffect(s, key, dflt = 1) {
  const active = ORDERS.find((o) => o.id === s?.orders?.active);
  return active?.effect?.[key] ?? dflt;
}
