// 타이틀 화면 — 게임은 '문'으로 시작한다. 시작하기를 누르면 북소리와 함께 하루가 열린다.
// (첫 터치 = 오디오 정책 해제와 겹치므로, 누른 즉시 BGM이 흐른다)

import { APP_VERSION } from '../version.js';

export function showTitle(onStart) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.innerHTML = `
    <div class="title-veil" aria-hidden="true"></div>
    <div class="title-logo">
      <em>천하통일</em>
      <b>삼국지<br>랜덤 디펜스</b>
    </div>
    <button class="btn primary title-start">시작하기</button>
    <span class="title-version">${APP_VERSION}</span>`;
  document.body.appendChild(el);

  const done = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    onStart?.();
  };
  el.querySelector('.title-start').addEventListener('click', done, { once: true });
}
