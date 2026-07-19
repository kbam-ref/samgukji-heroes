// 목표 모달 — 오늘의 목표와 업적, 보상 수령

import { showModal } from './modal.js';
import { on } from '../core/events.js';
import { getState, raidsLeft, useRaid } from '../core/state.js';
import * as quests from '../systems/quests.js';
import { raidGain } from '../systems/offline.js';
import { BALANCE } from '../data/balance.js';
import { fmt } from './format.js';
import { play } from './sound.js';
import { floatText } from './effects.js';

function rowHtml({ quest, progress, done, claimed }) {
  const stateText = claimed
    ? '<span class="q-done">받음</span>'
    : done
      ? `<button class="btn primary q-claim" data-id="${quest.id}">받기<span>옥구슬 ${fmt(quest.reward.jade)}</span></button>`
      : `<span class="q-progress">${fmt(progress)} / ${fmt(quest.goal)}</span>`;
  return `
  <li class="q-row${claimed ? ' claimed' : ''}" data-quest="${quest.id}">
    <div class="q-info">
      <b>${quest.name}</b>
      ${quest.blurb ? `<span class="q-blurb">${quest.blurb}</span>` : ''}
    </div>
    ${stateText}
  </li>`;
}

function bountyHtml() {
  const s = getState();
  const target = quests.bountyTarget(s);
  if (!target) {
    return `
    <li class="q-row">
      <div class="q-info">
        <b>현상수배</b>
        <span class="q-blurb">우두머리로 나서는 장수를 모으면 방이 붙어요</span>
      </div>
    </li>`;
  }
  const done = Boolean(s.daily.bountyDone);
  return `
  <li class="q-row${done ? ' claimed' : ''}">
    <div class="q-info">
      <b>현상수배 ‧ ${target.name}</b>
      <span class="q-blurb">${quests.bountyLocation(target)}에서 오늘 처치 — 옥구슬 ${fmt(BALANCE.bounty.jade)}</span>
    </div>
    ${done ? '<span class="q-done">완수</span>' : '<span class="q-progress">대기 중</span>'}
  </li>`;
}

function bodyHtml() {
  const dailies = quests.dailyList();
  const achievements = quests.achievementList();
  const left = raidsLeft();
  return `
    <h4 class="q-head">현상수배</h4>
    <ul class="q-list">${bountyHtml()}</ul>
    <h4 class="q-head">급습 명령</h4>
    <ul class="q-list">
      <li class="q-row${left === 0 ? ' claimed' : ''}">
        <div class="q-info">
          <b>몰아치기</b>
          <span class="q-blurb">${BALANCE.raids.minutes}분치 방치 보상을 즉시 거둔다</span>
        </div>
        <button class="btn primary q-raid" ${left > 0 ? '' : 'disabled'}>
          출동<span>오늘 ${left}회 남음</span>
        </button>
      </li>
    </ul>
    <h4 class="q-head">오늘의 목표</h4>
    <ul class="q-list">${dailies.map(rowHtml).join('')}</ul>
    <h4 class="q-head">업적</h4>
    <ul class="q-list">${achievements.map(rowHtml).join('')}</ul>`;
}

export function openGoals() {
  const body = document.createElement('div');
  body.className = 'goals-body';
  body.innerHTML = bodyHtml();

  body.addEventListener('click', (e) => {
    const raidBtn = e.target.closest('.q-raid');
    if (raidBtn) {
      const gain = raidGain(getState());
      if (useRaid(gain)) {
        play('claim');
        floatText(e.clientX, e.clientY, `엽전 +${fmt(gain)}`, 'gold');
        body.innerHTML = bodyHtml();
      }
      return;
    }
    const btn = e.target.closest('.q-claim');
    if (!btn) return;
    const jade = quests.claim(btn.dataset.id);
    if (jade > 0) {
      play('claim');
      body.innerHTML = bodyHtml(); // 수령 반영해 다시 그림
    }
  });

  // 목표를 열어 둔 채 전투가 이어지면 진행 막대가 실시간으로 찬다 (3-7).
  // 전체 재렌더는 '받기' 탭을 잃을 수 있으니 진행 텍스트만 갱신하고, 달성된 행만 교체.
  const liveUpdate = () => {
    if (!body.isConnected) {
      for (const off of subs) off();
      return;
    }
    for (const e of [...quests.dailyList(), ...quests.achievementList()]) {
      const row = body.querySelector(`.q-row[data-quest="${e.quest.id}"]`);
      if (!row) continue;
      const prog = row.querySelector('.q-progress');
      if (e.claimed) continue; // 받음 — 건드리지 않는다
      if (e.done && prog) {
        row.outerHTML = rowHtml(e); // 방금 달성 — '받기' 버튼이 뜨게 그 행만 교체
      } else if (prog) {
        prog.textContent = `${fmt(e.progress)} / ${fmt(e.quest.goal)}`;
      }
    }
  };
  const subs = ['stats:kill', 'stage:clear', 'gacha:pity', 'bounty:done', 'hero:add'].map((t) =>
    on(t, liveUpdate)
  );

  showModal({ title: '목표', body, actions: [{ label: '닫기' }] });
}
