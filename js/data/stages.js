// 전장 — 순수 데이터 (로직 없음)
// 연의의 사건 순서를 따라 장(章)이 이어진다.
// enemyPower: 이 전장의 적 전투력 기준 / coinPerKill: 적 하나당 엽전
// foeArt: 이 장 잡병의 스프라이트 id (assets/enemies-cut/{id}.png)
// bossArt: 이름 있는 우두머리 전용 스프라이트 (없으면 잡병 아트를 키워 쓴다)

export const CHAPTERS = [
  {
    id: 1,
    name: '황건적의 난',
    foe: '황건적',
    foeArt: 'yellow-turban',
    stages: [
      { name: '탁현 마을 어귀',   enemyPower: 25,  coinPerKill: 6,  boss: '황건 두목' },
      { name: '누상촌 들판',      enemyPower: 35,  coinPerKill: 8,  boss: '황건 두목' },
      { name: '황건 선봉대',      enemyPower: 48,  coinPerKill: 10, boss: '등무' },
      { name: '영천 구원전',      enemyPower: 62,  coinPerKill: 13, boss: '정원지' },
      { name: '복병의 골짜기',    enemyPower: 80,  coinPerKill: 16, boss: '황건 복병장' },
      { name: '광종 공방전',      enemyPower: 100, coinPerKill: 20, boss: '장량' },
      { name: '곡양 전투',        enemyPower: 125, coinPerKill: 25, boss: '장보' },
      { name: '황건 본진 앞',     enemyPower: 155, coinPerKill: 31, boss: '황건 친위대장' },
      { name: '본진 돌파',        enemyPower: 190, coinPerKill: 38, boss: '장보' },
      { name: '거록의 결전',      enemyPower: 240, coinPerKill: 48, boss: '장각', bossArt: 'zhangjiao' },
    ],
  },
  {
    id: 2,
    name: '동탁의 폭정',
    foe: '동탁군',
    foeArt: 'dong-soldier',
    stages: [
      { name: '낙양 가는 길',     enemyPower: 300,  coinPerKill: 62,  boss: '동탁군 순찰장' },
      { name: '불타는 저잣거리',  enemyPower: 355,  coinPerKill: 75,  boss: '이각' },
      { name: '사수관 어귀',      enemyPower: 420,  coinPerKill: 90,  boss: '곽사' },
      { name: '사수관 공방전',    enemyPower: 495,  coinPerKill: 107, boss: '화웅' },
      { name: '호로관 벌판',      enemyPower: 580,  coinPerKill: 127, boss: '동탁군 선봉장' },
      { name: '호로관의 결투',    enemyPower: 675,  coinPerKill: 150, boss: '여포' },
      { name: '낙양 성문',        enemyPower: 780,  coinPerKill: 178, boss: '이유' },
      { name: '재가 된 낙양',     enemyPower: 900,  coinPerKill: 210, boss: '동탁군 친위대' },
      { name: '장안 추격전',      enemyPower: 1060, coinPerKill: 248, boss: '서영' },
      { name: '미오성의 폭군',    enemyPower: 1250, coinPerKill: 290, boss: '동탁' },
    ],
  },
  {
    id: 3,
    name: '군웅의 시대',
    foe: '원술군',
    foeArt: 'warlord-soldier',
    stages: [
      { name: '수춘 가는 길',     enemyPower: 1450,  coinPerKill: 335,  boss: '원술군 정찰장' },
      { name: '회남 들녘',        enemyPower: 1720,  coinPerKill: 389,  boss: '뇌박' },
      { name: '보급대 습격',      enemyPower: 2050,  coinPerKill: 451,  boss: '진란' },
      { name: '우이성 공방전',    enemyPower: 2440,  coinPerKill: 523,  boss: '교유' },
      { name: '기수 강가',        enemyPower: 2900,  coinPerKill: 607,  boss: '장훈' },
      { name: '삼첨도의 맹장',    enemyPower: 3450,  coinPerKill: 775,  boss: '기령' },
      { name: '수춘 외성',        enemyPower: 4100,  coinPerKill: 900,  boss: '이풍' },
      { name: '무너지는 곳간',    enemyPower: 4880,  coinPerKill: 1040, boss: '원술군 친위대장' },
      { name: '수춘 내성',        enemyPower: 5800,  coinPerKill: 1210, boss: '양강' },
      { name: '가짜 황제의 옥좌', enemyPower: 6900,  coinPerKill: 1400, boss: '원술' },
    ],
  },
  {
    id: 4,
    name: '관도대전',
    foe: '원소군',
    foeArt: 'yuan-soldier',
    stages: [
      { name: '백마 나루',        enemyPower: 7900,  coinPerKill: 1478, boss: '안량' },
      { name: '연진 물목',        enemyPower: 9170,  coinPerKill: 1714, boss: '문추' },
      { name: '관도 방책',        enemyPower: 10600, coinPerKill: 1988, boss: '원소군 선봉장' },
      { name: '망루 불화살',      enemyPower: 12300, coinPerKill: 2306, boss: '심배' },
      { name: '군량 수레길',      enemyPower: 14300, coinPerKill: 2675, boss: '순우경' },
      { name: '오소 기습',        enemyPower: 16600, coinPerKill: 3103, boss: '원소군 곳간지기' },
      { name: '불타는 군량',      enemyPower: 19200, coinPerKill: 3599, boss: '장합' },
      { name: '무너지는 본진',    enemyPower: 22300, coinPerKill: 4175, boss: '고람' },
      { name: '창정 추격전',      enemyPower: 25900, coinPerKill: 4843, boss: '원소군 친위대' },
      { name: '명문가의 황혼',    enemyPower: 30000, coinPerKill: 5618, boss: '원소' },
    ],
  },
];
