// 타이틀 화면 — 게임은 '문'으로 시작한다. 출정을 누르면 북소리와 함께 하루가 열린다.
// (첫 터치 = 오디오 정책 해제와 겹치므로, 출정 즉시 BGM이 흐른다)

export function showTitle(onStart) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.innerHTML = `
    <div class="title-veil" aria-hidden="true"></div>
    <div class="title-logo">
      <em>천하통일</em>
      <b>삼국지<br>영웅 키우기</b>
    </div>
    <button class="btn primary title-start">출&nbsp;&nbsp;정</button>`;
  document.body.appendChild(el);

  const done = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    onStart?.();
  };
  el.querySelector('.title-start').addEventListener('click', done, { once: true });
}
