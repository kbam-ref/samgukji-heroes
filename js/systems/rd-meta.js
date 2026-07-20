// 랜덤 디펜스 메타 — 도전 티켓·영구 성장·최고 기록. 런과 별개로 영구 저장(localStorage).
// 재화(옥구슬 jade)는 core/state.js가 소유(상단 바)이므로 여기선 그걸 쓴다.

import { DEFENSE } from '../data/defense.js';
import { getState, addJade, spendJade } from '../core/state.js';
import { emit } from '../core/events.js';

const KEY = 'samgukji-rd-meta';

function fresh() {
  return {
    v: 1,
    tickets: DEFENSE.tickets.start,
    lastRefill: Date.now(),
    perm: { startGoldBonus: 0, globalDmgPercent: 0, extraOpeningPulls: 0 },
    bestStage: 0,
    bestSec: 0,
    clear50: false,
  };
}
let meta = null;
function load() {
  if (meta) return meta;
  try {
    const raw = localStorage.getItem(KEY);
    meta = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
    if (!meta.perm) meta.perm = fresh().perm;
  } catch { meta = fresh(); }
  return meta;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* private mode */ }
}

// ── 티켓 (시간 회복) ──
function applyRefill() {
  const m = load();
  const t = DEFENSE.tickets;
  if (m.tickets >= t.max) { m.lastRefill = Date.now(); return; }
  const per = t.refillMinutes * 60 * 1000;
  const gained = Math.floor((Date.now() - (m.lastRefill || Date.now())) / per);
  if (gained > 0) {
    m.tickets = Math.min(t.max, m.tickets + gained);
    m.lastRefill = m.tickets >= t.max ? Date.now() : (m.lastRefill || Date.now()) + gained * per;
    save();
  }
}
export function tickets() { applyRefill(); return load().tickets; }
export function ticketMax() { return DEFENSE.tickets.max; }
export function refillMsLeft() {
  applyRefill();
  const m = load();
  if (m.tickets >= DEFENSE.tickets.max) return 0;
  const per = DEFENSE.tickets.refillMinutes * 60 * 1000;
  return per - ((Date.now() - m.lastRefill) % per);
}
export function consumeTicket() {
  applyRefill();
  const m = load();
  if (m.tickets <= 0) return false;
  if (m.tickets >= DEFENSE.tickets.max) m.lastRefill = Date.now(); // 가득 → 지금부터 회복 타이머
  m.tickets -= 1;
  save();
  emit('rd:meta', {});
  return true;
}
export function rechargeTicket() {
  const m = load();
  if (m.tickets >= DEFENSE.tickets.max) return false;
  if (!spendJade(DEFENSE.tickets.rechargeJade)) return false;
  m.tickets = Math.min(DEFENSE.tickets.max, m.tickets + 1);
  save();
  emit('rd:meta', {});
  return true;
}

// ── 영구 성장 (옥구슬로 구매) ──
export const PERM_KEYS = ['startGoldBonus', 'globalDmgPercent', 'extraOpeningPulls'];
export const PERM_LABEL = {
  startGoldBonus: '시작 골드',
  globalDmgPercent: '전 유닛 데미지',
  extraOpeningPulls: '오프닝 소환',
};
export function permLevel(k) { return load().perm[k] || 0; }
export function permMaxed(k) { return permLevel(k) >= DEFENSE.permanent[k].max; }
export function permCost(k) { return DEFENSE.permanent[k].costJade * (permLevel(k) + 1); }
export function permEffectText(k) {
  const cfg = DEFENSE.permanent[k];
  const lv = permLevel(k);
  if (k === 'globalDmgPercent') return `+${lv * cfg.per}%`;
  if (k === 'startGoldBonus') return `+${lv * cfg.per}`;
  return `+${lv * cfg.per}회`;
}
export function buyPerm(k) {
  if (permMaxed(k) || !spendJade(permCost(k))) return false;
  const m = load();
  m.perm[k] = (m.perm[k] || 0) + 1;
  save();
  emit('rd:meta', {});
  return true;
}
export function permBonuses() {
  const m = load();
  const p = DEFENSE.permanent;
  return {
    startGold: (m.perm.startGoldBonus || 0) * p.startGoldBonus.per,
    dmgMult: 1 + ((m.perm.globalDmgPercent || 0) * p.globalDmgPercent.per) / 100,
    openingPulls: (m.perm.extraOpeningPulls || 0) * p.extraOpeningPulls.per,
  };
}

// ── 기록·보상(옥구슬 획득처) ──
export function bossClearReward() {
  addJade(DEFENSE.jadeFaucet.bossStageClear);
  return DEFENSE.jadeFaucet.bossStageClear;
}
export function recordRun(reachedStage, sec, won) {
  const m = load();
  const f = DEFENSE.jadeFaucet;
  const finalStage = won ? (DEFENSE.buildCap ?? DEFENSE.stages) : reachedStage;
  let reward = 0;
  if (finalStage > m.bestStage) { m.bestStage = finalStage; reward += f.bestRecord; }
  if (won) {
    if (!m.clear50) { m.clear50 = true; reward += f.firstClear50; }
    if (sec && (!m.bestSec || sec < m.bestSec)) m.bestSec = sec;
  }
  save();
  if (reward) addJade(reward);
  return reward;
}
export function best() { const m = load(); return { stage: m.bestStage, sec: m.bestSec }; }
export function jade() { return getState().resources.jade; }
