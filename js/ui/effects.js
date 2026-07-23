// 연출 — 떠오르는 숫자, 카운트업, 맥동. "유저 입력에 침묵하는 UI는 버그"

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function fxLayer() {
  return document.getElementById('fx-layer');
}

/** 화면 좌표 (x, y)에서 글자가 떠올랐다 사라진다. */
export function floatText(x, y, text, cls = '') {
  const layer = fxLayer();
  if (!layer) return;
  if (layer.childElementCount > 40) return; // 저사양 보호 — 연출이 밀리면 건너뛴다
  const el = document.createElement('span');
  el.className = `float-text ${cls}`;
  el.textContent = text;
  // 강제 가로(90° 회전 레이어) — 뷰포트 기준 좌표를 회전 레이어 로컬로 매핑
  let px = x, py = y;
  if (document.body.classList.contains('force-rotate')) { px = y; py = window.innerWidth - x; }
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
  layer.appendChild(el);
  const life = reducedMotion ? 400 : 900;
  setTimeout(() => el.remove(), life);
}

/** 엽전이 획득 지점에서 상단 자원바로 날아간다 — "벌었다"가 몸으로 느껴지는 연출 */
export function flyCoins(x, y, n = 4) {
  if (reducedMotion) return;
  const layer = fxLayer();
  const target = document.querySelector('#res-coin svg');
  if (!layer || !target) return;
  if (layer.childElementCount > 40) return;
  const t = target.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'fly-coin';
    const sx = x + (Math.random() * 34 - 17);
    const sy = y + (Math.random() * 22 - 11);
    c.style.left = `${sx}px`;
    c.style.top = `${sy}px`;
    c.style.setProperty('--tx', `${t.left + t.width / 2 - sx}px`);
    c.style.setProperty('--ty', `${t.top + t.height / 2 - sy}px`);
    c.style.animationDelay = `${i * 45}ms`;
    layer.appendChild(c);
    setTimeout(() => c.remove(), 720 + i * 45);
  }
  // 도착하는 타이밍에 자원바가 살짝 부푼다
  setTimeout(() => pulse(document.getElementById('res-coin')), 480);
}

/** 요소의 숫자를 from → to로 굴려 올린다. */
export function countUp(el, from, to, { duration = 500, format = (v) => String(v) } = {}) {
  if (!el) return;
  if (reducedMotion || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** 짧은 맥동 — 값이 바뀐 요소에 준다. */
export function pulse(el, cls = 'pulse') {
  if (!el || reducedMotion) return;
  el.classList.remove(cls);
  void el.offsetWidth; // 애니메이션 재시작
  el.classList.add(cls);
}

/** 살짝 흔들기 — 실패(재화 부족 등) 반응. */
export function shake(el) {
  pulse(el, 'shake');
}

/** 재가 되어 흩어지는 파편 — 적이 쓰러진 자리에서. */
export function burst(x, y, { count = 7, color = '#b9ad94' } = {}) {
  const layer = fxLayer();
  if (!layer || reducedMotion) return;
  if (layer.childElementCount > 40) return; // 저사양 보호 — 연출이 밀리면 건너뛴다
  // 강제 가로(90° 회전 레이어) — 뷰포트 좌표를 회전 레이어 로컬로 매핑(floatText와 동일. 감사 2026-07-23: 미보정으로 어긋나던 것)
  if (document.body.classList.contains('force-rotate')) { const t = x; x = y; y = window.innerWidth - t; }
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.className = 'ash-bit';
    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 30;
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    bit.style.background = color;
    bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    bit.style.setProperty('--dy', `${Math.sin(angle) * dist - 14}px`);
    layer.appendChild(bit);
    setTimeout(() => bit.remove(), 700);
  }
}

/** 화면 전체 섬광 — 우두머리 처치 같은 큰 순간. */
export function flash(cls = 'gold') {
  const layer = fxLayer();
  if (!layer || reducedMotion) return;
  const el = document.createElement('div');
  el.className = `screen-flash ${cls}`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 450);
}
