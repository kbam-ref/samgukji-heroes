// 과업 — 판 안에서 순차로 걸리는 소목표 사슬(헌장 #5 '겹치는 목표': 다음 라운드보다 가까운 목표를 항상 하나 더).
// 순수 데이터. stat은 run의 단조증가 카운터(kills·summons·merges·upgrades·stage)만 쓴다 — 검사는 counter >= target 뿐.
// 보상 골드는 경제를 흔들지 않는 소액(소환 1~5회분). 사슬 순서는 자연스러운 플레이 흐름을 따라간다.

export const MISSIONS = [
  { id: 'summon5',   text: '장수 5명 소환',        stat: 'summons',  target: 5,    gold: 40 },
  { id: 'kill50',    text: '적병 50 처치',         stat: 'kills',    target: 50,   gold: 60 },
  { id: 'upgrade3',  text: '단련 3회',             stat: 'upgrades', target: 3,    gold: 60 },
  { id: 'stage3',    text: '3라운드 도달',         stat: 'stage',    target: 3,    gold: 80 },
  { id: 'merge1',    text: '합성 1회',             stat: 'merges',   target: 1,    gold: 90 },
  { id: 'kill250',   text: '적병 250 처치',        stat: 'kills',    target: 250,  gold: 90 },
  { id: 'stage6',    text: '동탁 토벌전 진입(6R)', stat: 'stage',    target: 6,    gold: 100 },
  { id: 'summon15',  text: '장수 15명 소환',       stat: 'summons',  target: 15,   gold: 100 },
  { id: 'merge3',    text: '합성 3회',             stat: 'merges',   target: 3,    gold: 120 },
  { id: 'kill600',   text: '적병 600 처치',        stat: 'kills',    target: 600,  gold: 130 },
  { id: 'stage11',   text: '강동 평정 진입(11R)',  stat: 'stage',    target: 11,   gold: 150 },
  { id: 'upgrade15', text: '단련 15회',            stat: 'upgrades', target: 15,   gold: 150 },
  { id: 'kill1200',  text: '적병 1200 처치',       stat: 'kills',    target: 1200, gold: 180 },
  { id: 'stage16',   text: '관도대전 진입(16R)',   stat: 'stage',    target: 16,   gold: 200 },
  { id: 'merge7',    text: '합성 7회',             stat: 'merges',   target: 7,    gold: 220 },
  { id: 'kill2000',  text: '적병 2000 처치',       stat: 'kills',    target: 2000, gold: 250 },
  { id: 'stage21',   text: '형주 남정 진입(21R)',  stat: 'stage',    target: 21,   gold: 280 },
  { id: 'kill3000',  text: '적병 3000 처치',       stat: 'kills',    target: 3000, gold: 300 },
  { id: 'stage26',   text: '적벽대전 진입(26R)',   stat: 'stage',    target: 26,   gold: 350 },
];

/** 현재 과업의 진행값 — stage는 도달형, 나머지는 누적 카운터. */
export function missionStat(run, m) {
  if (!m) return 0;
  return m.stat === 'stage' ? (run.stage || 1) : (run[m.stat] || 0);
}
