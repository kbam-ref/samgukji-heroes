// 타이틀 화면 — 게임은 '문'으로 시작한다. 시작하기를 누르면 도전 1회로 새 판(라운드1)이 열린다.
// (첫 터치 = 오디오 정책 해제와 겹치므로, 누른 즉시 BGM이 흐른다)
// opts.plays가 주어지면 '남은 도전 N회'를 표시한다. 이어하기 버튼은 없다(저장 시 자동 이어서).

import { APP_VERSION } from '../version.js';

export function showTitle(onStart, opts = {}) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  const playsLine = opts.plays != null ? `<p class="title-plays">남은 도전 <b>${opts.plays}</b>회</p>` : '';
  el.innerHTML = `
    <div class="title-veil" aria-hidden="true"></div>
    <div class="title-logo">
      <em>천하통일</em>
      <b>삼국지<br>랜덤 디펜스</b>
    </div>
    <div class="title-actions">
      <button class="btn primary title-start">시작하기</button>
      ${playsLine}
    </div>
    <span class="title-version">${APP_VERSION}</span>`;
  (document.getElementById('viewport') || document.body).appendChild(el); // v121: 강제 가로 회전 대상 안으로

  const done = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    onStart?.();
  };
  el.querySelector('.title-start').addEventListener('click', done, { once: true });
}
