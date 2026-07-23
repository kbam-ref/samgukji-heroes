// 캠페인 — 30라운드를 6장(章)으로 묶는다. 순수 데이터(로직은 chapterOf 헬퍼뿐).
// 헌장(CLAUDE.md #2): 스테이지는 황건적의 난 → 적벽대전, 실제 사건 순서로 진행감을 부여한다.
// 보스(적장)는 연의의 실존 인물 중 '아군 장수 24인'과 겹치지 않는 자로만 골랐다:
//   장각·이각·우길·순우경·좌자·채모 — 전원 로스터 밖, 시대순 배치.
// sprite: zhangjiao / boss-general / boss-warlock (assets/models·enemies-cut의 id)
// foes: 장별 적 병종 풀(enemies-cut id) — 라운드마다 풀 안에서 순환
// arenas: 장별 전장 바닥(assets/bg) — 장 분위기와 일치

export const CAMPAIGN = [
  {
    ch: 1, from: 1, to: 5,
    name: '황건적의 난',
    intro: '창천은 이미 죽었다 — 누런 두건의 무리가 들판을 뒤덮는다',
    arenas: ['arena-plain', 'arena-grass'],
    foes: ['yellow-turban', 'bandit-archer'],
    boss: { sprite: 'zhangjiao', name: '장각', title: '태평도 대현량사' },
  },
  {
    ch: 2, from: 6, to: 10,
    name: '동탁 토벌전',
    intro: '낙양이 불탄다 — 서량의 군대가 관문을 걸어 잠갔다',
    arenas: ['arena-ash', 'arena-camp'],
    foes: ['dong-soldier', 'halberdier', 'axe-raider'],
    boss: { sprite: 'boss-general', name: '이각', title: '서량의 사나운 이리' },
  },
  {
    ch: 3, from: 11, to: 15,
    name: '강동 평정',
    intro: '장강의 물길을 따라 — 강동 여든한 고을이 들끓는다',
    arenas: ['arena-jade', 'arena-grass'],
    foes: ['wu-soldier', 'twin-blade', 'bandit-archer'],
    boss: { sprite: 'boss-warlock', name: '우길', title: '강동을 홀린 도인' },
  },
  {
    ch: 4, from: 16, to: 20,
    name: '관도대전',
    intro: '하북 칠십만 대군 — 깃발이 지평선을 가린다',
    arenas: ['arena-sand', 'arena-stone'],
    foes: ['yuan-soldier', 'flag-bearer', 'crossbowman'],
    boss: { sprite: 'boss-general', name: '순우경', title: '오소의 파수꾼' },
  },
  {
    ch: 5, from: 21, to: 25,
    name: '형주 남정',
    intro: '백만 대군이 남으로 — 형주의 물안개가 피비린내를 머금는다',
    arenas: ['arena-marsh', 'arena-camp'],
    foes: ['warlord-soldier', 'spear-guard', 'shield-brute'],
    boss: { sprite: 'boss-warlock', name: '좌자', title: '승상을 희롱한 방사' },
  },
  {
    ch: 6, from: 26, to: 30,
    name: '적벽대전',
    intro: '동남풍이 분다 — 장강 위 십만 함대에 불길이 번진다',
    arenas: ['arena-crimson', 'arena-ash'],
    foes: ['spear-guard', 'crossbowman', 'shield-brute', 'flag-bearer'],
    boss: { sprite: 'boss-general', name: '채모', title: '조조군 수군 도독' },
  },
];

/** 라운드 → 장(章). 범위 밖(31+ 또는 0)은 마지막 장으로 흡수(안전). */
export function chapterOf(stage) {
  for (const c of CAMPAIGN) if (stage >= c.from && stage <= c.to) return c;
  return stage < 1 ? CAMPAIGN[0] : CAMPAIGN[CAMPAIGN.length - 1];
}

/** 이 라운드가 장의 첫 라운드인가 — 장 배너 연출 트리거용. */
export function isChapterStart(stage) {
  return CAMPAIGN.some((c) => c.from === stage);
}
