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
    loseAt: 100, // 2026-07-21 수석 재지시: 살아있는 적 100 누적 = 게임오버(원상복구)
    // 2026-07-20 수석: 라운드 길이 = 타이머 80초. 다 잡아도 일찍 안 넘어가고, 남은 시간은 다음 라운드 준비.
    roundTime: 80,
    roundClearGold: 120, // 2026-07-21 메운디밸런스: 100→120 (라운드 돌파 보상 소폭↑)
    // 2026-07-21: 170→140 (수석 "1탄은 별1 5마리로 깰 수 있게 조금 낮춰"). 후반은 hpPerStage로 유지.
    hpBase: 140,
    // 1.2→1.22. r30 ≈ 170×1.22^29 ≈ 60,000×(크기·보스). 고단련 필수.
    hpPerStage: 1.22,
    hpPerIndex: 0.01,
    speed: 8,
    // 재화 — 개체당 골드에 스테이지 스케일(검증 C1: flat 수입 vs 기하 HP → 경제 붕괴).
    // 개체 골드 = goldPerKill × size.gold × (보스면 boss.goldMult) × goldPerStage^(stage-1)
    goldPerKill: 1.5, // 2026-07-21 메운디밸런스: 1→1.5 (킬로 소환 충당하는 경제로 소폭 완화)
    goldPerStage: 1.0, // 2026-07-20 수석: 1.15→1.0 (스테이지 스케일 제거 — 킬 골드는 크기 배수만, 라운드로 안 커짐)
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
      killGold: 100, // 보스 처치 시 마리당 보너스 골드(수석)
      hpMult: 12, // 2026-07-21 수석: 보스 라운드 난이도↑. 중형 기준 체력 배수 7→12.
      speedMult: 0.5,
      goldMult: 8,
      // 2026-07-20 수석: 무료 뽑기권 지급 안 함(보스는 골드로만 보상). 0으로.
      rewardPullsBase: 0,
      rewardPullsPerTen: 0,
      scale: 2.6, // 좀 더 큰 새 캐릭 느낌(2마리만 출현 — count:2)
      // 2026-07-21 메운디밸런스: 보스 처치 시 고등급 유닛 무료 획득 보장(운빨 없이도 강해지는 파워 스파이크).
      //   보스 1마리당 아래 가중치로 등급 뽑아 무료 지급. [등급, 확률]
      grant: [[4, 0.68], [5, 0.27], [6, 0.05]],
    },
  },

  // ── 소환 — 골드로 랜덤 영웅. 등급 확률 + 천장(헌장 #3) ──
  summon: {
    openingPulls: 5, // 2026-07-21 수석: 10→5 (초반 병력 축소). 런 시작 무료 소환
    startGold: 0,
    cost: 40, // 2026-07-21 메운디밸런스: 50→40 (뽑기 소폭 완화). 반환 캡은 <40로(처닝 차단)
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
    cooldown: 60,    // 2026-07-21 수석: 1분에 1회
    // 2026-07-21 메운디밸런스: 승급 도박 — 골드 지불, chance 확률로 유닛 1명을 1등급 승급.
    up: { cost: 200, chance: 0.2 },
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
    // 2026-07-20 수석: 사거리를 등급별로 크게 벌린다 — 6성은 가운데 둬도 전장 끝(적)까지 닿고(≈62),
    //   5성부터 1성까지 점점 줄인다. 중앙 배치 기준 최원거리 적 ≈60.
    byRarity: {
      1: { range: 18, cooldown: 1.0, dmg: 1.0, multi: 1 },
      2: { range: 24, cooldown: 0.94, dmg: 1.12, multi: 1 },
      3: { range: 31, cooldown: 0.86, dmg: 1.28, multi: 1 },
      4: { range: 40, cooldown: 0.78, dmg: 1.5, multi: 3 },
      5: { range: 50, cooldown: 0.70, dmg: 1.78, multi: 4 },
      6: { range: 62, cooldown: 0.62, dmg: 2.1, multi: 5, aoe: { interval: 10, dmgMult: 4 } },
    },
    moveSpeed: 46, // 유닛 이동 속도(초당 필드 %) — 드래그한 지점으로 걸어간다(8방향)
    // 2026-07-20: y2 74→68→77. 68은 점선 박스(y78)까지 10%가 텅 비어 보임(수석 지적). 발이 점선에
    //   거의 닿되 넘지 않는 선으로 다시 넓힘(측정: 발끝이 트랙 바닥선 안쪽). 아래 배치 공간을 되살림.
    bounds: { x1: 15, y1: 26, x2: 85, y2: 77 }, // 유닛을 놓을 수 있는 네모 안 경계(필드 %)
    // 단련(업그레이드) — 골드로 강화. 2026-07-20 수석: 25골드부터 레벨당 +1골드(선형), 데미지는 소폭(+5%/레벨).
    upgrade: {
      costBase: 25,      // 레벨0→1 비용
      costStep: 1,       // 레벨당 비용 증가(선형)
      dmgPerLevel: 0.05, // 레벨당 +5% (너무 많이 안 오르게)
      maxLevel: 30,
    },
    // 속성별 단련(2026-07-20 수석) — 속성을 골라 그 속성 유닛 '전체'의 공격력·공속을 올린다(런 스코프 성장축).
    //   전체를 올리므로 개별 단련보다 비싸고 완만하게. 라운드 상성(통일 속성)과 시너지.
    // 2026-07-21 수석: 50골드부터 레벨당 +5골드(50·55·60…), 최대치 없음.
    elemUpgrade: {
      costBase: 50,
      costStep: 5,
      maxLevel: 99999, // 사실상 무제한(최대치 없음)
      atkPerLevel: 0.05, // 공격력 +5%/레벨 (해당 속성 전 유닛)
      spdPerLevel: 0.03, // 공속 +3%/레벨(쿨다운 감소)
    },
    // 반환(판매) — 등급값 + 단련 골드 50% 환급. 등급값은 소환가(50) 이하로 캡(소환→즉매 +EV 처닝 차단)
    // 2026-07-20: 소환가 100→50에 맞춰 절반으로. 랜덤 소환 기대 반환 ≈30 < 소환가 50 → 무한증식 불가.
    refund: {
      goldByRarity: [0, 25, 30, 40, 46, 48, 48], // 등급 1~6 (index 0 미사용). 소환가(50) 미만 캡 — 소환→반환 무한증식 차단
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

// 공격 형태 아이콘(이름 앞 표기) — 창(spear)·칼(sword)·활(bow)·마법(magic, 파이어볼). 기본 sword.
export const HERO_ATTACK_TYPE = {
  sunshangxiang: 'bow', ganning: 'bow', zhugeliang: 'bow', xunyu: 'bow',
  lvbu: 'magic', zhaoyun: 'magic', zhangliao: 'magic', caohong: 'magic', // 2026-07-21 수석: 기마→마법(파이어볼)
  zhangfei: 'spear', xiahoudun: 'spear', jiling: 'spear', chengpu: 'spear', huaxiong: 'spear', handang: 'spear', zhoucang: 'spear',
  // 나머지(관우·조조·주유·손책·동탁·유비·원소·요화·우금)는 칼(기본)
};

// 지능(마법) 영웅 특수 시전 — 제갈량: 디파일러 끈끈이(Ensnare)식 광역 슬로우.
// cd초마다 사거리 내 적 밀집점에 radius(필드%) 슬로우 장을 깔아 dur초간 이동속도 ×factor.
export const HERO_CAST = {
  zhugeliang: { type: 'slow', radius: 20, factor: 0.45, dur: 2.6, cd: 4.5 },
};

// 등급별 소환 후보(영웅 id). 소환·합성 시 등급 안에서 랜덤 1명.
export const SUMMON_POOL = [1, 2, 3, 4, 5, 6].reduce((pool, r) => {
  pool[r] = HEROES.filter((h) => h.rarity === r).map((h) => h.id);
  return pool;
}, {});
