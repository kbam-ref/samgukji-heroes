// 로딩 화면 — 앱 첫 진입에 ~2초. 웅장한 키 아트(영웅 돌격 씬) 위로 금빛 로고와 진행 바가 떠오른다.
// 2026-07-22 수석: 치비 컷아웃 군중(징그러움) 제거 → 타이틀과 같은 시네마틱 키 아트 배경으로 고퀄 통일.
// (아트는 이미 번들된 assets/ui/title-art.png — 오프라인 보장)

export function showLoading(done, ms = 2000) {
  const el = document.createElement('div');
  el.id = 'loading-screen';
  el.innerHTML = `
    <div class="load-sky" aria-hidden="true" style="background-image:url('./assets/ui/title-art.png')"></div>
    <div class="load-scrim" aria-hidden="true"></div>
    <div class="load-title">
      <em class="load-eyebrow">운빨로 천하통일</em>
      <b class="load-logo">삼국지<br>랜덤 디펜스</b>
    </div>
    <div class="load-foot">
      <div class="load-bar"><i class="load-fill"></i></div>
      <p class="load-note">천하의 영웅을 불러 모으는 중…</p>
    </div>`;
  (document.getElementById('viewport') || document.body).appendChild(el); // v121: 강제 가로 회전 대상 안으로

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 460);
    done?.();
  }, ms);
}
