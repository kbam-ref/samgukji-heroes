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
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  const life = reducedMotion ? 400 : 900;
  setTimeout(() => el.remove(), life);
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
