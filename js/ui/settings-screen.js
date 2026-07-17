// 설정 화면 — 기록, 소리·진동, 세이브 관리(초기화·기기 이전)

import { getState, initState, setSetting } from '../core/state.js';
import { persist, wipe, createNewSave, migrate, isUsableSave, SAVE_VERSION } from '../core/save.js';
import { showModal } from './modal.js';
import { floatText } from './effects.js';
import { fmt } from './format.js';

function toggleHtml(key, label, value) {
  return `
  <div class="settings-row">
    <span>${label}</span>
    <button class="btn toggle${value ? ' on' : ''}" data-setting="${key}">${value ? '켬' : '끔'}</button>
  </div>`;
}

export function render(root) {
  const s = getState();
  const started = new Date(s.createdAt);
  const startedText = `${started.getFullYear()}년 ${started.getMonth() + 1}월 ${started.getDate()}일`;

  root.insertAdjacentHTML(
    'beforeend',
    `
  <section class="screen settings-screen">
    <header class="screen-head"><h2>설정</h2></header>

    <div class="settings-group">
      <h3>기록</h3>
      <div class="settings-row"><span>여정을 시작한 날</span><b>${startedText}</b></div>
      <div class="settings-row"><span>무찌른 적</span><b>${fmt(s.stats?.totalKills ?? 0)}명</b></div>
      <div class="settings-row"><span>돌파한 전장</span><b>${fmt(s.stats?.totalClears ?? 0)}곳</b></div>
      <div class="settings-row"><span>모집 횟수</span><b>${fmt(s.gacha.total)}회</b></div>
      <div class="settings-row"><span>세이브 버전</span><b>v${SAVE_VERSION}</b></div>
    </div>

    <div class="settings-group">
      <h3>소리와 떨림</h3>
      ${toggleHtml('sound', '효과음', s.settings?.sound !== false)}
      ${toggleHtml('vibrate', '진동', s.settings?.vibrate !== false)}
    </div>

    <div class="settings-group">
      <h3>세이브</h3>
      <p class="settings-note">진행은 이 기기에 자동으로 저장돼요. 다른 기기로 옮기려면 내보내기 글을 복사해 가져가세요.</p>
      <div class="settings-actions">
        <button class="btn" id="st-export">내보내기</button>
        <button class="btn" id="st-import">가져오기</button>
        <button class="btn danger" id="st-reset">처음부터</button>
      </div>
    </div>
  </section>`
  );

  root.addEventListener('click', (e) => {
    const toggle = e.target.closest('button.toggle');
    if (!toggle) return;
    const key = toggle.dataset.setting;
    const next = !(getState().settings?.[key] !== false);
    setSetting(key, next);
    persist(getState());
    toggle.classList.toggle('on', next);
    toggle.textContent = next ? '켬' : '끔';
  });

  document.getElementById('st-export').addEventListener('click', () => {
    persist(getState());
    const text = JSON.stringify(getState());
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="settings-note">아래 글 전체를 복사해 두세요. 다른 기기의 "가져오기"에 붙여 넣으면 이어집니다.</p>
      <textarea class="save-box" readonly>${text.replace(/</g, '&lt;')}</textarea>`;
    showModal({
      title: '세이브 내보내기',
      body,
      actions: [
        {
          label: '복사',
          primary: true,
          onClick: () => {
            const box = document.querySelector('.save-box');
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(text).catch(() => {});
            } else if (box) {
              box.select();
              document.execCommand('copy');
            }
          },
        },
        { label: '닫기' },
      ],
    });
    const box = body.querySelector('.save-box');
    if (box) box.addEventListener('click', () => box.select());
  });

  document.getElementById('st-import').addEventListener('click', () => {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="settings-note">내보내기로 복사한 글을 붙여 넣으세요. 지금 진행은 덮어써져요.</p>
      <textarea class="save-box" placeholder="여기에 붙여넣기"></textarea>`;
    showModal({
      title: '세이브 가져오기',
      body,
      actions: [
        { label: '그만두기' },
        {
          label: '덮어쓰고 이어하기',
          primary: true,
          onClick: () => {
            try {
              const parsed = JSON.parse(body.querySelector('.save-box').value);
              if (!parsed || typeof parsed.version !== 'number') throw new Error('형식이 아님');
              const migrated = migrate(parsed);
              if (!isUsableSave(migrated)) throw new Error('구조가 깨짐');
              initState(migrated);
              persist(getState());
              location.reload();
            } catch {
              floatText(window.innerWidth / 2, window.innerHeight / 2, '세이브 글이 올바르지 않아요', 'warn');
            }
          },
        },
      ],
    });
  });

  document.getElementById('st-reset').addEventListener('click', () => {
    showModal({
      title: '처음부터 다시 시작할까요?',
      body: '모든 장수와 재화, 전장 진행이 사라져요. 되돌릴 수 없어요.',
      actions: [
        { label: '그만두기' },
        {
          label: '지우고 다시 시작',
          primary: true,
          onClick: () => {
            wipe();
            initState(createNewSave());
            persist(getState());
            location.reload();
          },
        },
      ],
    });
  });
}

export function destroy() {}
