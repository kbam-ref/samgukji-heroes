// 번들된 오디오 파일(assets/audio/{id}.mp3)을 불러와 재생·루프한다.
// 파일은 tools/generate-audio.mjs(ElevenLabs)가 개발 시점에 만든다. 없으면 조용히 폴백 —
// sound.js가 hasSample()로 확인해 파일이 있으면 이걸 쓰고, 없으면 Web Audio 합성음을 쓴다.
// 런타임에 외부 요청은 없다(오프라인 보장): 로컬 정적 파일만 fetch/decode한다.

import { AUDIO_ASSETS } from '../data/audio-manifest.js';

let ac = null;             // AudioContext
let sfxDest = null;        // 효과음 출력 게인
let musicDest = null;      // 음악 출력 게인
const buffers = new Map(); // id → AudioBuffer (로드된 것만)

// 현재 흐르는 BGM
let bgmId = null;
let bgmSource = null;
let bgmGain = null;

/** 부팅 시 한 번 — 번들된 오디오를 best-effort로 불러와 디코드한다(있는 것만). */
export async function initAudioAssets(ctx, { sfx, music }) {
  ac = ctx;
  sfxDest = sfx;
  musicDest = music;
  await Promise.all(
    AUDIO_ASSETS.map(async (entry) => {
      try {
        const res = await fetch(`./assets/audio/${entry.id}.mp3`);
        if (!res.ok) return; // 아직 생성 안 됨 — 합성음으로 폴백
        const buf = await res.arrayBuffer();
        const decoded = await ac.decodeAudioData(buf);
        buffers.set(entry.id, decoded);
      } catch {
        /* 파일 없음·디코드 실패 — 조용히 폴백 */
      }
    })
  );
  return buffers.size;
}

export function hasSample(id) {
  return buffers.has(id);
}

/** 효과음 한 방 — 파일이 있을 때만 (없으면 호출자가 합성음으로 처리) */
export function playSample(id, { gain = 1, rate = 1 } = {}) {
  const buf = buffers.get(id);
  if (!buf || !ac || !sfxDest) return false;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(g).connect(sfxDest);
  src.start();
  return true;
}

/** BGM 루프 시작 — 파일이 있으면 true. 이미 같은 곡이면 유지. */
export function startBgm(id) {
  if (!buffers.has(id) || !ac || !musicDest) return false;
  if (bgmId === id && bgmSource) return true;
  stopBgm();
  bgmId = id;
  bgmSource = ac.createBufferSource();
  bgmSource.buffer = buffers.get(id);
  bgmSource.loop = true;
  bgmGain = ac.createGain();
  bgmGain.gain.value = 0.0001;
  bgmGain.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.8); // 부드럽게 페이드 인
  bgmSource.connect(bgmGain).connect(musicDest);
  bgmSource.start();
  return true;
}

/** 다른 BGM으로 교체 — 크로스페이드 (전장 ↔ 우두머리). 없으면 false. */
export function switchBgm(id) {
  if (!buffers.has(id)) return false;
  if (bgmId === id) return true;
  const old = bgmSource;
  const oldGain = bgmGain;
  if (oldGain && ac) {
    oldGain.gain.setValueAtTime(oldGain.gain.value, ac.currentTime);
    oldGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6);
    if (old) setTimeout(() => { try { old.stop(); } catch { /* noop */ } }, 700);
  }
  bgmSource = null;
  bgmGain = null;
  bgmId = null;
  return startBgm(id);
}

export function stopBgm() {
  if (bgmSource) {
    try { bgmSource.stop(); } catch { /* noop */ }
  }
  bgmSource = null;
  bgmGain = null;
  bgmId = null;
}

export function bgmActive() {
  return Boolean(bgmSource);
}
