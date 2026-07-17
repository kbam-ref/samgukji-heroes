// 열전 — 인연에 얽힌 짧은 이야기. 해당 인연의 장수를 전부 모으면 열린다.
// 처음 읽으면 옥구슬과 함께 그 인연의 보너스가 영구히 +1%p 깊어진다.
// 순수 데이터 (로직 없음). 대사는 연의체.

export const TALES = [
  {
    id: 'tale-taoyuan',
    bondId: 'taoyuan',
    title: '복숭아밭의 맹세',
    scenes: [
      { speaker: '유비', faction: 'shu', line: '같은 해 같은 달 같은 날에 태어나지 못했으나—' },
      { speaker: '관우', faction: 'shu', line: '죽기는 같은 해 같은 달 같은 날이기를 빈다.' },
      { speaker: '장비', faction: 'shu', line: '복숭아꽃 지기 전에, 천하가 우리 이름을 알게 하리라!' },
      { speaker: '', faction: 'shu', line: '— 세 사람은 잔을 땅에 붓고 일어섰다. 난세가 그들을 기다리고 있었다.' },
    ],
  },
  {
    id: 'tale-tiger',
    bondId: 'tiger-spear',
    title: '세 마리 범',
    scenes: [
      { speaker: '조운', faction: 'shu', line: '창은 주인을 가리지 않으나, 나는 주인을 가려 왔소.' },
      { speaker: '관우', faction: 'shu', line: '그 눈빛, 장판에서 다시 보게 되겠군.' },
      { speaker: '장비', faction: 'shu', line: '범 셋이 나란히 서면, 산이 먼저 길을 비킨다!' },
    ],
  },
  {
    id: 'tale-jiangdong',
    bondId: 'jiangdong',
    title: '강동의 두 젊은이',
    scenes: [
      { speaker: '손책', faction: 'wu', line: '아버지의 옥새를 팔아 병사 삼천을 얻었다. 밑지는 장사였나?' },
      { speaker: '주유', faction: 'wu', line: '천하를 얻을 밑천이라면, 싸게 산 것이지.' },
      { speaker: '', faction: 'wu', line: '— 두 사람은 마주 보고 웃었다. 장강의 물결이 그 웃음을 실어 날랐다.' },
    ],
  },
  {
    id: 'tale-cao',
    bondId: 'cao-clan',
    title: '피는 물보다 진하다',
    scenes: [
      { speaker: '조홍', faction: 'wei', line: '천하에 이 조홍은 없어도 되지만, 공은 없어서는 안 되오!' },
      { speaker: '조조', faction: 'wei', line: '…내 이 말을 잊지 않겠다.' },
      { speaker: '하후돈', faction: 'wei', line: '조가의 깃발 아래 모인 피는, 물러서는 법을 배우지 못했소.' },
    ],
  },
  {
    id: 'tale-luoyang',
    bondId: 'luoyang-shadow',
    title: '낙양의 긴 그림자',
    scenes: [
      { speaker: '동탁', faction: 'free', line: '적토마다. 하루에 천 리를 달린다지.' },
      { speaker: '여포', faction: 'free', line: '…말 한 필에 아비를 바꾸란 말이오?' },
      { speaker: '동탁', faction: 'free', line: '바꾸는 게 아니다. 더 나은 아비를 얻는 것이지.' },
      { speaker: '', faction: 'free', line: '— 그날 밤 낙양의 그림자는 한 뼘 더 길어졌다.' },
    ],
  },
];
