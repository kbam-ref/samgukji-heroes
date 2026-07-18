// Scenario API로 영웅 초상 일러스트를 생성하는 개발 도구.
// 게임 코드가 아니며 앱에 포함되지 않는다 — 키는 이 스크립트가 개발 PC에서만 읽는다.
//
// 사용법:
//   node tools/generate-heroes.mjs guanyu        ← 1명만 생성해 검수
//   node tools/generate-heroes.mjs               ← 아직 없는 영웅 전부 생성
//   node tools/generate-heroes.mjs --force lvbu  ← 이미 있어도 다시 생성
//
// 결과: assets/heroes/{id}.png
//
// 프롬프트 구조 (2026-07-17 개편 — "다 비슷하다" 지적 반영):
//   기본 화풍(STYLE) + 세력별 색·배경(FACTION_LOOK) + 등급별 화려함(RARITY_LOOK) + 개별 포즈·표정(HERO_PROMPTS)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HEROES } from '../js/data/heroes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'heroes');

// ── .env 로드 ──
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
let MODEL = process.env.SCENARIO_MODEL_ID;
if (!KEY || !SECRET) {
  console.error('.env에 SCENARIO_API_KEY / SCENARIO_API_SECRET을 채워 주세요. (app.scenario.com → API)');
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

// ── 기본 화풍 — 모든 초상이 공유한다 (generate-pose.mjs도 이 정의를 가져다 쓴다) ──
export const STYLE =
  'adorable chibi mobile game character portrait, super-deformed proportions with big head and large sparkling eyes, ' +
  'Three Kingdoms era character, soft cel shading, clean bold outlines, cheerful gacha game art, ' +
  'centered composition, no text, no watermark';
const NEGATIVE = 'photo, 3d render, realistic proportions, scary, grim, text, letters, watermark, frame';

// ── 세력별 색·배경 — 도감에서 세력 컬렉션이 한눈에 묶여 보이게 ──
export const FACTION_LOOK = {
  wei:  'deep blue and silver themed armor and clothing, cool pale-indigo radial background',
  shu:  'green and gold themed armor and clothing, soft jade-green radial background',
  wu:   'crimson and scarlet themed armor and clothing, warm sunset-red radial background',
  free: 'dark iron and violet themed armor and clothing, smoky violet-gray radial background',
};

// ── 등급별 배경·장비 화려함 — 가챠에서 등급이 즉시 체감되게 ──
export const RARITY_LOOK = {
  5: 'majestic golden sunburst rays behind the character, sparkling particles, ornate glowing gold-trimmed equipment',
  4: 'bright radiant light rays behind the character, finely decorated equipment',
  3: 'soft glowing halo behind the character',
  2: 'simple soft background',
  1: 'plain muted background, modest simple equipment',
};

// ── 영웅별 포즈·표정·소품 (id는 js/data/heroes.js와 일치) — 전원 다른 자세·머리모양·표정 ──
export const HERO_PROMPTS = {
  lvbu: 'peerless warrior swinging a huge crescent halberd overhead in a dynamic action pose, tall pheasant-feather headdress, cocky grin',
  guanyu: 'majestic general stroking his very long flowing black beard, huge guandao planted beside him, calm dignified half-closed eyes',
  caocao: 'ambitious warlord with arms crossed, fur mantle over armor, sly knowing smirk with one eyebrow raised',
  zhugeliang: 'serene strategist gently waving a white feather fan, white scholar robe and tall scholar hat, wise gentle smile',
  zhangfei: 'wild burly warrior roaring with mouth wide open, bristling black beard, serpent spear thrust forward, fierce round eyes',
  zhaoyun: 'composed young knight in gleaming silver-white armor, spear twirling behind his back, cool confident expression',
  zhouyu: 'elegant commander plucking a guqin zither with one hand, refined smile, floating musical notes',
  xiahoudun: 'battle-worn general with black eyepatch pulling a bandage tight with his teeth, tough fearless grin',
  sunce: 'laughing young conqueror charging forward with a short spear over his shoulder, tiger-head pauldron, big open smile',
  dongzhuo: 'corpulent tyrant lounging with a wine cup in hand, extravagant gold-trimmed robes, greedy laughing face',
  zhangliao: 'disciplined general pointing his sword forward as if commanding a charge, tall-collared armor, stern focused eyes',
  ganning: 'grinning river pirate with a red feathered headband and small bells on his sash, twin blades crossed in an X, mischievous smile',
  liubei: 'kind-hearted leader bowing slightly with one hand on his chest, plain humble robe, warm gentle smile, twin swords on his back',
  sunshangxiang: 'spirited girl archer drawing her bow and aiming upward, ponytail with ribbon, determined bright eyes',
  yuanshao: 'proud aristocrat fanning himself with a folding war fan, jade ornaments, chin raised in a haughty expression',
  xunyu: 'calm advisor reading an unrolled scroll, scholar cap, thoughtful downcast eyes and slight smile',
  huaxiong: 'towering brute resting a huge saber on his shoulder, heavy jaw, smug overconfident face',
  zhoucang: 'loyal dark-skinned strongman hauling a giant guandao on his back with both hands, headscarf, earnest eager grin',
  caohong: 'sturdy officer raising a round shield in defense stance, clenched fist, earnest determined face',
  handang: 'weathered veteran of the river fleet holding an oar-like blade, gray temples, steady reliable smile',
  jiling: 'soldier proudly presenting a three-pointed trident with both hands, thick eyebrows, simple honest face',
  liaohua: 'old vanguard soldier saluting with a short spear, green headband, cheerful wrinkled smile',
  yujin: 'strict officer standing at rigid attention holding an army banner pole, stone-straight face',
  chengpu: 'white-bearded elder officer clasping his fist in a respectful salute, gentle grandfather smile',
};

// 세력·등급 메타 — js/data/heroes.js가 단일 소스
const META = Object.fromEntries(HEROES.map((h) => [h.id, h]));

async function pickModel() {
  if (MODEL) return MODEL;
  const data = await api('/models?pageSize=20');
  console.log('SCENARIO_MODEL_ID가 비어 있습니다. 계정에서 쓸 수 있는 모델:');
  for (const m of data.models ?? []) console.log(`  ${m.id}  ${m.name ?? ''}`);
  console.log('원하는 모델 ID를 .env의 SCENARIO_MODEL_ID에 넣고 다시 실행하세요.');
  process.exit(0);
}

async function generateOne(heroId) {
  const desc = HERO_PROMPTS[heroId];
  const meta = META[heroId];
  if (!desc || !meta) throw new Error(`알 수 없는 영웅 id: ${heroId}`);

  const prompt = `${STYLE}, ${FACTION_LOOK[meta.faction]}, ${RARITY_LOOK[meta.rarity]}, ${desc}`;

  // FLUX 계열은 negativePrompt에 별도 강도 값이 필요하고 비용도 늘어난다 — 빼고 프롬프트로만 조향한다.
  const isFlux = MODEL.startsWith('flux');
  const body = {
    parameters: {
      type: 'txt2img',
      prompt,
      ...(isFlux ? {} : { negativePrompt: NEGATIVE }),
      numSamples: 1,
      width: 512,
      height: 768,
      guidance: 3.5, // FLUX 계열 권장값 (SD 계열이면 7)
      numInferenceSteps: 30,
    },
  };
  const started = await api(`/models/${MODEL}/inferences`, { method: 'POST', body: JSON.stringify(body) });
  const infId = started.inference?.id;
  if (!infId) throw new Error(`생성 시작 실패: ${JSON.stringify(started).slice(0, 200)}`);

  // 완료까지 폴링
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await api(`/models/${MODEL}/inferences/${infId}`);
    const status = st.inference?.status;
    process.stdout.write(`\r  ${heroId}: ${status ?? '?'} (${i * 4}s)   `);
    if (status === 'succeeded') {
      const url = st.inference?.images?.[0]?.url;
      if (!url) throw new Error('결과 이미지 URL 없음');
      const img = await fetch(url);
      const buf = Buffer.from(await img.arrayBuffer());
      const out = join(OUT_DIR, `${heroId}.png`);
      writeFileSync(out, buf);
      console.log(`\r  ${heroId}: 저장 → assets/heroes/${heroId}.png (${Math.round(buf.length / 1024)}KB)`);
      return;
    }
    if (status === 'failed') throw new Error('생성 실패(failed)');
  }
  throw new Error('시간 초과');
}

// ── 실행 (직접 실행할 때만 — generate-pose.mjs가 프롬프트만 가져다 쓸 수 있게) ──
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const force = process.argv.includes('--force');
  const targets = args.length > 0 ? args : Object.keys(HERO_PROMPTS);

  MODEL = await pickModel();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  console.log(`모델 ${MODEL} 로 ${targets.length}명 생성 시작`);
  for (const id of targets) {
    const out = join(OUT_DIR, `${id}.png`);
    if (!force && existsSync(out)) {
      console.log(`  ${id}: 이미 있음 — 건너뜀 (--force로 다시 생성)`);
      continue;
    }
    try {
      await generateOne(id);
    } catch (err) {
      console.error(`\n  ${id}: 실패 — ${err.message}`);
    }
  }
  console.log('끝. 결과를 확인한 뒤 마음에 들면 UI 통합을 지시해 주세요.');
}
