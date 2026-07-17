// 모집 확률표 — 순수 데이터 (로직 없음)
// rate 합계는 1이어야 한다. 천장(확정 전설)은 balance.js의 gacha.pityLegend.

export const GACHA_RATES = [
  { rarity: 5, rate: 0.01 },
  { rarity: 4, rate: 0.05 },
  { rarity: 3, rate: 0.15 },
  { rarity: 2, rate: 0.34 },
  { rarity: 1, rate: 0.45 },
];
