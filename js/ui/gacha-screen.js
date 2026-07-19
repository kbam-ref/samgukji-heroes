// 모집 화면 — 깃발이 하나씩 뒤집히는 공개 연출과 천장 게이지.
// 등급이 높을수록 뒷면의 기운(빛무리)이 짙어지고, 전설은 화면이 금빛으로 물든다.

import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import * as gacha from '../systems/gacha.js';
import * as shard from '../systems/shard.js';
import { GACHA_RATES } from '../data/gacha-tables.js';
import { RARITY, HEROES } from '../data/heroes.js';
import { BALANCE } from '../data/balance.js';
import { showModal } from './modal.js';
import { fmt } from './format.js';
import { shake, floatText } from './effects.js';
import { play, vibrate } from './sound.js';
import { portraitHtml } from './portrait.js';

let unsubs = [];
let revealTimers = [];

function rateNote() {
  return GACHA_RATES.map(
    (r) => `${RARITY[r.rarity].name} ${Math.round(r.rate * 1000) / 10}%`
  ).join(' ‧ ');
}

// 명성 전당 — 24명 전원 지정 교환 가능. 미보유는 실루엣이라 "저걸 사겠다"는 목표가 된다.
function shardGridHtml(s) {
  return HEROES.map((h) => {
    const owned = Boolean(s.heroes[h.id]);
    return `
    <button class="shard-cell r${h.rarity}" data-id="${h.id}" aria-label="${h.name} 교환">
      ${portraitHtml(h.id, `frame-r${h.rarity}${owned ? '' : ' silhouette'}`)}
      <span class="shard-cost">${fmt(shard.exchangeCost(h.id))}</span>
    </button>`;
  }).join('');
}

function refreshShardHall() {
  const s = getState();
  const bal = document.getElementById('sh-balance');
  if (bal) bal.textContent = fmt(s.resources.shard ?? 0);
  const note = document.getElementById('sh-release-note');
  if (note) {
    const total = shard.releasePreview(s).reduce((acc, e) => acc + e.shards, 0);
    note.textContent = total > 0 ? `지금 +${fmt(total)} 조각` : '방출할 중복 없음';
  }
  const grid = document.getElementById('sh-grid');
  if (grid) grid.innerHTML = shardGridHtml(s);
}

function flagCardHtml({ hero, dupe }, index) {
  return `
  <div class="pull-flag r${hero.rarity}" data-index="${index}" style="--i:${index}">
    <div class="pf-inner">
      <div class="pf-back"></div>
      <div class="pf-front">
        ${portraitHtml(hero.id, `pf-portrait frame-r${hero.rarity}`)}
        <em class="pf-rarity">${RARITY[hero.rarity].name}</em>
        <b class="pf-name">${hero.name}</b>
        <span class="pf-tag">${dupe ? '중복 +1' : '새 장수!'}</span>
      </div>
    </div>
  </div>`;
}

function clearRevealTimers() {
  for (const t of revealTimers) clearTimeout(t);
  revealTimers = [];
}

function closeReveal() {
  clearRevealTimers();
  const stage = document.getElementById('gs-stage');
  if (stage) stage.remove();
}

/** 전설 등장 — 대형 세로 깃발이 화면을 채우고 호가 묵서로 나타난다.
 *  겹침이면 좌절 대신 승급 가치를 말해 준다. */
function showLegendBanner(hero, dupe) {
  const stage = document.getElementById('gs-stage');
  if (!stage) return;
  const banner = document.createElement('div');
  banner.className = 'legend-banner';
  banner.innerHTML = `
    <div class="lb-flag">
      ${portraitHtml(hero.id, 'lb-portrait')}
      <span class="lb-name">${hero.name}</span>
    </div>
    <p class="lb-title">${dupe ? '별빛이 더 깊어진다 — 승급 재료 +1' : hero.title}</p>`;
  stage.appendChild(banner);
  setTimeout(() => banner.classList.add('out'), 1450); // 여운 — 스르르 물러난다
  setTimeout(() => banner.remove(), 1900);
}

/** 공개 연출 — 깃발이 순서대로 뒤집힌다. 전설은 1.2초 긴장 뒤에 터진다. 건너뛰기 가능. */
function startReveal(results) {
  closeReveal();

  const stage = document.createElement('div');
  stage.className = 'pull-stage';
  stage.id = 'gs-stage';
  stage.innerHTML = `
    <p class="pull-stage-title">깃발을 눌러 확인하세요</p>
    <div class="pull-track">${results.map(flagCardHtml).join('')}</div>
    <button class="btn skip-btn" id="gs-skip">모두 공개</button>`;
  document.body.appendChild(stage);

  const cards = [...stage.querySelectorAll('.pull-flag')];
  const skipBtn = document.getElementById('gs-skip');
  let revealed = 0;

  // 서광 — 최고 등급의 존재만 암시한다. 어디 있는지는 뒤집으며 찾는 재미로.
  const top = Math.max(...results.map((r) => r.hero.rarity));
  if (top >= 4) {
    stage.classList.add(top === 5 ? 'omen-legend' : 'omen-epic');
    play('omen');
    setTimeout(() => stage.classList.remove('omen-legend', 'omen-epic'), 800);
  }

  const finish = () => {
    skipBtn.textContent = '확인';
    skipBtn.classList.add('primary');
  };

  const flip = (i, fanfare = true) => {
    const card = cards[i];
    if (!card || card.classList.contains('flip')) return;
    card.classList.remove('tremble');
    stage.classList.remove('dim');
    card.classList.add('flip');
    const rarity = results[i].hero.rarity;
    if (fanfare && rarity === 5) {
      stage.classList.add('legend-flash');
      showLegendBanner(results[i].hero, results[i].dupe);
      play('legend');
      vibrate(50);
      setTimeout(() => stage.classList.remove('legend-flash'), 900);
    } else if (fanfare && rarity === 4) {
      stage.classList.add('epic-flash');
      play('epic');
      vibrate(20);
      setTimeout(() => stage.classList.remove('epic-flash'), 550);
    }
    revealed += 1;
    if (revealed === results.length) finish();
  };

  // 일정 짜기 — 전설 앞에서는 시간이 멈춘 듯 뜸을 들인다
  let at = 350;
  results.forEach((r, i) => {
    if (r.hero.rarity === 5) {
      const tensionAt = at;
      revealTimers.push(setTimeout(() => {
        stage.classList.add('dim');
        cards[i].classList.add('tremble');
      }, tensionAt));
      at += 1200;
      revealTimers.push(setTimeout(() => flip(i), at));
      at += 1900; // 대형 깃발이 지나가는 시간
    } else {
      revealTimers.push(setTimeout(() => flip(i), at));
      at += BALANCE.gacha.revealMs;
    }
  });

  // 뒤집힌 깃발을 직접 눌러 먼저 확인할 수 있다 — '내가 뽑는' 손맛
  stage.querySelector('.pull-track').addEventListener('click', (e) => {
    const card = e.target.closest('.pull-flag');
    if (!card) return;
    flip(cards.indexOf(card));
  });

  skipBtn.addEventListener('click', () => {
    if (revealed < results.length) {
      // 모두 공개 — 짧은 시간차로 촤라락, 팡파르는 그대로
      clearRevealTimers();
      cards.forEach((c, i) => revealTimers.push(setTimeout(() => flip(i), i * 90)));
      return;
    }
    closeReveal();
  });
}

function updateBoard() {
  const s = getState();
  for (const btn of document.querySelectorAll('.pull-btn')) {
    const count = Number(btn.dataset.count);
    btn.disabled = s.resources.jade < gacha.pullCost(count);
  }
  const freeBtn = document.getElementById('gs-free');
  if (freeBtn) freeBtn.hidden = !gacha.freePullAvailable();
  const pityEl = document.getElementById('gs-pity');
  if (pityEl) pityEl.textContent = gacha.pityRemaining(s);
  const gaugeEl = document.getElementById('gs-pity-fill');
  if (gaugeEl) {
    const pct = (s.gacha.pity / BALANCE.gacha.pityLegend) * 100;
    gaugeEl.style.width = `${Math.min(100, pct)}%`;
  }
}

export function render(root) {
  destroy();
  const s = getState();

  root.insertAdjacentHTML(
    'beforeend',
    `
  <section class="screen gacha-screen">
    <header class="screen-head"><h2>모집</h2></header>

    <div class="gacha-board">
      <p class="gacha-lede">천하의 호걸을 불러 모읍니다</p>
      <p class="pity-line">전설 확정까지 <b id="gs-pity">${gacha.pityRemaining(s)}</b>회</p>
      <div class="pity-gauge"><i id="gs-pity-fill"></i></div>
      <div class="gacha-actions">
        <button class="btn free-pull" id="gs-free" hidden>
          오늘의 무료 모집<span>0 옥구슬 ‧ 하루 1회</span>
        </button>
        <button class="btn pull-btn" data-count="1">
          1회 모집<span>옥구슬 ${fmt(BALANCE.gacha.costSingle)}</span>
        </button>
        <button class="btn primary pull-btn" data-count="10">
          10회 모집<span>옥구슬 ${fmt(BALANCE.gacha.costTen)}</span>
        </button>
      </div>
      <p class="rate-note">${rateNote()}</p>
    </div>

    <div class="gacha-board shard-hall">
      <div class="shard-head">
        <b>명성 전당</b>
        <span class="shard-balance">조각 <b id="sh-balance">${fmt(s.resources.shard ?? 0)}</b></span>
      </div>
      <p class="settings-note">별을 다 채운 장수의 남는 중복을 조각으로 바꾸고, 조각으로 <b>원하는 장수를 지명해</b> 데려옵니다.</p>
      <button class="btn" id="sh-release">중복 장수 방출<span id="sh-release-note"></span></button>
      <details class="shard-fold"${(s.resources.shard ?? 0) > 0 ? ' open' : ''}>
        <summary class="mini-head">장수 지명 교환 — 조각으로 원하는 장수를 데려온다</summary>
        <div class="shard-grid" id="sh-grid">${shardGridHtml(s)}</div>
      </details>
    </div>
  </section>`
  );

  updateBoard();
  refreshShardHall();

  // 명성 전당 — 방출
  document.getElementById('sh-release').addEventListener('click', (e) => {
    const total = shard.releaseAll();
    if (total <= 0) {
      shake(e.target.closest('button'));
      floatText(e.clientX, e.clientY, '별을 다 채운 장수의 중복만 방출돼요', 'warn');
      return;
    }
    refreshShardHall();
    floatText(e.clientX, e.clientY, `명성 조각 +${fmt(total)}!`, 'gold');
    play('clear');
  });

  // 명성 전당 — 지정 교환
  document.getElementById('sh-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.shard-cell');
    if (!cell) return;
    const id = cell.dataset.id;
    const hero = HEROES.find((h) => h.id === id);
    const cost = shard.exchangeCost(id);
    const s = getState();
    const owned = Boolean(s.heroes[id]);

    showModal({
      title: `${hero.name} ‧ ${RARITY[hero.rarity].name}`,
      body: `${hero.title}\n\n조각 ${fmt(cost)}로 ${owned ? '중복 +1을 얻습니다 (승급 재료)' : '이 장수를 데려옵니다!'}\n보유 조각: ${fmt(s.resources.shard ?? 0)}`,
      actions: [
        { label: '취소' },
        {
          label: '교환하기',
          primary: true,
          onClick: () => {
            const result = shard.exchange(id);
            if (!result) {
              floatText(window.innerWidth / 2, window.innerHeight / 2, '조각이 모자라요', 'warn');
              return;
            }
            refreshShardHall();
            startReveal([{ hero, dupe: result.dupe }]); // 교환도 모집 연출로 — 얻는 맛
          },
        },
      ],
    });
  });

  document.getElementById('gs-free').addEventListener('click', () => {
    const results = gacha.pullFree();
    if (!results) return;
    updateBoard();
    startReveal(results);
  });

  document.querySelector('.gacha-actions').addEventListener('click', (e) => {
    const btn = e.target.closest('.pull-btn');
    if (!btn) return;
    const count = Number(btn.dataset.count);
    const results = gacha.pull(count);

    if (!results) {
      shake(btn);
      const rect = btn.getBoundingClientRect();
      floatText(rect.left + rect.width / 2, rect.top, '옥구슬이 모자라요', 'warn');
      return;
    }

    updateBoard();
    startReveal(results);
  });

  unsubs.push(
    on('jade', updateBoard),
    on('gacha:pity', updateBoard),
    on('shard', refreshShardHall),
    on('hero:add', refreshShardHall),
    on('hero:dupe', refreshShardHall)
  );
}

export function destroy() {
  for (const off of unsubs) off();
  unsubs = [];
  closeReveal();
}
