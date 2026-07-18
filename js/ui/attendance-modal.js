// 출석 모달 — 7일 순환. 오늘 보상을 아직 안 받았으면 접속 직후 자동으로 뜬다.

import { attendanceInfo, claimAttendance } from '../core/state.js';
import { BALANCE } from '../data/balance.js';
import { showModal } from './modal.js';
import { fmt } from './format.js';
import { play, vibrate } from './sound.js';

/** 오늘 받을 게 있으면 출석 모달을 띄운다. 띄웠으면 true */
export function maybeShowAttendance() {
  const info = attendanceInfo();
  if (!info.claimable) return false;

  const todayDay = (info.cycleDay % BALANCE.attendance.rewards.length) + 1;
  const body = document.createElement('div');
  body.className = 'attend-body';
  body.innerHTML = `
    <p class="settings-note">매일 오면 옥구슬을 드립니다. 7일마다 한 바퀴, 갈수록 커져요.</p>
    <div class="attend-grid">
      ${BALANCE.attendance.rewards
        .map(
          (jade, i) => `
        <div class="attend-cell${i + 1 < todayDay ? ' done' : ''}${i + 1 === todayDay ? ' today' : ''}">
          <b>${i + 1}일</b><span>${fmt(jade)}</span>
        </div>`
        )
        .join('')}
    </div>`;

  showModal({
    title: `출석 — 누적 ${info.totalDays + 1}일째`,
    body,
    dismissible: false,
    actions: [
      {
        label: `오늘 보상 받기 (옥구슬 ${fmt(BALANCE.attendance.rewards[todayDay - 1])})`,
        primary: true,
        onClick: () => {
          claimAttendance();
          play('clear');
          vibrate(20);
        },
      },
    ],
  });
  return true;
}
