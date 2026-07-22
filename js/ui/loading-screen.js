// 로딩 화면 — 앱 첫 진입 ~2초. 타이틀과 같은 프리미엄 룩(기병 키아트 + 금 각인 로고 + 회전 빛살 +
// 붉은 천하 인장 + 떠오르는 불티) 위로 진행 바가 채워진다. (아트는 번들된 assets/ui/title-art.png — 오프라인)

export function showLoading(done, ms = 2000) {
  const el = document.createElement('div');
  el.id = 'loading-screen';
  el.innerHTML = `
    <div class="load-sky" aria-hidden="true" style="background-image:url('./assets/ui/title-art.png')"></div>
    <div class="title-glow" aria-hidden="true"></div>
    <div class="load-scrim" aria-hidden="true"></div>
    <canvas class="title-embers" aria-hidden="true"></canvas>
    <div class="load-title">
      <em class="load-eyebrow">운빨로 <b>천하통일</b></em>
      <b class="load-logo"><span class="l1">삼국지</span><span class="l2">랜덤 디펜스</span></b>
    </div>
    <div class="load-foot">
      <div class="load-bar"><i class="load-fill"></i></div>
      <p class="load-note">천하의 영웅을 불러 모으는 중…</p>
    </div>`;
  (document.getElementById('viewport') || document.body).appendChild(el); // v121: 강제 가로 회전 대상 안으로

  const stopEmbers = startEmbers(el.querySelector('.title-embers'));

  setTimeout(() => {
    stopEmbers();
    el.classList.add('out');
    setTimeout(() => el.remove(), 460);
    done?.();
  }, ms);
}

// 떠오르는 불티 — 타이틀과 동일한 가벼운 캔버스 rAF 루프. stop()으로 정리(누수 방지).
function startEmbers(cv) {
  if (!cv || !cv.getContext) return () => {};
  const g = cv.getContext('2d');
  let W = 1, H = 1, parts = [], raf = 0, t = 0, alive = true;
  const spawn = () => ({
    x: Math.random() * W, y: H + Math.random() * H * 0.4, r: Math.random() * 1.8 + 0.6,
    vy: -(Math.random() * 0.5 + 0.25), vx: (Math.random() - 0.5) * 0.25, a: Math.random() * 0.6 + 0.3, tw: Math.random() * 6,
  });
  W = cv.width = cv.clientWidth || 640; H = cv.height = cv.clientHeight || 360;
  parts = Array.from({ length: Math.max(24, Math.round(W * H / 26000)) }, spawn);
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
