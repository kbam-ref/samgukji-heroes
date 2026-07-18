// 천하통일 시나리오 — 순수 데이터 (로직 없음)
// 연의의 사건 순서를 따라 20장(章), 장마다 10전장. 5·10번째 전장에만 우두머리가 나온다.
// 전장을 모두 돌파하면 난이도가 오르며 처음부터 다시 — 난이도는 총 20까지 (20×10×20 = 4,000 전장).
//
// 전투력·엽전 수치는 여기 없다 — balance.js의 scenario 곡선으로 systems/battle.js가 계산한다.
// foeArt: 이 장 잡병의 스프라이트 id (assets/enemies-cut/{id}.png)
// boss: 5·10전장에만. bossArt: 우두머리 전용 스프라이트 (없으면 잡병 아트를 키워 쓴다)

export const CHAPTERS = [
  {
    id: 1, name: '황건적의 난', foe: '황건적', foeArt: 'yellow-turban',
    stages: [
      { name: '탁현 마을 어귀' }, { name: '누상촌 들판' }, { name: '황건 선봉대' }, { name: '영천 구원전' },
      { name: '광종 공방전', boss: '장량' },
      { name: '곡양 전투' }, { name: '황건 본진 앞' }, { name: '복병의 골짜기' }, { name: '본진 돌파' },
      { name: '거록의 결전', boss: '장각', bossArt: 'zhangjiao' },
    ],
  },
  {
    id: 2, name: '동탁 입경', foe: '동탁군', foeArt: 'dong-soldier',
    stages: [
      { name: '낙양 가는 길' }, { name: '십상시의 뒷골목' }, { name: '금군 무기고' }, { name: '사수관 어귀' },
      { name: '사수관 공방전', boss: '화웅' },
      { name: '호로관 벌판' }, { name: '세 갈래 창격전' }, { name: '관문 위의 화살비' }, { name: '호로관 돌파' },
      { name: '호로관의 결투', boss: '여포' },
    ],
  },
  {
    id: 3, name: '낙양의 불길', foe: '동탁군', foeArt: 'dong-soldier',
    stages: [
      { name: '불타는 저잣거리' }, { name: '낙양 성문' }, { name: '재가 된 궁궐' }, { name: '피난 행렬 호위' },
      { name: '장안 추격전', boss: '서영' },
      { name: '함곡관 어귀' }, { name: '미오성 가는 길' }, { name: '폭군의 곳간' }, { name: '미오성 성벽' },
      { name: '미오성의 폭군', boss: '동탁' },
    ],
  },
  {
    id: 4, name: '이각·곽사의 난', foe: '서량군', foeArt: 'dong-soldier',
    stages: [
      { name: '장안 서문' }, { name: '흩어진 금군' }, { name: '어가 탈출로' }, { name: '위수 나루' },
      { name: '이각의 본진', boss: '이각' },
      { name: '곽사의 추격대' }, { name: '조양 골짜기' }, { name: '황하 물목' }, { name: '안읍 겨울나기' },
      { name: '동쪽으로, 낙양으로', boss: '곽사' },
    ],
  },
  {
    id: 5, name: '서주 쟁탈', foe: '여포군', foeArt: 'warlord-soldier',
    stages: [
      { name: '서주 성밖 들녘' }, { name: '소패 소집전' }, { name: '연주 탈환전' }, { name: '복양 야습' },
      { name: '복양성의 함정', boss: '고순' },
      { name: '기근의 행군' }, { name: '하비 물길' }, { name: '수문 붕괴' }, { name: '백문루 아래' },
      { name: '백문루의 최후', boss: '여포' },
    ],
  },
  {
    id: 6, name: '가짜 황제', foe: '원술군', foeArt: 'warlord-soldier',
    stages: [
      { name: '수춘 가는 길' }, { name: '회남 들녘' }, { name: '보급대 습격' }, { name: '우이성 공방전' },
      { name: '삼첨도의 맹장', boss: '기령' },
      { name: '수춘 외성' }, { name: '무너지는 곳간' }, { name: '굶주린 친위대' }, { name: '수춘 내성' },
      { name: '가짜 황제의 옥좌', boss: '원술' },
    ],
  },
  {
    id: 7, name: '관도대전', foe: '원소군', foeArt: 'yuan-soldier',
    stages: [
      { name: '백마 나루' }, { name: '연진 물목' }, { name: '관도 방책' }, { name: '망루 불화살' },
      { name: '백마의 맹장', boss: '안량' },
      { name: '군량 수레길' }, { name: '오소 기습' }, { name: '불타는 군량' }, { name: '무너지는 본진' },
      { name: '명문가의 황혼', boss: '원소' },
    ],
  },
  {
    id: 8, name: '하북 평정', foe: '원소군', foeArt: 'yuan-soldier',
    stages: [
      { name: '창정 추격전' }, { name: '여양 대치' }, { name: '업성 물길 끊기' }, { name: '형제의 다툼' },
      { name: '장남의 자존심', boss: '원담' },
      { name: '업성 공성전' }, { name: '유주 원정' }, { name: '오환 기병대' }, { name: '백랑산 눈보라' },
      { name: '북방의 끝', boss: '원상' },
    ],
  },
  {
    id: 9, name: '삼고초려', foe: '조조군', foeArt: 'yuan-soldier',
    stages: [
      { name: '융중 가는 길' }, { name: '초가집 문 앞' }, { name: '신야 둔전' }, { name: '박망파 매복' },
      { name: '박망파의 불길', boss: '하후돈' },
      { name: '신야 철수전' }, { name: '백성과 함께' }, { name: '강가의 뗏목' }, { name: '번성 공방' },
      { name: '신야의 계략', boss: '조인' },
    ],
  },
  {
    id: 10, name: '장판파', foe: '조조군', foeArt: 'yuan-soldier',
    stages: [
      { name: '당양 가도' }, { name: '피난민의 강' }, { name: '흩어진 가솔' }, { name: '단기필마 회군' },
      { name: '호치의 맹장', boss: '허저' },
      { name: '장판교 앞' }, { name: '다리 위의 호통' }, { name: '기병 추격전' }, { name: '한진 나루' },
      { name: '승상의 그물', boss: '조조' },
    ],
  },
  {
    id: 11, name: '적벽대전', foe: '조조 수군', foeArt: 'dong-soldier',
    stages: [
      { name: '장강 물안개' }, { name: '수채 정찰' }, { name: '고육지계' }, { name: '연환계' },
      { name: '수군 도독', boss: '채모' },
      { name: '동남풍을 빌리다' }, { name: '불붙는 수채' }, { name: '적벽의 화염' }, { name: '오림 패주로' },
      { name: '화용도의 재회', boss: '조조' },
    ],
  },
  {
    id: 12, name: '형주 쟁탈', foe: '조조군', foeArt: 'yuan-soldier',
    stages: [
      { name: '남군 성벽' }, { name: '이릉 우회로' }, { name: '화살 맞은 도독' }, { name: '빈 성의 계책' },
      { name: '남군의 수문장', boss: '조인' },
      { name: '형주 네 군' }, { name: '장사성의 노장' }, { name: '계양 혼담' }, { name: '무릉 평정' },
      { name: '미인계의 끝', boss: '주유' },
    ],
  },
  {
    id: 13, name: '서천 입성', foe: '유장군', foeArt: 'warlord-soldier',
    stages: [
      { name: '가맹관 어귀' }, { name: '부수관 연회' }, { name: '낙성 가는 길' }, { name: '낙봉파의 화살' },
      { name: '낙성의 명궁', boss: '장임' },
      { name: '면죽 관문' }, { name: '노장의 선봉' }, { name: '성도 포위' }, { name: '항복 권고' },
      { name: '익주의 새 주인', boss: '유장' },
    ],
  },
  {
    id: 14, name: '한중 공방전', foe: '조조군', foeArt: 'yuan-soldier',
    stages: [
      { name: '양평관 눈길' }, { name: '천탕산 군량' }, { name: '노장의 도전장' }, { name: '정군산 기슭' },
      { name: '정군산의 벼락', boss: '하후연' },
      { name: '한수 대치' }, { name: '담대한 빈 영채' }, { name: '계륵의 밤' }, { name: '야곡 철수로' },
      { name: '한중왕의 관', boss: '조조' },
    ],
  },
  {
    id: 15, name: '형주의 눈물', foe: '오군', foeArt: 'warlord-soldier',
    stages: [
      { name: '번성 수공' }, { name: '칠군 수몰' }, { name: '독화살 수술' }, { name: '흰옷의 상인들' },
      { name: '강변 봉화대', boss: '반장' },
      { name: '텅 빈 형주성' }, { name: '맥성 고립' }, { name: '샛길의 매복' }, { name: '아버지와 아들' },
      { name: '백의도강', boss: '여몽' },
    ],
  },
  {
    id: 16, name: '이릉대전', foe: '오군', foeArt: 'warlord-soldier',
    stages: [
      { name: '복수의 출정' }, { name: '무협 수로' }, { name: '자귀 상륙' }, { name: '효정 선봉전' },
      { name: '오반의 유인대', boss: '주연' },
      { name: '칠백 리 영채' }, { name: '한여름의 숲' }, { name: '불씨 하나' }, { name: '화공 칠백 리' },
      { name: '백제성의 노을', boss: '육손' },
    ],
  },
  {
    id: 17, name: '남만 정벌', foe: '남만군', foeArt: 'yellow-turban',
    stages: [
      { name: '노수 도하' }, { name: '독샘 골짜기' }, { name: '첫 번째 사로잡음' }, { name: '등갑군의 숲' },
      { name: '맹획의 부장', boss: '망아장' },
      { name: '세 번 놓아주다' }, { name: '축융의 비도' }, { name: '코끼리 부대' }, { name: '일곱 번째 결박' },
      { name: '칠종칠금', boss: '맹획' },
    ],
  },
  {
    id: 18, name: '출사표', foe: '위군', foeArt: 'yuan-soldier',
    stages: [
      { name: '기산 진출' }, { name: '천수 계략전' }, { name: '강유를 얻다' }, { name: '가정의 산등성이' },
      { name: '가정 공방전', boss: '장합' },
      { name: '읍참마속' }, { name: '빈 성의 거문고' }, { name: '진창 겨울 공성' }, { name: '목우유마' },
      { name: '기산의 결전', boss: '사마의' },
    ],
  },
  {
    id: 19, name: '오장원의 별', foe: '위군', foeArt: 'yuan-soldier',
    stages: [
      { name: '다섯 번째 북벌' }, { name: '위수 대치' }, { name: '호로곡 화계' }, { name: '꺼지지 않는 비' },
      { name: '농서의 방벽', boss: '곽회' },
      { name: '여인의 옷을 보내다' }, { name: '백일의 대치' }, { name: '별이 지는 밤' }, { name: '목상의 퇴군계' },
      { name: '죽은 공명, 산 중달', boss: '사마의' },
    ],
  },
  {
    id: 20, name: '삼분귀일', foe: '진(晉)군', foeArt: 'dong-soldier',
    stages: [
      { name: '검각 방어선' }, { name: '음평 샛길' }, { name: '면죽의 충혼' }, { name: '성도 함락' },
      { name: '촉을 삼킨 자', boss: '등애' },
      { name: '낙양 정변' }, { name: '석두성 수전' }, { name: '왕준의 누선' }, { name: '건업 함락' },
      { name: '천하통일', boss: '사마염' },
    ],
  },
];
