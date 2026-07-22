// 타이틀 화면 — v135 프리미엄 리디자인: 기병 키아트 위로 금빛 각인 로고 + 회전 빛살 + 붉은 천하 인장 +
// 떠오르는 불티 + 광택 스윕 CTA. 게임을 '하고 싶게' 만드는 첫 화면(수석 지시).
// (첫 터치 = 오디오 정책 해제·풀스크린과 겹치므로, 누른 즉시 BGM/몰입모드가 켜진다)
// opts.plays가 주어지면 '남은 도전 N회'를 표시한다. 이어하기 버튼은 없다(저장 시 자동 이어서).

import { APP_VERSION } from '../version.js';

export function showTitle(onStart, opts = {}) {
  const el = document.createElement('div');
  el.id = 'title-screen';
  const playsLine = opts.plays != null ? `<div class="title-plays">남은 도전 <b>${opts.plays}</b>회</div>` : '';
  el.innerHTML = `
    <canvas class="title-embers" aria-hidden="true"></canvas>
    <div class="title-glow" aria-hidden="true"></div>
    <div class="title-vign" aria-hidden="true"></div>
    <div class="title-body">
      <em class="title-eyebrow">운빨로 <b>천하통일</b></em>
      <b class="title-brand"><span class="l1">삼국지</span><span class="l2">랜덤 디펜스</span></b>
      <p class="title-tag">운이 곧 전략이다. 뽑고 · 합치고 · 천하를 지켜라.</p>
      <div class="title-actions">
        <button class="title-start">전투 시작 <span class="title-chev" aria-hidden="true">▶</span></button>
        ${playsLine}
      </div>
    </div>
    <span class="title-version">${APP_VERSION}</span>`;
  (document.getElementById('viewport') || document.body).appendChild(el); // v121: 강제 가로 회전 대상 안으로

  const stopEmbers = startEmbers(el.querySelector('.title-embers'));

  const done = () => {
    // 2026-07-22 수석: 브라우저 풀스크린 API 자동 요청 제거(전체화면 알림이 자꾸 떠 거슬림). 몰입은 설치형 PWA로.
    stopEmbers();
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    onStart?.();
  };
  el.querySelector('.title-start').addEventListener('click', done, { once: true });
}

// 떠오르는 불티 파티클 — 가벼운 캔버스 rAF 루프. 반환한 stop()으로 정리(누수 방지).
function startEmbers(cv) {
  if (!cv || !cv.getContext) return () => {};
  const g = cv.getContext('2d');
  let W = 1, H = 1, parts = [], raf = 0, t = 0, alive = true;
  const spawn = () => ({
    x: Math.random() * W, y: H + Math.random() * H * 0.4, r: Math.random() * 1.8 + 0.6,
    vy: -(Math.random() * 0.5 + 0.25), vx: (Math.random() - 0.5) * 0.25, a: Math.random() * 0.6 + 0.3, tw: Math.random() * 6,
  });
  const resize = () => {
    W = cv.width = cv.clientWidth || 640; H = cv.height = cv.clientHeight || 360;
    parts = Array.from({ length: Math.max(24, Math.round(W * H / 26000)) }, spawn);
  };
  resize();
  const loop = () => {
    if (!alive) return;
    t += 0.03; g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.y += p.vy; p.x += p.vx + Math.sin(t + p.tw) * 0.12;
      if (p.y < -10) Object.assign(p, spawn());
      const fl = 0.6 + 0.4 * Math.sin(t * 2 + p.tw);
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7);
      g.fillStyle = `rgba(255,${170 + Math.round(50 * fl)},90,${p.a * fl})`;
      g.shadowColor = 'rgba(255,150,60,0.9)'; g.shadowBlur = 6; g.fill();
    }
    g.shadowBlur = 0;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; if (raf) cancelAnimationFrame(raf); };
}
