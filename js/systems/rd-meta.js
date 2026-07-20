// 랜덤 디펜스 메타 — 순수 아케이드(2026-07-20 수석 확정).
// 옥구슬·도전권·영구성장 제거. 판을 넘어 이월되는 유일한 것은 '최고 라운드' 기록뿐(localStorage).
// 지면 즉시 무제한 재도전 — 매 판 순수 실력 승부.

const KEY = 'samgukji-rd-meta';

function fresh() {
  return { v: 2, bestStage: 0, bestSec: 0 };
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

/** 판이 끝나면 최고 기록을 갱신한다. 신기록(라운드)이면 true. */
export function recordRun(reachedStage, sec, won) {
  const m = load();
  let newBest = false;
  if (reachedStage > m.bestStage) { m.bestStage = reachedStage; newBest = true; }
  if (won && sec && (!m.bestSec || sec < m.bestSec)) m.bestSec = sec;
  save();
  return newBest;
}

/** 최고 기록 { stage, sec } */
export function best() {
  const m = load();
  return { stage: m.bestStage, sec: m.bestSec };
}
