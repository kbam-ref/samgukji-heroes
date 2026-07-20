// 삼국지 랜덤 디펜스 — 콘텐츠·밸런스 데이터 (순수 데이터, 로직 없음)
// 엔진(systems/defense.js)이 이 숫자만 읽어 돌아간다. 밸런스는 여기서만 만진다.
// 규칙: 골드로 랜덤 소환 → '같은 등급 3장 합성 → 상위 등급 랜덤 1장'(랜덤디펜스 정석: 메운디·랜덤인물)
//       + 골드 단련(개별 강화) + 반환(판매). 사거리 자동 공격. 상성 2축(물불땅 × 소중대).
//       총 50단계·단계당 적 100(총 5000). 살아있는 적 100 누적 시 게임오버 → 티켓 소모·1단계 리셋.
//       매 5단계 보스 2마리(처치당 무료 소환). 도전 티켓 + 옥구슬 영구성장으로 과금 유도.
// ※ 수치는 다중 LLM 밸런스 검증(2026-07-19) 반영. HP·데미지 곡선은 플레이테스트로 재조정.

import { HEROES } from './heroes.js';

export const DEFENSE = {
  // ── 필드 — 네모난 트랙(적이 도는 경로) + 안쪽 유닛 배치 칸 ──
  field: {
    path: [
      { x: 12, y: 22 },
      { x: 88, y: 22 },
      { x: 88, y: 78 },
      { x: 12, y: 78 },
    ],
    slots: 16, // 유닛 배치 칸 (검증: 12는 8단계에 소진 → 후반 성장축 부재. 16으로)
  },

  // ── 진행 — 총 50단계, 단계당 적 100 → 총 5000. 50 클리어 = 승리(단, 영구성장 전제) ──
  stages: 50,
  buildCap: 30, // 2026-07-20: 10→30 (수석 지시). 적/보스 스프라이트는 라운드마다 순환 배정이라 30까지 커버.
  // 2026-07-20: 시작 준비 15초 + 매 라운드 클리어 후 정비 20초(수석) — 적 나오기 전 소환·배치·단련 시간
  prep: { seconds: 15, betweenSeconds: 20 },

  wave: {
    perStage: 100, // 스테이지당 적 수 (일반 98 + 보스 스테이지엔 보스 2 포함, 아래 boss 참고)
    // 2026-07-20: 0.85→0.45(밀도 확보) → 0.55(수석 지시 "약간 늦춰"). 여전히 상시 교전이 유지되는 선에서
    //   적이 쏟아지는 속도를 살짝 완화(체감 여유). 난이도는 근소하게 쉬워짐.
    spawnInterval: 0.6, // 100마리 × 0.6 = 60초 스폰 → 80초 타이머 중 ~20초 여유(수석)
    loseAt: 100, // 살아있는 적(보스 포함, 각 1) 100 누적 = 게임오버
    // 2026-07-20 수석: 라운드 길이 = 타이머 80초. 다 잡아도 일찍 안 넘어가고, 남은 시간은 다음 라운드 준비.
    roundTime: 80,
    // 2026-07-20: 26→72. 소환가 100→50(경제 2배) 보정 + 초반부터 묵직하게. 라운드1 HP=72.
    hpBase: 72,
    // 2026-07-20: 30라운드 마라톤용 곡선 1.21→1.15. (1.21은 10라운드 단거리 전용 — 30에선 ~250배로 클리어 불가)
    //   시뮬(30판·소환가50): 숙련은 30 클리어 가능하되 r30 동시 적 ~60마리로 100 한계에 육박(아찔),
    //   캐주얼은 16~20라운드에서 벽. ※ buildCap을 더 늘리면(50) 다시 완화 필요.
    hpPerStage: 1.15,
    hpPerIndex: 0.01,
    speed: 8,
    // 재화 — 개체당 골드에 스테이지 스케일(검증 C1: flat 수입 vs 기하 HP → 경제 붕괴).
    // 개체 골드 = goldPerKill × size.gold × (보스면 boss.goldMult) × goldPerStage^(stage-1)
    goldPerKill: 1, // 2026-07-20 수석: 2→1 (기본 1골드. 크기·스테이지 배수는 유지)
    goldPerStage: 1.15, // 수입도 스테이지마다 상승(HP 1.13을 근소 상회 → 후반 캐치업)
    // 적 체급 — 소/중/대. 대형=단단·느림·보상↑ (검증: 소형 편중 완화 60→50, 대형 10→20)
    sizes: {
      small: { weight: 50, hp: 1.0, speed: 1.0, gold: 1, scale: 0.82 },
      medium: { weight: 30, hp: 1.8, speed: 0.85, gold: 2, scale: 1.0 },
      large: { weight: 20, hp: 3.2, speed: 0.68, gold: 4, scale: 1.28 },
    },
    // 보스 — 매 5스테이지(5,10,…)에 2마리(그 스테이지 100 중 98일반+2보스). 2마리 다 잡아야 클리어.
    boss: {
      everyStages: 5,
      count: 2,
      hpMult: 7, // 그 스테이지 중형 기준 체력 배수 (검증: 12는 보스만 별도 벽 → 7)
      speedMult: 0.5,
      goldMult: 8,
      // 무료 소환권: 초반 폭주 완화 → 후반 캐치업 (2 + floor(stage/10))
      rewardPullsBase: 2,
      rewardPullsPerTen: 1,
      scale: 1.7,
    },
  },

  // ── 소환 — 골드로 랜덤 영웅. 등급 확률 + 천장(헌장 #3) ──
  summon: {
    openingPulls: 10, // 런 시작 시 무료 10연차로 초기 병력
    startGold: 0,
    cost: 50, // 2026-07-20: 100→50 (수석 지시). 소환가↓ = 소환 회전↑. 반환 캡도 함께 ≤50로 낮춤(처닝 차단)
    // 2026-07-20 수석: 6단계 등급 확률(레거시 GACHA_RATES와 분리 — RD 전용). 합계 1.0.
    rates: [
      { rarity: 6, rate: 0.002 }, // 초월
      { rarity: 5, rate: 0.013 }, // 신화
      { rarity: 4, rate: 0.045 }, // 전설
      { rarity: 3, rate: 0.12 },  // 영웅
      { rarity: 2, rate: 0.28 },  // 희귀
      { rarity: 1, rate: 0.54 },  // 일반
    ],
    pity: { pulls: 50, effect: 'rarityUp' }, // 50뽑마다 등급업 확정(좌절 방지)
  },

  // ── 도박 — 2026-07-20 수석: 주사위 2개. 같은 수(더블)면 '럭키!' 잭팟 500골드, 아니면 합계 × perPip.
  //    E[지급] ≈ 258 / 비용 250 → RTP ~103%(잭팟 재미로 소폭 +. 골드 싱크는 소환 가챠 쪽이라 의도적 허용).
  gamble: {
    cost: 250,
    perPip: 30,      // 주사위 합계 1당 골드 (더블 아닐 때)
    doubleGold: 500, // 같은 수(1·1, 2·2 …) 잭팟
    cooldown: 30,    // 2026-07-20 수석: 30초에 1회만(스팸/무한골드 방지)
  },

  // ── 합성 — 2026-07-20 수석 지시: '같은 영웅' 3장 → 상위 등급 랜덤 1장(수동). 전설은 합성 없음 ──
  // (소환가 50·작은 등급별 풀이라 같은 장수 3장 모으기가 실제로 가능 → C5 판단 뒤집음)
  merge: {
    need: 3, // 같은 영웅 3장 → 상위 등급 랜덤 1장
    // 승급체는 재료 3장 중 '최고 단련 레벨'을 계승, 나머지 2장의 단련 골드는 50% 환급(검증 C6).
    inheritTopUpgrade: true,
    consumedUpgradeReturn: 0.5,
  },

  // ── 유닛 전투 — 등급별 사거리/공속, 데미지는 영웅 base에서. 성장축: 단련(골드) + 합성(등급climb) ──
  unit: {
    // 2026-07-20 수석: 6단계. 전설(4)=3인 동시타격, 신화(5)=4인, 초월(6)=5인 + 10초마다 광역기.
    //   multi = 동시 타격 대상 수. aoe = 초월 전용 광역(간격 초, 데미지 배수).
    byRarity: {
      1: { range: 18, cooldown: 1.0, dmg: 1.0, multi: 1 },
      2: { range: 20, cooldown: 0.94, dmg: 1.12, multi: 1 },
      3: { range: 23, cooldown: 0.86, dmg: 1.28, multi: 1 },
      4: { range: 27, cooldown: 0.78, dmg: 1.5, multi: 3 },
      5: { range: 31, cooldown: 0.70, dmg: 1.78, multi: 4 },
      6: { range: 36, cooldown: 0.62, dmg: 2.1, multi: 5, aoe: { interval: 10, dmgMult: 4 } },
    },
    moveSpeed: 46, // 유닛 이동 속도(초당 필드 %) — 드래그한 지점으로 걸어간다(8방향)
    // 2026-07-20: y2 74→68→77. 68은 점선 박스(y78)까지 10%가 텅 비어 보임(수석 지적). 발이 점선에
    //   거의 닿되 넘지 않는 선으로 다시 넓힘(측정: 발끝이 트랙 바닥선 안쪽). 아래 배치 공간을 되살림.
    bounds: { x1: 15, y1: 26, x2: 85, y2: 77 }, // 유닛을 놓을 수 있는 네모 안 경계(필드 %)
    // 단련(업그레이드) — 골드로 개별 유닛 강화 (검증: 비용 완화로 실도달 가능하게)
    upgrade: {
      costBase: 40, // 60→40
      costGrowth: 1.3, // 1.6→1.3 (lv20 누적 ≈ 25,200, 도달 가능)
      dmgPerLevel: 0.3, // 0.25→0.30 (DPS 천장↑ + 골드 싱크 유지)
      maxLevel: 20,
    },
    // 속성별 단련(2026-07-20 수석) — 속성을 골라 그 속성 유닛 '전체'의 공격력·공속을 올린다(런 스코프 성장축).
    //   전체를 올리므로 개별 단련보다 비싸고 완만하게. 라운드 상성(통일 속성)과 시너지.
    elemUpgrade: {
      costBase: 120,
      costGrowth: 1.6,
      maxLevel: 12,
      atkPerLevel: 0.15, // 공격력 +15%/레벨 (해당 속성 전 유닛)
      spdPerLevel: 0.06, // 공속 +6%/레벨(쿨다운 감소) — 12레벨 시 쿨 ×0.28(최소 0.25 캡)
    },
    // 반환(판매) — 등급값 + 단련 골드 50% 환급. 등급값은 소환가(50) 이하로 캡(소환→즉매 +EV 처닝 차단)
    // 2026-07-20: 소환가 100→50에 맞춰 절반으로. 랜덤 소환 기대 반환 ≈30 < 소환가 50 → 무한증식 불가.
    refund: {
      goldByRarity: [0, 25, 30, 40, 46, 50, 50], // 등급 1~6 (index 0 미사용). 최고등급도 소환가(50) 이하 캡
      upgradeReturn: 0.5,
    },
  },

  // ── 속성 상성 — 물·불·땅. 물>불, 불>땅, 땅>물 (검증: 약 0.6→0.75로 최악 스윙 완화) ──
  element: {
    strong: 1.5, // 우위 (뽑기 손맛 유지)
    weak: 0.75, // 열위 (0.6→0.75)
    neutral: 1.0,
  },

  // ── 순수 아케이드 (2026-07-20 수석 확정) ──
  // 옥구슬·도전권(티켓)·영구성장 상점 제거. 지면 즉시 무제한 재도전, 매 판 순수 실력.
  // 유일한 이월 요소는 '최고 라운드' 기록(rd-meta)뿐 — 겹치는 목표용.
};

// 속성 정의 — 물(water)·불(fire)·땅(earth)·바람(wind). 2026-07-20 수석: 바람 추가.
// 상성 4-순환(수석): 불→바람→땅→물→불 (화살표=이김). key가 value에게 강함.
export const ELEMENTS = ['water', 'fire', 'earth', 'wind'];
export const ELEMENT_LABEL = { water: '물', fire: '불', earth: '땅', wind: '바람' };
export const ELEMENT_COLOR = { water: '#4f9dd6', fire: '#e0613a', earth: '#b0803f', wind: '#57bd86' };
export const ELEMENT_BEATS = { fire: 'wind', wind: 'earth', earth: 'water', water: 'fire' };

// 영웅 24종 속성 6:6:6:6 (2026-07-20 바람 추가 — 물불땅에서 각 2명씩 바람으로 이동).
export const HERO_ELEMENT = {
  lvbu: 'fire', zhangfei: 'fire', xiahoudun: 'fire', zhangliao: 'fire',
  yuanshao: 'fire', liaohua: 'fire',
  zhugeliang: 'water', zhouyu: 'water', sunce: 'water', ganning: 'water',
  sunshangxiang: 'water', handang: 'water',
  caocao: 'earth', guanyu: 'earth', zhaoyun: 'earth', dongzhuo: 'earth',
  liubei: 'earth', xunyu: 'earth',
  huaxiong: 'wind', jiling: 'wind', zhoucang: 'wind', chengpu: 'wind',
  caohong: 'wind', yujin: 'wind',
};

// 크기 상성 — 적 체급(소/중/대)에 대한 영웅별 강약. 각 영웅 한 체급 강·한 체급 약.
// (검증: 시스템 세금이라 1.4/0.7 → 1.25/0.8로 완화)
export const SIZE_LABEL = { small: '소형', medium: '중형', large: '대형' };
export const SIZE_ROLE_MULT = {
  'anti-small': { small: 1.25, medium: 1.0, large: 0.8 },
  'anti-medium': { small: 0.8, medium: 1.25, large: 1.0 },
  'anti-large': { small: 1.0, medium: 0.8, large: 1.25 },
};
// 24종 크기 역할 8:8:8, 속성과 탈상관(각 속성군에 세 역할 고루 분포).
export const HERO_SIZE_ROLE = {
  // 소형 특화
  zhangliao: 'anti-small', jiling: 'anti-small', liaohua: 'anti-small', sunce: 'anti-small',
  ganning: 'anti-small', sunshangxiang: 'anti-small', zhaoyun: 'anti-small', xunyu: 'anti-small',
  // 중형 특화
  xiahoudun: 'anti-medium', yuanshao: 'anti-medium', zhugeliang: 'anti-medium', zhouyu: 'anti-medium',
  handang: 'anti-medium', caocao: 'anti-medium', dongzhuo: 'anti-medium', liubei: 'anti-medium',
  // 대형 특화
  lvbu: 'anti-large', zhangfei: 'anti-large', huaxiong: 'anti-large', zhoucang: 'anti-large',
  chengpu: 'anti-large', guanyu: 'anti-large', caohong: 'anti-large', yujin: 'anti-large',
};

// 임시 적 아트 — 신규 적 아트(50라운드+보스) 나오기 전, 기존 스프라이트(assets/enemies-cut) 재사용.
// 스테이지마다 순환 배정, 보스는 별도. (stages.js의 foeArt/bossArt id와 동일)
export const ENEMY_SPRITES = [
  'yellow-turban', 'bandit-archer', 'dong-soldier', 'halberdier', 'warlord-soldier', 'shield-brute',
  'yuan-soldier', 'twin-blade', 'wu-soldier', 'crossbowman', 'nanman-soldier', 'axe-raider',
  'spear-guard', 'flag-bearer',
];
export const BOSS_SPRITES = ['zhangjiao', 'boss-general', 'boss-warlock'];
export const BOSS_SPRITE = BOSS_SPRITES[0]; // 하위호환

// 병기 — 공격 투사체 연출 판별. 궁수·책사는 화살/기(氣)가 날아가고, 나머지는 참격이 뻗어 나간다.
// (연출용 데이터 — 엔진은 heroId만 fx에 실어 보내고, UI가 여기서 병기를 읽어 그린다.)
export const HERO_WEAPON = {
  sunshangxiang: 'arrow', ganning: 'arrow', // 궁(弓)
  zhugeliang: 'arrow', xunyu: 'arrow',      // 책사의 기(氣) — 화살처럼 날아간다
  // 그 외 21인은 참격(slash) — 기본값
};

// 등급별 소환 후보(영웅 id). 소환·합성 시 등급 안에서 랜덤 1명.
export const SUMMON_POOL = [1, 2, 3, 4, 5, 6].reduce((pool, r) => {
  pool[r] = HEROES.filter((h) => h.rarity === r).map((h) => h.id);
  return pool;
}, {});
