// 삼국지 랜덤 디펜스 — 콘텐츠·밸런스 데이터 (순수 데이터, 로직 없음)
// 엔진(systems/defense.js)이 이 숫자만 읽어 돌아간다. 밸런스는 여기서만 만진다.
// 규칙: 골드로 랜덤 소환 → '같은 등급 3장 합성 → 상위 등급 랜덤 1장'(랜덤디펜스 정석: 메운디·랜덤인물)
//       + 골드 단련(개별 강화) + 반환(판매). 사거리 자동 공격. 상성 2축(물불땅 × 소중대).
//       총 50단계·단계당 적 100(총 5000). 살아있는 적 100 누적 시 게임오버 → 티켓 소모·1단계 리셋.
//       매 5단계 보스 2마리(처치당 무료 소환). 도전 티켓 + 옥구슬 영구성장으로 과금 유도.
// ※ 수치는 다중 LLM 밸런스 검증(2026-07-19) 반영. HP·데미지 곡선은 플레이테스트로 재조정.

import { HEROES } from './heroes.js';
import { GACHA_RATES } from './gacha-tables.js';

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
  prep: { seconds: 15 }, // 2026-07-20: 시작 후 준비 시간 — 적이 나오기 전 유닛을 소환·배치하는 카운트다운

  wave: {
    perStage: 100, // 스테이지당 적 수 (일반 98 + 보스 스테이지엔 보스 2 포함, 아래 boss 참고)
    // 2026-07-20: 0.85→0.45. 시뮬 결과 0.85는 동시 적 평균 ~2마리·화면 텅 빈 시간 36%
    //   ("몬스터 하나 뜨면 자동으로 잡고 대기"의 정체). 0.45면 평균 ~12마리 상시 교전,
    //   텅 빈 시간 6%로 떨어지고 여전히 클리어 가능(엔진 헤드리스 검증). 밀도=손맛.
    spawnInterval: 0.45,
    loseAt: 100, // 살아있는 적(보스 포함, 각 1) 100 누적 = 게임오버
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
    goldPerKill: 2,
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
    rates: GACHA_RATES, // 전설1% 영웅5% 희귀15% 고급34% 일반45%
    pity: { pulls: 50, effect: 'rarityUp' }, // 50뽑마다 등급업 확정(좌절 방지)
  },

  // ── 도박 — 골드 100을 걸어 0~1500. 위로금 밴드 + 희박 잭팟(검증: 200/RTP65% → 100/RTP84%) ──
  gamble: {
    cost: 100,
    outcomes: [
      { gold: 0, weight: 40 },
      { gold: 50, weight: 28 }, // 위로금 — 완전강탈감 완화
      { gold: 100, weight: 20 },
      { gold: 300, weight: 10 },
      { gold: 800, weight: 1.5 },
      { gold: 1500, weight: 0.5 }, // 15배 잭팟 — 스릴
    ], // 기대값 ≈ 83.5 (RTP ~84%)
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
    byRarity: {
      1: { range: 18, cooldown: 1.0, dmg: 1.0 },
      2: { range: 20, cooldown: 0.95, dmg: 1.05 },
      3: { range: 23, cooldown: 0.88, dmg: 1.14 },
      4: { range: 26, cooldown: 0.8, dmg: 1.24 },
      5: { range: 30, cooldown: 0.7, dmg: 1.36 },
    },
    moveSpeed: 46, // 유닛 이동 속도(초당 필드 %) — 드래그한 지점으로 걸어간다(8방향)
    bounds: { x1: 15, y1: 26, x2: 85, y2: 74 }, // 유닛을 놓을 수 있는 네모 안 경계(필드 %)
    // 단련(업그레이드) — 골드로 개별 유닛 강화 (검증: 비용 완화로 실도달 가능하게)
    upgrade: {
      costBase: 40, // 60→40
      costGrowth: 1.3, // 1.6→1.3 (lv20 누적 ≈ 25,200, 도달 가능)
      dmgPerLevel: 0.3, // 0.25→0.30 (DPS 천장↑ + 골드 싱크 유지)
      maxLevel: 20,
    },
    // 반환(판매) — 등급값 + 단련 골드 50% 환급. 등급값은 소환가(50) 이하로 캡(소환→즉매 +EV 처닝 차단)
    // 2026-07-20: 소환가 100→50에 맞춰 절반으로. 랜덤 소환 기대 반환 ≈30 < 소환가 50 → 무한증식 불가.
    refund: {
      goldByRarity: [0, 25, 30, 40, 48, 50], // 등급 1~5 (index 0 미사용). 5성도 소환가(50) 이하
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

// 속성 정의 — 물(water)·불(fire)·땅(earth)
export const ELEMENTS = ['water', 'fire', 'earth'];
export const ELEMENT_LABEL = { water: '물', fire: '불', earth: '땅' };
export const ELEMENT_COLOR = { water: '#4f9dd6', fire: '#e0613a', earth: '#b0803f' };
export const ELEMENT_BEATS = { water: 'fire', fire: 'earth', earth: 'water' }; // key가 value에게 강함

// 영웅 24종 속성 8:8:8 (검증 C7: 속성×크기 탈상관 재배분 — 특정 조합 몰빵/사각지대 제거).
export const HERO_ELEMENT = {
  lvbu: 'fire', zhangfei: 'fire', xiahoudun: 'fire', zhangliao: 'fire',
  yuanshao: 'fire', huaxiong: 'fire', jiling: 'fire', liaohua: 'fire',
  zhugeliang: 'water', zhouyu: 'water', sunce: 'water', ganning: 'water',
  sunshangxiang: 'water', handang: 'water', zhoucang: 'water', chengpu: 'water',
  caocao: 'earth', guanyu: 'earth', zhaoyun: 'earth', dongzhuo: 'earth',
  liubei: 'earth', xunyu: 'earth', caohong: 'earth', yujin: 'earth',
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
export const SUMMON_POOL = [1, 2, 3, 4, 5].reduce((pool, r) => {
  pool[r] = HEROES.filter((h) => h.rarity === r).map((h) => h.id);
  return pool;
}, {});
