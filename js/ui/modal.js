// 공용 모달 — 복귀 보상, 확인 창 등

let currentCleanup = null; // 교체될 이전 모달의 popstate 리스너 정리
let modalOpen = false;     // 히스토리 sentinel은 '모달 있음' 동안 딱 1개만 유지 (1-8)

export function showModal({ title, body, actions = [], dismissible = true }) {
  const root = document.getElementById('modal-root');
  // 이전 모달을 innerHTML로 교체하기 전에 그 popstate 리스너부터 정리(누적 방지)
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }
  root.innerHTML = '';
  document.body.classList.add('modal-open'); // 모달이 떠 있는 동안 하단 탭을 감춘다 (겹침 방지)

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', title);

  const heading = document.createElement('h3');
  heading.className = 'modal-title';
  heading.textContent = title;
  panel.appendChild(heading);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (typeof body === 'string') bodyEl.textContent = body;
  else if (body) bodyEl.appendChild(body);
  panel.appendChild(bodyEl);

  // 폰 뒤로가기 = 뒤의 탭을 바꾸지 말고 이 모달을 닫는다 (1-8).
  // 모달이 없던 상태에서 열 때만 히스토리에 한 칸 쌓고, 마지막 닫을 때 소비한다.
  // (모달 교체는 sentinel을 재사용 — 중복으로 쌓지 않는다)
  const pushedSentinel = !modalOpen;
  if (pushedSentinel) {
    try { history.pushState({ modal: true }, ''); } catch { /* file:// 등 */ }
  }
  modalOpen = true;

  const onPop = () => {
    if (!dismissible) {
      // 닫을 수 없는 모달(복귀 보상 등)은 뒤로가기로 못 닫는다 — 다시 한 칸 쌓아 지킨다
      try { history.pushState({ modal: true }, ''); } catch { /* noop */ }
      return;
    }
    close({ fromPop: true });
  };
  window.addEventListener('popstate', onPop);
  currentCleanup = () => window.removeEventListener('popstate', onPop);

  const close = ({ fromPop = false } = {}) => {
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    window.removeEventListener('popstate', onPop);
    currentCleanup = null;
    modalOpen = false;
    // 버튼/백드롭으로 닫았으면 우리가 쌓은 히스토리 칸을 되돌려 소비한다
    if (!fromPop) {
      try { history.back(); } catch { /* noop */ }
    }
  };

  if (actions.length > 0) {
    const row = document.createElement('div');
    row.className = 'modal-actions';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.className = action.primary ? 'btn primary' : 'btn';
      btn.textContent = action.label;
      if (action.disabled) {
        btn.disabled = true; // 재화 부족 등 — 실행 자체가 불가한 액션 (1-3)
      } else {
        btn.addEventListener('click', () => {
          if (action.onClick) action.onClick();
          close();
        });
      }
      row.appendChild(btn);
    }
    panel.appendChild(row);
  }

  if (dismissible) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  }

  backdrop.appendChild(panel);
  root.appendChild(backdrop);
  return close;
}
