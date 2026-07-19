// 소리·진동 — 외부 에셋 금지 규약에 따라 Web Audio로 전부 합성한다.
// 가야금(현 뜯기 물리 합성)·북·징으로 국악풍 BGM을 즉석 연주하고, 효과음도 같은 악기로 만든다.
// 브라우저 정책상 첫 터치 이후에만 소리를 낼 수 있다.

import { getState } from '../core/state.js';
import { on } from '../core/events.js';

let ctx = null;
let sfxGain = null;
let musicGain = null;

// ── 초기화 ─────────────────────────────────────────────

/** 첫 사용자 입력에서 오디오 컨텍스트를 연다. 부팅 시 한 번 호출. */
export function initSound() {
  const arm = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.9;
        sfxGain.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.55;
        musicGain.connect(ctx.destination);
        if (musicEnabled()) startMusic();
      } catch {
        ctx = null;
      }
    }
    if (ctx?.state === 'suspended') ctx.resume();
    document.removeEventListener('pointerdown', arm);
  };
  document.addEventListener('pointerdown', arm);

  // 설정 토글에 즉시 반응
  on('setting', ({ key }) => {
    if (key === 'music' || key === 'sound') {
      if (musicEnabled()) startMusic();
      else stopMusic();
    }
  });
}

function soundOn() {
  return getState()?.settings?.sound !== false;
}
function musicEnabled() {
  return soundOn() && getState()?.settings?.music !== false;
}

// ── 악기 — 가야금(캐플러스-스트롱 현 합성)·북·징 ──────────

const pluckCache = new Map();

/** 뜯은 현의 파형을 물리 합성해 버퍼로 만든다 (음높이별 1회 계산 후 캐시) */
function pluckBuffer(freq) {
  const key = Math.round(freq);
  if (pluckCache.has(key)) return pluckCache.get(key);
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const len = Math.round(sr * 1.3);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % N;
    ring[idx] = (ring[idx] + ring[next]) * 0.5 * 0.996; // 감쇠 — 현이 잦아든다
    data[i] = ring[idx];
    idx = next;
  }
  pluckCache.set(key, buf);
  return buf;
}

/** 가야금 한 음 */
function pluck(freq, time, vol = 0.2, dest = musicGain) {
  if (!ctx || !dest) return;
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(freq);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 1.2);
  src.connect(lp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + 1.25);
}

/** 북 — 낮은 울림 + 가죽 두드림 */
function drum(time, vol = 0.5, pitch = 68, dest = musicGain) {
  if (!ctx || !dest) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitch, time);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.55, time + 0.22);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + 0.3);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vol * 0.5, time);
  ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
  noise.connect(lp).connect(ng).connect(dest);
  noise.start(time);
  noise.stop(time + 0.08);
}

/** 징 — 길게 우는 금속 */
function gong(time, vol = 0.2, dest = musicGain) {
  if (!ctx || !dest) return;
  for (const [f, v, d] of [[196, 1, 2.6], [247.5, 0.55, 2.2], [294, 0.4, 1.8], [392.4, 0.3, 1.4], [588, 0.18, 1.0]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.004), time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol * v, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + d);
    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + d + 0.05);
  }
}

let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  const sr = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, sr * 0.5, sr);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** 바람 가르는 소리 — 짧은 노이즈 스윕 (타격·베기) */
function whoosh(time, vol = 0.15, from = 1800, to = 300, dur = 0.09, dest = sfxGain) {
  if (!ctx || !dest) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(from, time);
  bp.frequency.exponentialRampToValueAtTime(to, time + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(bp).connect(g).connect(sfxGain);
  src.start(time);
  src.stop(time + dur + 0.02);
}

/** 대금풍 — 떨림(비브라토) 있는 긴 음 */
function flute(freq, time, dur = 0.7, vol = 0.08) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, time);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = freq * 0.012;
  lfo.connect(lfoGain).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol, time + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g).connect(sfxGain);
  osc.start(time);
  lfo.start(time);
  osc.stop(time + dur + 0.05);
  lfo.stop(time + dur + 0.05);
}

// ── BGM 시퀀서 — 계면조 5음계 즉흥 (같은 곡이 두 번 흐르지 않는다) ──

const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]; // A3 C4 D4 E4 G4 A4 C5
let musicOn = false;
let bossMood = false;
let nextNoteTime = 0;
let beat = 0;
let melIdx = 3;
let schedTimer = null;

function scheduleBeat(t, b, eighth8) {
  const e = b % 8;
  const bar = Math.floor(b / 8);

  // 북 장단 — 몰아치는 기본 박 (자진모리처럼 끊기지 않는 드라이브)
  if (e === 0) drum(t, 0.5, 62);
  if (e === 3) drum(t, 0.26, 88);
  if (e === 4) drum(t, 0.4, 64);
  if (e === 6) drum(t, 0.24, 88);
  if (bossMood && (e === 1 || e === 5)) drum(t, 0.16, 104); // 보스전 — 겹박

  // 4마디마다 몰아붙이는 잔가락 (따다닥)
  if (bar % 4 === 3 && e === 7) {
    drum(t, 0.26, 92);
    drum(t + eighth8 * 0.5, 0.3, 84);
    drum(t + eighth8 * 0.75, 0.36, 70);
  }

  // 저음 현 — 심장 박동처럼 근음이 계속 뛴다
  if (e === 0) pluck(110, t, 0.17);
  if (e === 4) pluck(bar % 2 ? 130.81 : 110, t, 0.14);
  if (bossMood && e === 2) pluck(82.41, t, 0.12); // 보스전 — 더 낮은 현까지

  // 가야금 선율 — 촘촘한 걸음 + 시김새, 가끔 두 음 몰아치기
  if ((e === 2 || e === 5 || e === 7) && Math.random() < (bossMood ? 0.85 : 0.7)) {
    const step = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
    melIdx = Math.max(0, Math.min(SCALE.length - 1, melIdx + step));
    if (Math.random() < 0.2 && melIdx > 0) pluck(SCALE[melIdx - 1], t, 0.07); // 꾸밈음
    pluck(SCALE[melIdx], t + 0.04, 0.14);
    if (Math.random() < 0.3) {
      const next = Math.max(0, Math.min(SCALE.length - 1, melIdx + (Math.random() < 0.5 ? 1 : -1)));
      pluck(SCALE[next], t + eighth8 * 0.5, 0.1); // 반 박 뒤 따라붙는 음
    }
  }

  // 징 — 여덟 마디마다, 보스전엔 네 마디마다
  if (b > 0 && b % (bossMood ? 32 : 64) === 0) gong(t, 0.11);
}

function scheduler() {
  if (!ctx || !musicOn) return;
  const tempo = bossMood ? 118 : 96;
  const half = 60 / tempo / 2; // 8분음표
  while (nextNoteTime < ctx.currentTime + 0.5) {
    scheduleBeat(nextNoteTime, beat, half);
    nextNoteTime += half;
    beat += 1;
  }
}

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  nextNoteTime = ctx.currentTime + 0.15;
  beat = 0;
  schedTimer = setInterval(scheduler, 120);
}

export function stopMusic() {
  musicOn = false;
  if (schedTimer) clearInterval(schedTimer);
  schedTimer = null;
}

/** 보스전 분위기 — 북이 촘촘해지고 걸음이 빨라진다 */
export function setBgmMood(boss) {
  bossMood = Boolean(boss);
}

// ── 효과음 ─────────────────────────────────────────────

export function play(kind) {
  if (!ctx || !soundOn()) return;
  const t = ctx.currentTime;
  switch (kind) {
    case 'tap':    pluck(SCALE[4 + Math.floor(Math.random() * 3)] * 2, t, 0.06, sfxGain); break;
    case 'hit':    whoosh(t, 0.12, 2200, 500, 0.07); drum(t + 0.02, 0.16, 120, sfxGain); break;
    case 'foehit': whoosh(t, 0.09, 900, 220, 0.05); drum(t + 0.02, 0.18, 66, sfxGain); break; // 적의 일격 — 둔탁하게
    case 'kill':   whoosh(t, 0.16, 1600, 260, 0.1); drum(t + 0.03, 0.3, 90, sfxGain); break;
    case 'clear':  drum(t, 0.4, 70, sfxGain); pluck(SCALE[2] * 2, t + 0.08, 0.14, sfxGain); pluck(SCALE[4] * 2, t + 0.18, 0.14, sfxGain); pluck(SCALE[6] * 2, t + 0.28, 0.16, sfxGain); break;
    case 'legend': gong(t, 0.24, sfxGain); flute(784, t + 0.12, 0.8, 0.07); pluck(SCALE[6] * 2, t + 0.3, 0.18, sfxGain); break;
    case 'epic':   gong(t, 0.13, sfxGain); pluck(SCALE[5] * 2, t + 0.1, 0.14, sfxGain); break;
    case 'claim':  pluck(SCALE[5] * 2, t, 0.12, sfxGain); pluck(SCALE[6] * 2, t + 0.08, 0.14, sfxGain); break;
    case 'wipe':   whoosh(t, 0.14, 700, 120, 0.35); drum(t + 0.05, 0.35, 52, sfxGain); break;
    case 'rival':  drum(t, 0.4, 58, sfxGain); drum(t + 0.18, 0.4, 52, sfxGain); flute(392, t + 0.1, 0.5, 0.05); break;
    case 'combo':  drum(t, 0.34, 76, sfxGain); drum(t + 0.11, 0.34, 76, sfxGain); drum(t + 0.22, 0.42, 66, sfxGain); pluck(SCALE[6] * 2, t + 0.3, 0.16, sfxGain); break;
    case 'drum':   drum(t, 0.4, 70, sfxGain); drum(t + 0.22, 0.4, 70, sfxGain); drum(t + 0.48, 0.5, 58, sfxGain); break;
    case 'omen':   gong(t, 0.11, sfxGain); flute(523, t + 0.05, 0.6, 0.04); break;
    case 'chapter': gong(t, 0.18, sfxGain); drum(t + 0.1, 0.4, 62, sfxGain); flute(587, t + 0.24, 0.9, 0.05); pluck(SCALE[4] * 2, t + 0.5, 0.16, sfxGain); break; // 장 개막 — 징이 울리고 피리가 연다

  }
}

export function vibrate(ms = 15) {
  if (getState()?.settings?.vibrate === false) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}
