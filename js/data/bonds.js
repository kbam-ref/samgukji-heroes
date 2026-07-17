// 인연 — 함께 출전하면 강해지는 조합. 순수 데이터 (로직 없음)
// bonus: 파티 전투력 배율 가산 (0.15 = +15%)
// warcry: 협공기 발동 시 외치는 한마디 (연의체)

export const BONDS = [
  {
    id: 'taoyuan',
    name: '도원결의',
    heroes: ['liubei', 'guanyu', 'zhangfei'],
    bonus: 0.15,
    blurb: '복숭아밭에서 맺은 형제의 맹세',
    warcry: '한날한시에 죽기를 맹세했노라!',
  },
  {
    id: 'tiger-spear',
    name: '범 같은 장수들',
    heroes: ['guanyu', 'zhangfei', 'zhaoyun'],
    bonus: 0.12,
    blurb: '촉의 창끝, 세 마리 범',
    warcry: '촉의 창끝을 받아라!',
  },
  {
    id: 'jiangdong',
    name: '강동의 쌍벽',
    heroes: ['sunce', 'zhouyu'],
    bonus: 0.1,
    blurb: '작은 패왕과 붉은 강의 지휘관',
    warcry: '강동의 물길이 우리 편이다!',
  },
  {
    id: 'cao-clan',
    name: '조씨 집안',
    heroes: ['caocao', 'xiahoudun', 'caohong'],
    bonus: 0.12,
    blurb: '피는 물보다 진하다',
    warcry: '조가의 이름으로 벤다!',
  },
  {
    id: 'luoyang-shadow',
    name: '낙양의 그림자',
    heroes: ['dongzhuo', 'lvbu'],
    bonus: 0.1,
    blurb: '폭군과 그의 승냥이',
    warcry: '천하가 두려움에 떨리라!',
  },
];
