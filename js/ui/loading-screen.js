// 로딩 화면 — 앱 첫 진입에 ~2초. 24명의 영웅 컷아웃이 우르르 모여들고, 금빛 명조 타이틀이 떠오른다.
// (아트는 이미 번들된 assets/heroes-cut/*.png 를 합성 — 오프라인 보장·실제 영웅·또렷한 글자)

import { HEROES } from '../data/heroes.js';

export function showLoading(done, ms = 2000) {
  const el = document.createElement('div');
  el.id = 'loading-screen';

  // 등급 높은 순 — 전설이 앞줄 중앙에 먼저 선다(가장 먼저 튀어 오른다)
  const ids = [...HEROES].sort((a, b) => b.rarity - a.rarity);
  const crowd = ids
    .map(
      (h, i) =>
        `<img class="load-hero r${h.rarity}" src="./assets/heroes-cut/${h.id}.png" alt="" draggable="false" style="--i:${i}">`
    )
    .join('');

  el.innerHTML = `
    <div class="load-sky" aria-hidden="true" style="background-image:url('./assets/bg/loading.png')"></div>
    <div class="load-title">
      <em class="load-eyebrow">천하통일</em>
      <b class="load-logo">삼국지</b>
      <span class="load-sub">랜덤 디펜스</span>
    </div>
    <div class="load-crowd" aria-hidden="true">${crowd}</div>
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
