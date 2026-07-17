// 목표 — 일일 목표와 업적. 순수 데이터 (로직 없음)
// 일일 목표 type: kill(오늘 처치) · pull(오늘 모집) · clear(오늘 돌파)
// 업적 type: totalKills · totalClears · totalPulls · owned(도감 보유 수)

export const DAILY_QUESTS = [
  { id: 'd-kill-100', name: '적 100 무찌르기',  type: 'kill',  goal: 100, reward: { jade: 80 } },
  { id: 'd-pull-1',   name: '장수 모집 1회',    type: 'pull',  goal: 1,   reward: { jade: 40 } },
  { id: 'd-clear-1',  name: '전장 1곳 돌파',    type: 'clear', goal: 1,   reward: { jade: 40 } },
];

export const ACHIEVEMENTS = [
  { id: 'a-kill-500',   name: '이름을 알리다',     blurb: '적 500 무찌르기',    type: 'totalKills',  goal: 500,   reward: { jade: 160 } },
  { id: 'a-kill-5000',  name: '전장의 공포',       blurb: '적 5000 무찌르기',   type: 'totalKills',  goal: 5000,  reward: { jade: 480 } },
  { id: 'a-clear-10',   name: '첫 장의 끝',        blurb: '전장 10곳 돌파',     type: 'totalClears', goal: 10,    reward: { jade: 320 } },
  { id: 'a-clear-30',   name: '천하를 반쯤',       blurb: '전장 30곳 돌파',     type: 'totalClears', goal: 30,    reward: { jade: 640 } },
  { id: 'a-pull-60',    name: '사람 보는 눈',      blurb: '누적 모집 60회',     type: 'totalPulls',  goal: 60,    reward: { jade: 320 } },
  { id: 'a-own-10',     name: '휘하 열 장수',      blurb: '장수 10명 모으기',   type: 'owned',       goal: 10,    reward: { jade: 320 } },
  { id: 'a-own-24',     name: '도감 완성',         blurb: '모든 장수 모으기',   type: 'owned',       goal: 24,    reward: { jade: 1600 } },
];
