// 타이틀 화면 — 게임은 '문'으로 시작한다. 시작하기를 누르면 북소리와 함께 하루가 열린다.
// (첫 터치 = 오디오 정책 해제와 겹치므로, 누른 즉시 BGM이 흐른다)
// opts.onContinue가 있으면(= 저장된 판 존재) '이어하기' 버튼을 함께 보여준다.

import { APP_VERSION } from '../version.js';

export function showTitle(onStart, opts = {}) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  const hasContinue = typeof opts.onContinue === 'function';
  el.innerHTML = `
    <div class="title-veil" aria-hidden="true"></div>
    <div class="title-logo">
      <em>천하통일</em>
      <b>삼국지<br>랜덤 디펜스</b>
    </div>
    <div class="title-actions${hasContinue ? ' has-continue' : ''}">
      ${hasContinue ? '<button class="btn primary title-continue">이어하기</button>' : ''}
      <button class="btn title-start${hasContinue ? '' : ' primary'}">${hasContinue ? '새로 시작' : '시작하기'}</button>
    </div>
    <span class="title-version">${APP_VERSION}</span>`;
  document.body.appendChild(el);

  const close = (cb) => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    cb?.();
  };
  el.querySelector('.title-start').addEventListener('click', () => close(onStart), { once: true });
  const cont = el.querySelector('.title-continue');
  if (cont) cont.addEventListener('click', () => close(opts.onContinue), { once: true });
}
