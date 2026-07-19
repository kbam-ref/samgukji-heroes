// 시련의 탑 모달 — 최고 기록·남은 도전·다음 층 요구 전투력을 보여주고 즉시 등반한다.

import * as tower from '../systems/tower.js';
import { partyPower } from '../systems/growth.js';
import { getState } from '../core/state.js';
import { showModal } from './modal.js';
import { fmt } from './format.js';
import { countUp, flash } from './effects.js';
import { play, vibrate } from './sound.js';

function bodyHtml() {
  const s = getState();
  const best = tower.bestFloor(s);
  return `
    <p class="settings-note">전장이 막혔을 땐 탑을 오르세요. 새로 오른 층수만큼 옥구슬을 드립니다.</p>
    <div class="settings-row"><span>최고 기록</span><b>${fmt(best)}층</b></div>
    <div class="settings-row"><span>다음 층 필요 전투력</span><b>${fmt(tower.floorPower(best + 1))}</b></div>
    <div class="settings-row"><span>내 전투력</span><b>${fmt(partyPower(s))}</b></div>
    <div class="settings-row"><span>오늘 남은 도전</span><b>${tower.triesLeft()}회</b></div>`;
}

export function openTower() {
  const body = document.createElement('div');
  body.innerHTML = bodyHtml();

  showModal({
    title: '시련의 탑',
    body,
    actions: [
      { label: '닫기' },
      {
        label: '도전하기',
        primary: true,
        onClick: () => {
          const result = tower.climb();
          setTimeout(() => showResult(result), 120);
        },
      },
    ],
  });
}

function showResult(result) {
  const body = document.createElement('div');
  if (!result) {
    body.innerHTML = `<p class="settings-note">오늘의 도전을 모두 썼어요. 내일 다시 오르세요.</p>`;
    showModal({ title: '시련의 탑', body, actions: [{ label: '확인', primary: true }] });
    return;
  }

  const climbed = result.to - result.from;
  if (climbed <= 0) {
    body.innerHTML = `
      <p class="settings-note">${fmt(result.from + 1)}층의 수문장이 꿈쩍도 하지 않았다…</p>
      <div class="settings-row"><span>필요 전투력</span><b>${fmt(result.nextNeed)}</b></div>
      <p class="settings-note">단련·모집으로 전투력을 키우고 다시 오세요.</p>`;
    showModal({ title: '등반 실패', body, actions: [{ label: '확인', primary: true }] });
    return;
  }

  body.innerHTML = `
    <p class="settings-note">${fmt(result.from)}층 → <b>${fmt(result.to)}층</b>! ${fmt(climbed)}층을 단숨에 올랐다.</p>
    <div class="offline-coins"><b id="tower-jade">0</b><span>옥구슬</span></div>
    <div class="settings-row"><span>다음 층 필요 전투력</span><b>${fmt(result.nextNeed)}</b></div>`;
  showModal({ title: '등반 성공!', body, actions: [{ label: '받기', primary: true }] });
  countUp(document.getElementById('tower-jade'), 0, result.jade, { duration: 900, format: fmt });
  flash('gold');
  play('clear');
  vibrate(30);
}
