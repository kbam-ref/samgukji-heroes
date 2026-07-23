// 영웅 도감 — 순수 데이터 (로직 없음)
// 등급(2026-07-20 수석, 6단계): 1 일반 · 2 희귀 · 3 영웅 · 4 전설 · 5 신화 · 6 초월
// base: 1레벨 1성 기준 전투력. 2026-07-23 감사: 같은 등급 안 기대값 편차(최대 48%)를 띠 안으로 정규화,
//   등급 구획 주석과 실제 rarity 불일치(승급 이력 잔재)를 정리 — 이 파일이 곧 도감이다.

export const RARITY = {
  1: { name: '일반' },
  2: { name: '희귀' },
  3: { name: '영웅' },
  4: { name: '전설' },
  5: { name: '신화' },
  6: { name: '초월' },
};

export const FACTIONS = {
  wei:  { name: '위',   motto: '때를 읽는 나라' },
  shu:  { name: '촉',   motto: '마음을 얻는 나라' },
  wu:   { name: '오',   motto: '강을 등에 진 나라' },
  free: { name: '군웅', motto: '난세를 떠도는 호걸들' },
};

// perk — 장수별 고유 특성. 그 장수가 출전 중이면 전군에 적용(같은 장수 중복은 1회만 집계).
//   2026-07-23 감사: '표기만 있고 미작동'이던 것을 엔진 실동작으로 — 종류도 실제 시스템에 맞게 재편.
//   boss: 적장(보스) 피해 +% ‧ coin: 처치 골드 +% ‧ haste: 전군 공격 속도 +% ‧ might: 전군 공격력 +%
export const PERK_LABELS = { boss: '적장 피해', coin: '군자금', haste: '전군 공속', might: '전군 공격' };

export const HEROES = [
  // ── 초월 (6) — 최강 2인 ──
  { id: 'lvbu',          name: '여포',   title: '하늘 아래 맞수 없음',    faction: 'free', rarity: 6, base: 120, perk: { kind: 'boss', value: 25 } },
  { id: 'zhugeliang',    name: '제갈량', title: '와룡(臥龍)',             faction: 'shu',  rarity: 6, base: 112, perk: { kind: 'haste', value: 12 } },

  // ── 신화 (5) ──
  { id: 'guanyu',        name: '관우',   title: '미염공(美髥公)',         faction: 'shu',  rarity: 5, base: 105, perk: { kind: 'boss', value: 18 } },
  { id: 'zhangfei',      name: '장비',   title: '만인적(萬人敵)',         faction: 'shu',  rarity: 5, base: 103, perk: { kind: 'might', value: 10 } },
  { id: 'caocao',        name: '조조',   title: '난세의 간웅',            faction: 'wei',  rarity: 5, base: 101, perk: { kind: 'coin', value: 15 } },
  { id: 'zhaoyun',       name: '조운',   title: '온몸이 담(膽)인 장수',   faction: 'shu',  rarity: 5, base: 100, perk: { kind: 'might', value: 8 } },

  // ── 전설 (4) ──
  { id: 'sunce',         name: '손책',   title: '강동의 작은 패왕',       faction: 'wu',   rarity: 4, base: 65, perk: { kind: 'coin', value: 10 } },
  { id: 'zhouyu',        name: '주유',   title: '강동의 미주랑(美周郎)',  faction: 'wu',   rarity: 4, base: 64, perk: { kind: 'haste', value: 8 } },
  { id: 'xiahoudun',     name: '하후돈', title: '외눈의 맹장',            faction: 'wei',  rarity: 4, base: 63, perk: { kind: 'might', value: 6 } },
  { id: 'xunyu',         name: '순욱',   title: '왕을 보좌하는 재주',     faction: 'wei',  rarity: 4, base: 62, perk: { kind: 'haste', value: 6 } },

  // ── 영웅 (3) ──
  { id: 'dongzhuo',      name: '동탁',   title: '낙양을 태운 폭군',       faction: 'free', rarity: 3, base: 52, perk: { kind: 'coin', value: 8 } },
  { id: 'yuanshao',      name: '원소',   title: '명문가의 자존심',        faction: 'free', rarity: 3, base: 50, perk: { kind: 'coin', value: 6 } },
  { id: 'huaxiong',      name: '화웅',   title: '사수관의 문지기',        faction: 'free', rarity: 3, base: 46, perk: { kind: 'boss', value: 7 } },
  { id: 'zhangliao',     name: '장료',   title: '합비의 수문장',          faction: 'wei',  rarity: 3, base: 45, perk: { kind: 'boss', value: 6 } },
  { id: 'ganning',       name: '감녕',   title: '방울 소리 해적',         faction: 'wu',   rarity: 3, base: 43, perk: { kind: 'coin', value: 6 } },

  // ── 희귀 (2) ──
  { id: 'liubei',        name: '유비',   title: '돗자리 팔던 황손',       faction: 'shu',  rarity: 2, base: 38, perk: { kind: 'might', value: 4 } },
  { id: 'sunshangxiang', name: '손상향', title: '활 잘 쏘는 아가씨',      faction: 'wu',   rarity: 2, base: 36, perk: { kind: 'haste', value: 4 } },
  { id: 'caohong',       name: '조홍',   title: '몸을 던지는 사촌',       faction: 'wei',  rarity: 2, base: 33, perk: { kind: 'might', value: 3 } },
  { id: 'jiling',        name: '기령',   title: '세 갈래 창의 명수',      faction: 'free', rarity: 2, base: 32, perk: { kind: 'boss', value: 4 } },
  { id: 'zhoucang',      name: '주창',   title: '청룡도를 멘 사내',       faction: 'shu',  rarity: 2, base: 31, perk: { kind: 'might', value: 3 } },

  // ── 일반 (1) ──
  { id: 'handang',       name: '한당',   title: '강동의 노장',            faction: 'wu',   rarity: 1, base: 24, perk: { kind: 'might', value: 2 } },
  { id: 'liaohua',       name: '요화',   title: '선봉에 서는 노병',       faction: 'shu',  rarity: 1, base: 22, perk: { kind: 'might', value: 2 } },
  { id: 'yujin',         name: '우금',   title: '엄격한 군율',            faction: 'wei',  rarity: 1, base: 21, perk: { kind: 'coin', value: 3 } },
  { id: 'chengpu',       name: '정보',   title: '세 임금을 모신 장수',    faction: 'wu',   rarity: 1, base: 20, perk: { kind: 'haste', value: 2 } },
];
