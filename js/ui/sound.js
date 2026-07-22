// 소리·진동 — 외부 에셋 금지 규약에 따라 Web Audio로 전부 합성한다.
// 가야금(현 뜯기 물리 합성)·북·징으로 국악풍 BGM을 즉석 연주하고, 효과음도 같은 악기로 만든다.
// 브라우저 정책상 첫 터치 이후에만 소리를 낼 수 있다.

import { getState } from '../core/state.js';
import { on } from '../core/events.js';
import { initAudioAssets, hasSample, playSample, startBgm, switchBgm, stopBgm, bgmActive } from './audio.js';

let ctx = null;
let sfxGain = null;
let musicGain = null;
let assetsReady = false; // ElevenLabs 등으로 만든 오디오 파일이 하나라도 로드됐는가

// ── 초기화 ─────────────────────────────────────────────

/** 첫 사용자 입력에서 오디오 컨텍스트를 연다. 부팅 시 한 번 호출. */
export function initSound() {
  const arm = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.9;
        // 감사 2026-07-22: SFX 버스에 리미터 — 보스/영웅 멘트의 큰 게인(>1)에도 하드클립(찢어짐) 없이 또렷하게.
        const sfxLimiter = ctx.createDynamicsCompressor();
        sfxLimiter.threshold.value = -4; sfxLimiter.knee.value = 6; sfxLimiter.ratio.value = 10;
        sfxLimiter.attack.value = 0.003; sfxLimiter.release.value = 0.15;
        sfxGain.connect(sfxLimiter); sfxLimiter.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.55;
        musicGain.connect(ctx.destination);
        // 번들된 오디오 파일(ElevenLabs 등)이 있으면 불러온다 — 로드되면 합성음 대신 그걸 쓴다.
        // 비동기라, 로드 끝난 뒤 음악이 켜져 있으면 파일 BGM으로 다시 시작한다.
        initAudioAssets(ctx, { sfx: sfxGain, music: musicGain })
          .then((n) => {
            assetsReady = n > 0;
            if (assetsReady && musicEnabled()) startMusic(); // 파일 BGM으로 승격
          })
          .catch(() => {});
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

  // 백그라운드(홈 버튼 등)로 나가면 오디오를 즉시 멈춘다 — 설치형 PWA는 기기에 따라
  // 백그라운드에서도 소리가 계속 난다. 컨텍스트를 통째로 suspend하면 BGM·효과음이
  // 그 자리에서 멎고(타이밍도 정지), 돌아오면 이어서 재생된다.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') ctx.suspend();
    } else if (ctx.state === 'suspended' && soundOn()) {
      ctx.resume();
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

// ── 전투 타격음 — 적의 갑주·무기에 따라 다른 소리 (외부 에셋 없이 합성) ──

/** 쇳소리 — 검이 갑옷·칼에 부딪는 금속 충돌 (여러 배음 + 짧은 노이즈 트랜지언트) */
function clang(time, vol = 0.16, dest = sfxGain) {
  if (!ctx || !dest) return;
  // 금속의 비조화 배음 — 살짝 어긋난 고음들이 '쨍'
  for (const [f, v, d] of [[2100, 1, 0.18], [3170, 0.6, 0.14], [4300, 0.4, 0.1], [5600, 0.25, 0.08]]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.02), time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol * v, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + d);
    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + d + 0.02);
  }
  // 부딪는 순간의 딱딱한 트랜지언트
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2600;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vol * 0.5, time);
  ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
  src.connect(hp).connect(ng).connect(dest);
  src.start(time);
  src.stop(time + 0.05);
}

/** 둔탁한 타격 — 천·나무·살(무장 없는 잡졸) : 쇳소리 없이 묵직한 '퍽' */
function thud(time, vol = 0.18, dest = sfxGain) {
  if (!ctx || !dest) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
  src.connect(lp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + 0.12);
  // 나무 막대가 부딪는 낮은 톡
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(90, time + 0.08);
  const og = ctx.createGain();
  og.gain.setValueAtTime(vol * 0.7, time);
  og.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
  osc.connect(og).connect(dest);
  osc.start(time);
  osc.stop(time + 0.11);
}

/** 원시적 타격 — 가죽·뼈(남만) : 가죽 북 같은 둔탁함 + 뼈 부딪는 딱 */
function hideHit(time, vol = 0.18, dest = sfxGain) {
  if (!ctx || !dest) return;
  thud(time, vol * 0.8, dest);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(620, time);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol * 0.5, time + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + 0.06);
}

/** 말발굽 — 행군 중 부대가 달리는 저벅저벅 (2연타로 '다그닥') */
function hoof(time, vol = 0.09, dest = sfxGain) {
  if (!ctx || !dest) return;
  for (const off of [0, 0.06]) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 160;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * (off ? 0.8 : 1), time + off);
    g.gain.exponentialRampToValueAtTime(0.0001, time + off + 0.05);
    src.connect(bp).connect(g).connect(dest);
    src.start(time + off);
    src.stop(time + off + 0.06);
  }
}

let lastHitAt = 0;
/** 아군의 타격 — 적의 갑주 종류(profile)에 따라 소리가 다르다. 강타는 크게, 평타는 솎아낸다. */
export function playHit(profile = 'armor', { heavy = false } = {}) {
  if (!ctx || !soundOn()) return;
  const t = ctx.currentTime;
  // 초당 여러 타여도 소리벽이 되지 않게 평타는 살짝 솎는다 (강타는 항상)
  if (!heavy && t - lastHitAt < 0.085) return;
  lastHitAt = t;
  // 파일 효과음(hit-<profile>)이 있으면 그걸 쓴다 — 강타는 조금 크게
  if (assetsReady && playSample(`hit-${profile}`, { gain: heavy ? 1 : 0.7 })) return;
  const v = heavy ? 1 : 0.5;
  whoosh(t, 0.1 * v, 2100, 420, 0.06); // 칼이 지나는 바람
  switch (profile) {
    case 'cloth': thud(t + 0.016, 0.17 * v); break;                                   // 황건적 등 잡졸
    case 'hide':  hideHit(t + 0.016, 0.19 * v); break;                                // 남만
    case 'heavy': clang(t + 0.02, 0.17 * v); drum(t + 0.02, 0.22 * v, 58, sfxGain); break; // 우두머리
    case 'blade': clang(t + 0.014, 0.2 * v); whoosh(t + 0.05, 0.08 * v, 3200, 900, 0.05); break; // 숙적(검 대 검)
    case 'armor':
    default:      clang(t + 0.016, 0.16 * v); break;                                  // 갑옷 병사
  }
  if (heavy) drum(t + 0.03, 0.12, 118, sfxGain); // 강타엔 무게를 더한다
}

/** 적의 반격 — 아군이 막아내는 둔탁한 충돌(방패·몸받이). 우두머리는 더 묵직하게. */
export function playFoeStrike(boss = false) {
  if (!ctx || !soundOn()) return;
  if (assetsReady && playSample('foe-strike', { gain: boss ? 1 : 0.7 })) return;
  const t = ctx.currentTime;
  thud(t, boss ? 0.22 : 0.13, sfxGain);
  if (boss) drum(t + 0.02, 0.2, 52, sfxGain);
}

/** 말발굽 — 행군 중 호출 (battle-screen 먼지 틱과 함께) */
export function playHoof() {
  if (!ctx || !soundOn()) return;
  hoof(ctx.currentTime, 0.08);
}

// ── BGM 시퀀서 — 계면조 5음계 즉흥 (같은 곡이 두 번 흐르지 않는다) ──

const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]; // A3 C4 D4 E4 G4 A4 C5
let musicOn = false;
let bossMood = false;
let nextNoteTime = 0;
let beat = 0;
let melIdx = 3;
let fluteIdx = 4;
let schedTimer = null;

/** 대금풍 topline — 배경음악에 사극의 애수를 얹는 긴 떨림음 (musicGain으로 라우팅) */
function musicFlute(freq, time, dur = 1.4, vol = 0.06) {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, time);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.8;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = freq * 0.011;
  lfo.connect(lfoGain).connect(osc.frequency);
  const lp = ctx.createBiquadFilter(); // 숨결처럼 부드럽게
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol, time + 0.18); // 천천히 불어 넣고
  g.gain.setValueAtTime(vol, time + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur); // 길게 사라진다
  osc.connect(lp).connect(g).connect(musicGain);
  osc.start(time);
  lfo.start(time);
  osc.stop(time + dur + 0.05);
  lfo.stop(time + dur + 0.05);
}

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
    // 5음계 화성 — 4도/5도 위 현을 살짝 겹쳐 울림을 두껍게 (세련미)
    if (Math.random() < 0.22) {
      const harm = Math.min(SCALE.length - 1, melIdx + (Math.random() < 0.5 ? 2 : 3));
      pluck(SCALE[harm], t + 0.05, 0.06);
    }
  }

  // 대금 topline — 두 마디마다 한 소절, 사극의 애수 (보스전엔 더 자주·팽팽하게)
  if (e === 0 && bar % (bossMood ? 1 : 2) === 0) {
    const stepUp = [-1, 0, 0, 1, 1, 2][Math.floor(Math.random() * 6)];
    fluteIdx = Math.max(2, Math.min(SCALE.length - 1, fluteIdx + stepUp));
    musicFlute(SCALE[fluteIdx] * (bossMood ? 1 : 0.5) * 2, t + 0.05, bossMood ? 1.1 : 1.7, bossMood ? 0.05 : 0.06);
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
  if (!ctx) return;
  // 파일 BGM이 있으면 그걸 루프한다 (합성 시퀀서는 끈다)
  if (assetsReady && startBgm(bossMood ? 'bgm-boss' : 'bgm-field')) {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    musicOn = false;
    return;
  }
  // 폴백 — 합성 국악 시퀀서
  if (musicOn) return;
  musicOn = true;
  nextNoteTime = ctx.currentTime + 0.15;
  beat = 0;
  schedTimer = setInterval(scheduler, 120);
}

export function stopMusic() {
  musicOn = false;
  if (schedTimer) clearInterval(schedTimer);
  schedTimer = null;
  stopBgm();
}

/** 보스전 분위기 — 파일 BGM이면 곡을 바꾸고, 합성음이면 북을 촘촘하게 */
export function setBgmMood(boss) {
  bossMood = Boolean(boss);
  if (bgmActive()) switchBgm(boss ? 'bgm-boss' : 'bgm-field');
}

// ── 효과음 ─────────────────────────────────────────────

export function play(kind) {
  if (!ctx || !soundOn()) return;
  if (ctx.state === 'suspended') ctx.resume(); // 백그라운드 복귀 후 첫 소리에서 안전하게 재개

  // 파일 효과음이 있으면 그걸 우선. 2026-07-22 수석: 보스/영웅 멘트는 크게, 사망음은 살짝 줄여 멘트가 묻히지 않게.
  if (assetsReady) {
    if (kind.startsWith('boss-voice-') || kind.startsWith('hero-voice-')) { if (playSample(kind, { gain: 2.4 })) return; }
    else if (kind.startsWith('death-')) { if (playSample(kind, { gain: 0.6 })) return; }
    else if (playSample(kind)) return;
  }
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
    case 'boss':   gong(t, 0.2, sfxGain); drum(t + 0.05, 0.45, 50, sfxGain); drum(t + 0.32, 0.5, 44, sfxGain); flute(330, t + 0.14, 0.9, 0.06); break; // 보스 출현 — 징이 울리고 낮은 북이 몰아친다
    case 'danger': whoosh(t, 0.1, 2600, 900, 0.06); drum(t, 0.32, 96, sfxGain); drum(t + 0.14, 0.34, 104, sfxGain); break; // 패배 임박 — 다급한 경보 북

    case 'chapter': gong(t, 0.18, sfxGain); drum(t + 0.1, 0.4, 62, sfxGain); flute(587, t + 0.24, 0.9, 0.05); pluck(SCALE[4] * 2, t + 0.5, 0.16, sfxGain); break; // 장 개막 — 징이 울리고 피리가 연다

  }
}

export function vibrate(ms = 15) {
  if (getState()?.settings?.vibrate === false) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}
