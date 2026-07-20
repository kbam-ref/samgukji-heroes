// Scenario API로 로딩 화면 배경(분위기 아트)을 생성하는 개발 도구.
// 앱에 포함되지 않으며, 결과 PNG만 assets/bg/loading.png로 저장해 번들한다(오프라인 보장).
// 사용: node tools/generate-loading-bg.mjs   (--force로 재생성)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'bg');
const OUT = join(OUT_DIR, 'loading.png');

for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
const MODEL = process.env.SCENARIO_MODEL_ID;
if (!KEY || !SECRET || !MODEL) { console.error('.env에 SCENARIO 키/모델 필요'); process.exit(1); }

const BASE = 'https://api.cloud.scenario.com/v1';
const AUTH = 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64');
async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(options.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// 세로 로딩 화면 배경 — 위쪽은 극적인 하늘/여명(타이틀 자리), 아래로 갈수록 어둡게(영웅이 또렷하게 서게).
// '액티브' 요청 반영: 원경에 돌진하는 기병·나부끼는 깃발·먼지·불티로 역동적 전장 에너지.
const PROMPT =
  'epic Three Kingdoms ancient China battlefield at golden dawn, dramatic sunrise sky with billowing warm clouds and rays of light, ' +
  'distant silhouettes of charging cavalry and marching armies in motion, tall war banners and flags fluttering in the wind, ' +
  'swirling dust and glowing embers in the air, sweeping cinematic epic vista, dynamic energetic composition, ' +
  'stylized painterly mobile game splash background, warm amber gold and ember-orange palette, ' +
  'bright dramatic sky at the top fading into a darker earthy foreground at the bottom, atmospheric depth, ' +
  'no close-up characters, no text, no watermark, no ui';
const NEGATIVE = 'text, letters, words, watermark, logo, ui, hud, frame, border, close-up face, portrait, modern, photo, blurry, low quality, flat';

const isFlux = MODEL.startsWith('flux');
const body = {
  parameters: {
    type: 'txt2img',
    prompt: PROMPT,
    ...(isFlux ? {} : { negativePrompt: NEGATIVE }),
    numSamples: 1,
    width: 768,
    height: 1152, // 세로(2:3) — 모바일 로딩 화면
    guidance: 3.5,
    numInferenceSteps: 30,
  },
};

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log('이미 assets/bg/loading.png 있음 — --force로 다시 생성');
  process.exit(0);
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log(`모델 ${MODEL}로 로딩 배경 생성 시작…`);
const started = await api(`/models/${MODEL}/inferences`, { method: 'POST', body: JSON.stringify(body) });
const infId = started.inference?.id;
if (!infId) { console.error('생성 시작 실패:', JSON.stringify(started).slice(0, 200)); process.exit(1); }

for (let i = 0; i < 75; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  const st = await api(`/models/${MODEL}/inferences/${infId}`);
  const status = st.inference?.status;
  process.stdout.write(`\r  ${status ?? '?'} (${i * 4}s)      `);
  if (status === 'succeeded') {
    const url = st.inference?.images?.[0]?.url;
    if (!url) { console.error('\n결과 URL 없음'); process.exit(1); }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(OUT, buf);
    console.log(`\n저장 → assets/bg/loading.png (${Math.round(buf.length / 1024)}KB)`);
    process.exit(0);
  }
  if (status === 'failed') { console.error('\n생성 실패(failed)'); process.exit(1); }
}
console.error('\n시간 초과');
process.exit(1);
