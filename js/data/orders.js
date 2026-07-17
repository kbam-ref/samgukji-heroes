// 세력 군령 — 한 세력의 장수를 도감에서 전부 모으면 그 세력의 군령을 내릴 수 있다.
// 동시에 하나만 발동. 순수 데이터 (로직 없음)

export const ORDERS = [
  {
    id: 'wei-rally',
    faction: 'wei',
    name: '진영 재정비',
    blurb: '전열이 무너져도 다시 서는 시간이 30% 짧다',
    effect: { wipeRecoverMult: 0.7 },
  },
  {
    id: 'shu-spirit',
    faction: 'shu',
    name: '의기충천',
    blurb: '합격의 기세가 20% 빠르게 차오른다',
    effect: { comboChargeMult: 1.2 },
  },
  {
    id: 'wu-guard',
    faction: 'wu',
    name: '강동 수비진',
    blurb: '적의 공격이 15% 무뎌진다',
    effect: { enemyAtkMult: 0.85 },
  },
  {
    id: 'free-momentum',
    faction: 'free',
    name: '난세의 기세',
    blurb: '우두머리에게 주는 피해가 10% 커진다',
    effect: { bossDamageMult: 1.1 },
  },
];
