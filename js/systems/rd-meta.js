// 랜덤 디펜스 메타 — 최고 기록 + 도전 횟수(수익화, 2026-07-20 수석 지시).
// 도전 = 한 판(라운드1부터). 시작/다시시작마다 도전 1 소모. 저장된 판 이어서는 소모 없음.
// 가입 보너스 10 + 하루 무료 5. 초과분은 충전(인앱결제 — 웹 빌드에선 테스트 스텁 grantPaid).

import { emit } from '../core/events.js';

const KEY = 'samgukji-rd-meta';
const DAILY_FREE = 5;    // 하루 무료 도전
const SIGNUP_BONUS = 10; // 가입 시 1회성 무료 도전

function todayStr() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (기기 현지)
}
function fresh() {
  return { v: 3, bestStage: 0, bestSec: 0, day: '', freeUsedToday: 0, bonus: SIGNUP_BONUS, paid: 0 };
}
let meta = null;
function load() {
  if (meta) return meta;
  try {
    const raw = localStorage.getItem(KEY);
    meta = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
  } catch {
    meta = fresh();
  }
  return meta;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* private mode 등 */ }
}
function ensureDay(m) {
  const d = todayStr();
  if (m.day !== d) { m.day = d; m.freeUsedToday = 0; save(); }
  return m;
}

// ── 도전 횟수 ──
export function playsLeft() {
  const m = ensureDay(load());
  return Math.max(0, DAILY_FREE - m.freeUsedToday) + (m.bonus || 0) + (m.paid || 0);
}
/** 세부 내역 { freeLeft, bonus, paid, dailyFree } — UI 표기용 */
export function playsInfo() {
  const m = ensureDay(load());
  return { freeLeft: Math.max(0, DAILY_FREE - m.freeUsedToday), bonus: m.bonus || 0, paid: m.paid || 0, dailyFree: DAILY_FREE };
}
/** 도전 1 소모. 무료(하루분)→보너스→결제분 순. 남은 게 없으면 false. */
export function consumePlay() {
  const m = ensureDay(load());
  if (Math.max(0, DAILY_FREE - m.freeUsedToday) > 0) m.freeUsedToday += 1;
  else if ((m.bonus || 0) > 0) m.bonus -= 1;
  else if ((m.paid || 0) > 0) m.paid -= 1;
  else return false;
  save();
  emit('rd:plays', { left: playsLeft() });
  return true;
}
/** 인앱결제 성공 시 결제분 충전 (실결제 연동 전까지 테스트용) */
export function grantPaid(n) {
  const m = load();
  m.paid = (m.paid || 0) + n;
  save();
  emit('rd:plays', { left: playsLeft() });
}

// ── 최고 기록 ──
export function recordRun(reachedStage, sec, won) {
  const m = load();
  let newBest = false;
  if (reachedStage > m.bestStage) { m.bestStage = reachedStage; newBest = true; }
  if (won && sec && (!m.bestSec || sec < m.bestSec)) m.bestSec = sec;
  save();
  return newBest;
}
export function best() {
  const m = load();
  return { stage: m.bestStage, sec: m.bestSec };
}
