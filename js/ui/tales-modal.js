// 열전 모달 — 깃발과 대사만으로 흐르는 짧은 이야기

import { showModal } from './modal.js';
import * as talesSys from '../systems/tales.js';
import { fmt } from './format.js';
import { play } from './sound.js';

const FACTION_BAND = { wei: '#56749f', shu: '#567f52', wu: '#a85048', free: '#7e7668' };

export function openTale(entry) {
  const { tale } = entry;
  let idx = 0;

  const body = document.createElement('div');
  body.className = 'tale-body';

  const renderScene = () => {
    const scene = tale.scenes[idx];
    const last = idx === tale.scenes.length - 1;
    body.innerHTML = `
      <div class="tale-scene">
        ${scene.speaker
          ? `<span class="tale-flag" style="background: linear-gradient(178deg, ${FACTION_BAND[scene.faction] ?? '#575143'}, #201b15);">${scene.speaker}</span>`
          : ''}
        <p class="tale-line">${scene.line}</p>
      </div>
      <div class="tale-nav">
        <span class="tale-step">${idx + 1} / ${tale.scenes.length}</span>
        <button class="btn primary tale-next">${last ? '마무리' : '다음'}</button>
      </div>`;

    body.querySelector('.tale-next').addEventListener('click', () => {
      if (!last) {
        idx += 1;
        renderScene();
        return;
      }
      const jade = talesSys.finishTale(tale.id);
      if (jade > 0) {
        play('claim');
        body.innerHTML = `<p class="tale-done">이야기가 깃발에 새겨졌다.<br>옥구슬 +${fmt(jade)} ‧ 인연이 깊어졌다 (+1%p)</p>`;
      } else {
        body.innerHTML = `<p class="tale-done">다시 읽어도 좋은 이야기다.</p>`;
      }
    });
  };

  renderScene();
  showModal({ title: `열전 ‧ ${tale.title}`, body, actions: [{ label: '닫기' }] });
}
