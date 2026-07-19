// BGM·효과음 생성 — ElevenLabs로 삼국지 사극 오디오를 만들어 assets/audio/{id}.mp3 로 저장.
// 개발 PC에서만 실행한다. 게임은 이 정적 파일만 재생하고 런타임에 ElevenLabs를 호출하지 않는다
// (외부 의존성 금지·오프라인 보장 규약). 파일이 없으면 게임은 Web Audio 합성음으로 폴백한다.
//
// 사용법:
//   node tools/generate-audio.mjs                 ← 아직 없는 것만 전부
//   node tools/generate-audio.mjs --force         ← 있어도 다시 만든다
//   node tools/generate-audio.mjs --only bgm-field,hit-armor
//   node tools/generate-audio.mjs --sfx           ← 효과음만
//   node tools/generate-audio.mjs --bgm           ← BGM만
//
// 준비: .env 에 ELEVENLABS_API_KEY 를 채운다 (elevenlabs.io → API Keys).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_ASSETS } from '../js/data/audio-manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'audio');

// .env 로드 (커밋 금지 파일)
if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('.env 에 ELEVENLABS_API_KEY 를 채워 주세요. (elevenlabs.io → API Keys)');
  process.exit(1);
}
const MUSIC_MODEL = process.env.ELEVENLABS_MUSIC_MODEL || 'music_v1';

const BASE = 'https://api.elevenlabs.io/v1';

// ── 인자 파싱 ──
const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyBgm = args.includes('--bgm');
const onlySfx = args.includes('--sfx');
const onlyArg = args.find((a) => a.startsWith('--only'));
const onlyIds = onlyArg ? (onlyArg.split('=')[1] ?? args[args.indexOf(onlyArg) + 1] ?? '').split(',').filter(Boolean) : null;

/** ElevenLabs Sound Effects — 짧은 효과음. audio/mpeg 바이트를 돌려준다. */
async function genSfx(entry) {
  const res = await fetch(`${BASE}/sound-generation`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: entry.prompt,
      duration_seconds: entry.seconds ?? null, // null이면 모델이 알아서
      prompt_influence: 0.5,
    }),
  });
  if (!res.ok) throw new Error(`sound-generation ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** ElevenLabs Music — 긴 곡. (엔드포인트/파라미터가 계정 플랜에 따라 다를 수 있어,
 *  실패하면 에러 메시지를 그대로 보여 준다 — 그때 여기만 문서에 맞게 고치면 된다.) */
async function genMusic(entry) {
  const res = await fetch(`${BASE}/music`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: entry.prompt,
      music_length_ms: entry.lengthMs ?? 30000,
      model_id: MUSIC_MODEL,
    }),
  });
  if (!res.ok) throw new Error(`music ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function run() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  let targets = AUDIO_ASSETS;
  if (onlyBgm) targets = targets.filter((e) => e.kind === 'music');
  if (onlySfx) targets = targets.filter((e) => e.kind === 'sfx');
  if (onlyIds) targets = targets.filter((e) => onlyIds.includes(e.id));

  let made = 0;
  let skipped = 0;
  for (const entry of targets) {
    const out = join(OUT, `${entry.id}.mp3`);
    if (existsSync(out) && !force) {
      skipped += 1;
      continue;
    }
    process.stdout.write(`▸ ${entry.id} (${entry.kind}) 생성 중…`);
    try {
      const bytes = entry.kind === 'music' ? await genMusic(entry) : await genSfx(entry);
      writeFileSync(out, bytes);
      made += 1;
      console.log(` ✓ ${(bytes.length / 1024).toFixed(0)}KB`);
    } catch (err) {
      console.log(` ✗`);
      console.error(`  ${err.message}`);
    }
  }
  console.log(`\n완료 — 생성 ${made}, 건너뜀 ${skipped}. 결과: assets/audio/`);
  if (made > 0) {
    console.log('다음: sw.js 캐시 버전을 올리고 커밋하면 폰에서 오프라인 재생됩니다.');
  }
}

run();
