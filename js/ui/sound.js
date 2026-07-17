// 소리·진동 — 외부 에셋 금지 규약에 따라 Web Audio로 전부 합성한다.
// 브라우저 정책상 첫 터치 이후에만 소리를 낼 수 있다.

import { getState } from '../core/state.js';

let ctx = null;

/** 첫 사용자 입력에서 오디오 컨텍스트를 연다. 부팅 시 한 번 호출. */
export function initSound() {
  const arm = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    document.removeEventListener('pointerdown', arm);
  };
  document.addEventListener('pointerdown', arm);
}

function soundOn() {
  return getState()?.settings?.sound !== false;
}

function tone(freq, dur, type = 'square', vol = 0.04, delay = 0, glideTo = 0) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo > 0) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function play(kind) {
  if (!ctx || !soundOn()) return;
  switch (kind) {
    case 'tap':    tone(660, 0.06, 'square', 0.03); break;
    case 'kill':   tone(220, 0.09, 'sawtooth', 0.028, 0, 120); break;
    case 'clear':  tone(523, 0.09, 'triangle', 0.05); tone(659, 0.09, 'triangle', 0.05, 0.09); tone(784, 0.16, 'triangle', 0.05, 0.18); break;
    case 'legend': tone(392, 0.55, 'triangle', 0.06, 0, 784); tone(196, 0.55, 'sine', 0.05, 0.05); break;
    case 'claim':  tone(880, 0.07, 'square', 0.04); tone(1174, 0.11, 'square', 0.04, 0.07); break;
    case 'wipe':   tone(196, 0.32, 'sawtooth', 0.04, 0, 98); break;
    case 'rival':  tone(110, 0.4, 'sawtooth', 0.05, 0, 82); tone(220, 0.3, 'triangle', 0.04, 0.12); break;
    case 'epic':   tone(494, 0.18, 'triangle', 0.05, 0, 740); break;
    case 'combo':  tone(262, 0.1, 'sawtooth', 0.05); tone(392, 0.1, 'sawtooth', 0.05, 0.08); tone(523, 0.16, 'triangle', 0.06, 0.16); break;
    case 'drum':   tone(90, 0.16, 'sine', 0.09); tone(90, 0.16, 'sine', 0.09, 0.22); tone(72, 0.24, 'sine', 0.1, 0.44); break;
    case 'omen':   tone(784, 0.55, 'sine', 0.035, 0, 392); break;
  }
}

export function vibrate(ms = 15) {
  if (getState()?.settings?.vibrate === false) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}
