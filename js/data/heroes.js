// 영웅 도감 — 순수 데이터 (로직 없음)
// 등급: 1 일반 · 2 고급 · 3 희귀 · 4 영웅 · 5 전설
// base: 1레벨 1성 기준 전투력

export const RARITY = {
  1: { name: '일반' },
  2: { name: '고급' },
  3: { name: '희귀' },
  4: { name: '영웅' },
  5: { name: '전설' },
};

export const FACTIONS = {
  wei:  { name: '위',   motto: '때를 읽는 나라' },
  shu:  { name: '촉',   motto: '마음을 얻는 나라' },
  wu:   { name: '오',   motto: '강을 등에 진 나라' },
  free: { name: '군웅', motto: '난세를 떠도는 호걸들' },
};

// perk — 영웅별 고유 패시브. 출전 중일 때만 발동하며 파티 전체에 적용된다.
//   boss: 우두머리 피해 +% ‧ combo: 협공 충전 +% ‧ coin: 엽전 획득 +% ‧ guard: 아군 체력 +%
export const PERK_LABELS = { boss: '우두머리 피해', combo: '협공 충전', coin: '엽전 획득', guard: '전군 체력' };

export const HEROES = [
  // 전설
  { id: 'lvbu',          name: '여포',   title: '하늘 아래 맞수 없음',    faction: 'free', rarity: 5, base: 120, perk: { kind: 'boss', value: 25 } },
  { id: 'guanyu',        name: '관우',   title: '싸움의 신',              faction: 'shu',  rarity: 5, base: 105, perk: { kind: 'boss', value: 20 } },
  { id: 'caocao',        name: '조조',   title: '난세의 영웅',            faction: 'wei',  rarity: 5, base: 100, perk: { kind: 'coin', value: 20 } },
  { id: 'zhugeliang',    name: '제갈량', title: '잠든 용',                faction: 'shu',  rarity: 5, base: 98, perk: { kind: 'combo', value: 20 } },

  // 영웅
  { id: 'zhangfei',      name: '장비',   title: '혼자서 만 명을 막는 장사', faction: 'shu',  rarity: 4, base: 66, perk: { kind: 'boss', value: 15 } },
  { id: 'zhaoyun',       name: '조운',   title: '상산의 호랑이',          faction: 'shu',  rarity: 4, base: 64, perk: { kind: 'guard', value: 15 } },
  { id: 'zhouyu',        name: '주유',   title: '붉은 강의 지휘관',       faction: 'wu',   rarity: 4, base: 63, perk: { kind: 'combo', value: 15 } },
  { id: 'xiahoudun',     name: '하후돈', title: '외눈의 맹장',            faction: 'wei',  rarity: 4, base: 62, perk: { kind: 'guard', value: 15 } },
  { id: 'sunce',         name: '손책',   title: '강동의 작은 패왕',       faction: 'wu',   rarity: 4, base: 61, perk: { kind: 'coin', value: 15 } },
  { id: 'dongzhuo',      name: '동탁',   title: '낙양을 태운 폭군',       faction: 'free', rarity: 4, base: 60, perk: { kind: 'coin', value: 15 } },

  // 희귀
  { id: 'zhangliao',     name: '장료',   title: '합비의 수문장',          faction: 'wei',  rarity: 3, base: 42, perk: { kind: 'boss', value: 10 } },
  { id: 'ganning',       name: '감녕',   title: '방울 소리 해적',         faction: 'wu',   rarity: 3, base: 41, perk: { kind: 'coin', value: 10 } },
  { id: 'liubei',        name: '유비',   title: '돗자리 팔던 황손',       faction: 'shu',  rarity: 3, base: 40, perk: { kind: 'guard', value: 10 } },
  { id: 'sunshangxiang', name: '손상향', title: '활 잘 쏘는 아가씨',      faction: 'wu',   rarity: 3, base: 39, perk: { kind: 'combo', value: 10 } },
  { id: 'yuanshao',      name: '원소',   title: '명문가의 자존심',        faction: 'free', rarity: 3, base: 38, perk: { kind: 'coin', value: 10 } },
  { id: 'xunyu',         name: '순욱',   title: '왕을 만드는 지혜',       faction: 'wei',  rarity: 3, base: 37, perk: { kind: 'combo', value: 10 } },

  // 고급
  { id: 'huaxiong',      name: '화웅',   title: '사수관의 문지기',        faction: 'free', rarity: 2, base: 28, perk: { kind: 'boss', value: 7 } },
  { id: 'zhoucang',      name: '주창',   title: '청룡도를 메고 다니는 사내', faction: 'shu',  rarity: 2, base: 27, perk: { kind: 'guard', value: 7 } },
  { id: 'caohong',       name: '조홍',   title: '몸을 던지는 사촌',       faction: 'wei',  rarity: 2, base: 26, perk: { kind: 'guard', value: 7 } },
  { id: 'handang',       name: '한당',   title: '강동의 노장',            faction: 'wu',   rarity: 2, base: 26, perk: { kind: 'guard', value: 7 } },

  // 일반
  { id: 'jiling',        name: '기령',   title: '세 갈래 창의 명수',      faction: 'free', rarity: 1, base: 21, perk: { kind: 'boss', value: 5 } },
  { id: 'liaohua',       name: '요화',   title: '선봉에 서는 노병',       faction: 'shu',  rarity: 1, base: 20, perk: { kind: 'guard', value: 5 } },
  { id: 'yujin',         name: '우금',   title: '엄격한 군율',            faction: 'wei',  rarity: 1, base: 19, perk: { kind: 'coin', value: 5 } },
  { id: 'chengpu',       name: '정보',   title: '세 임금을 모신 장수',    faction: 'wu',   rarity: 1, base: 19, perk: { kind: 'combo', value: 5 } },
];
