// 공용 모달 — 복귀 보상, 확인 창 등

export function showModal({ title, body, actions = [], dismissible = true }) {
  const root = document.getElementById('modal-root');
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

  const close = () => {
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
  };

  if (actions.length > 0) {
    const row = document.createElement('div');
    row.className = 'modal-actions';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.className = action.primary ? 'btn primary' : 'btn';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        if (action.onClick) action.onClick();
        close();
      });
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
