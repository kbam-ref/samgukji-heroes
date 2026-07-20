// 전장·연출 배경 생성 — 장(章) 테마별 회화풍 배경. 결과: assets/bg/{id}.png
//
// 사용법:
//   node tools/generate-backgrounds.mjs             ← 없는 것 전부
//   node tools/generate-backgrounds.mjs --force red-cliffs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'bg');

for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
const MODEL = process.env.SCENARIO_MODEL_ID || 'flux.1-dev';
if (!KEY || !SECRET) {
  console.error('.env에 키를 채워 주세요.');
  process.exit(1);
}

const BASE = 'https://api.cloud.scenario.com/v1';
const AUTH = 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64');

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// UI의 먹빛+금 톤에 맞춘 회화풍 — 캐릭터가 설 땅이 하단 1/3에 오게
const STYLE =
  'painterly game battlefield background, Korean historical fantasy, wide landscape, ' +
  'dark moody atmosphere with warm golden rim light, muted ink-wash tones of charcoal brown and deep green, ' +
  'soft depth of field, clear ground plane in the lower third, ' +
  'no people, no characters, no animals, no text, no watermark';

const SCENES = {
  'village-plain': 'rural ancient village outskirts at dusk, thatched houses, dirt road, distant hills',
  'fortress-gate': 'massive ancient fortress gate and stone walls at night, tall war banners, torchlight',
  'burning-city': 'ancient capital burning in the distance at night, flames and smoke on the horizon, embers drifting',
  'river-shore': 'wide river shore at dusk, tall reeds, moored wooden boats, mist over the water',
  'red-cliffs': 'great river at night lit by burning warships in the distance, red glow on dark cliffs, drifting smoke',
  'mountain-pass': 'steep mountain pass with pine trees and thick fog, narrow stone road, cold pale light',
  'palace-court': 'grand ancient palace courtyard at dusk, wide stone tiles, red pillars, glowing lanterns',
  jungle: 'dense southern jungle, giant leaves and hanging vines, humid mist, shafts of green-gold light',
  'night-camp': 'war camp on a wide plateau at night, starry sky, dark tents and banners, distant campfires',
  // 가챠 공개 무대 — 세로
  'gacha-sky': 'majestic sea of golden clouds at dawn, god rays breaking through, sky only, vertical composition',
  // 랜덤 디펜스 아레나 바닥 — 톱다운(세로), 트랙 뒤 배경
  'arena-plain': 'dry cracked earth battlefield ground, scattered rocks and sparse dead grass, faint wheel ruts, warm dusk light',
  'arena-stone': 'ancient stone-paved courtyard floor, weathered mossy flagstones, cracks, subtle torch glow at the edges',
  'arena-camp': 'trampled war-camp dirt ground, scattered straw, wooden stakes and rope, warm firelight from the sides',
  'arena-snow': 'frozen battlefield ground, snow-dusted dark earth and cracked ice, cold pale blue dusk light',
};
// 아레나는 톱다운 시점(위에서 내려다본 바닥) — 캐릭터·수평선 없이 바닥 텍스처만
const ARENA_STYLE =
  'high quality 3D rendered top-down aerial view of a battlefield arena floor for a mobile game, ' +
  'looking straight down at the ground, soft ambient lighting, gentle vignette, rich texture detail, ' +
  'no people, no characters, no horizon, no sky, no text, no watermark';

async function generateOne(id) {
  const arena = id.startsWith('arena-');
  const vertical = id === 'gacha-sky' || arena;
  const body = {
    parameters: {
      type: 'txt2img',
      prompt: arena ? `${ARENA_STYLE}, ${SCENES[id]}` : `${STYLE}, ${SCENES[id]}`,
      numSamples: 1,
      width: vertical ? 512 : 768,
      height: vertical ? 768 : 512,
      guidance: 3.5,
      numInferenceSteps: 30,
    },
  };
  const started = await api(`/models/${MODEL}/inferences`, { method: 'POST', body: JSON.stringify(body) });
  const infId = started.inference?.id;
  if (!infId) throw new Error('생성 시작 실패');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await api(`/models/${MODEL}/inferences/${infId}`);
    const status = st.inference?.status;
    process.stdout.write(`\r  ${id}: ${status ?? '?'} (${i * 4}s)   `);
    if (status === 'succeeded') {
      const url = st.inference?.images?.[0]?.url;
      const img = await fetch(url);
      writeFileSync(join(OUT, `${id}.png`), Buffer.from(await img.arrayBuffer()));
      console.log(`\r  ${id}: 저장 완료`);
      return;
    }
    if (status === 'failed') throw new Error('생성 실패');
  }
  throw new Error('시간 초과');
}

const force = process.argv.includes('--force');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = names.length > 0 ? names : Object.keys(SCENES);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

console.log(`배경 ${targets.length}장 생성 시작`);
for (const id of targets) {
  if (!force && existsSync(join(OUT, `${id}.png`))) {
    console.log(`  ${id}: 이미 있음 — 건너뜀`);
    continue;
  }
  try {
    await generateOne(id);
  } catch (err) {
    console.error(`\n  ${id}: 실패 — ${err.message}`);
  }
}
console.log('끝.');
