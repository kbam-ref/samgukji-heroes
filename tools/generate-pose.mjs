// 공격 자세 프레임 생성 — 대기 프레임과 같은 프롬프트 정체성에 '공격 자세' 지시만 더한 txt2img.
// (img2img는 원본 구도를 너무 보존해 포즈가 안 바뀌는 것을 확인 — 2026-07-18)
// 결과: assets/heroes-atk/{id}.png, assets/enemies-atk/{id}.png
//
// 사용법:
//   node tools/generate-pose.mjs guanyu          ← 1명 테스트
//   node tools/generate-pose.mjs                 ← 영웅 전원 (없는 것만)
//   node tools/generate-pose.mjs --enemies       ← 적 유닛
//   node tools/generate-pose.mjs --force lvbu

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEROES } from '../js/data/heroes.js';
import { STYLE, FACTION_LOOK, RARITY_LOOK, HERO_PROMPTS } from './generate-heroes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
const MODEL = process.env.SCENARIO_MODEL_ID || 'flux.1-dev';
if (!KEY || !SECRET) {
  console.error('.env에 SCENARIO_API_KEY / SCENARIO_API_SECRET을 채워 주세요.');
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

// 공격 자세 지시 — 정체성 프롬프트 뒤에 덧붙인다 (배경은 대기 프레임과 동일 규칙)
const ATTACK_POSE =
  'captured mid-attack: lunging forward and swinging the weapon in a wide arc, ' +
  'leaning into the strike, motion lines behind the swing, fierce battle expression';

// 적 프롬프트 (generate-enemies.mjs와 동일 정체성)
const ENEMY_STYLE =
  'chibi mobile game enemy character, super-deformed proportions with big head, ' +
  'Three Kingdoms era hostile soldier, soft cel shading, clean bold outlines, ' +
  'muted gloomy colors, menacing but cute, centered full-body, plain dark simple background, ' +
  'no text, no watermark';
const ENEMY_PROMPTS = {
  'yellow-turban':   'ragged bandit soldier with yellow headscarf, patched brown clothes, rusty spear, greedy toothy grin',
  'dong-soldier':    'brutish soldier in black-and-crimson armor with iron helmet, curved blade, cruel smirk',
  'warlord-soldier': 'rough mercenary in mismatched gray armor with battered shield, wary scowl',
  'yuan-soldier':    'disciplined soldier in silver-gray armor holding a tall banner spear, stern cold face',
  zhangjiao:         'sinister old sorcerer with long gray hair, tattered yellow robe, wooden staff with paper talismans, faint eerie green glow, ominous grin',
};

const META = Object.fromEntries(HEROES.map((h) => [h.id, h]));

function buildPrompt(id, enemies) {
  if (enemies) return `${ENEMY_STYLE}, ${ENEMY_PROMPTS[id]}, ${ATTACK_POSE}`;
  const meta = META[id];
  return `${STYLE}, ${FACTION_LOOK[meta.faction]}, ${RARITY_LOOK[meta.rarity]}, ${HERO_PROMPTS[id]}, ${ATTACK_POSE}`;
}

async function generateOne(id, outPath, enemies) {
  const body = {
    parameters: {
      type: 'txt2img',
      prompt: buildPrompt(id, enemies),
      numSamples: 1,
      width: 512,
      height: 768,
      guidance: 3.5,
      numInferenceSteps: 30,
    },
  };
  const started = await api(`/models/${MODEL}/inferences`, { method: 'POST', body: JSON.stringify(body) });
  const infId = started.inference?.id;
  if (!infId) throw new Error(`생성 시작 실패: ${JSON.stringify(started).slice(0, 200)}`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await api(`/models/${MODEL}/inferences/${infId}`);
    const status = st.inference?.status;
    process.stdout.write(`\r  ${id}: ${status ?? '?'} (${i * 4}s)   `);
    if (status === 'succeeded') {
      const url = st.inference?.images?.[0]?.url;
      if (!url) throw new Error('결과 이미지 URL 없음');
      const img = await fetch(url);
      writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
      console.log(`\r  ${id}: 저장 완료`);
      return;
    }
    if (status === 'failed') throw new Error('생성 실패(failed)');
  }
  throw new Error('시간 초과');
}

// ── 실행 ──
const enemies = process.argv.includes('--enemies');
const force = process.argv.includes('--force');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const OUT = join(ROOT, 'assets', enemies ? 'enemies-atk' : 'heroes-atk');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const pool = enemies ? Object.keys(ENEMY_PROMPTS) : Object.keys(HERO_PROMPTS);
const targets = names.length > 0 ? names : pool;

console.log(`모델 ${MODEL} 로 공격 자세 ${targets.length}장 생성 (txt2img)`);
for (const id of targets) {
  const out = join(OUT, `${id}.png`);
  if (!force && existsSync(out)) {
    console.log(`  ${id}: 이미 있음 — 건너뜀`);
    continue;
  }
  try {
    await generateOne(id, out, enemies);
  } catch (err) {
    console.error(`\n  ${id}: 실패 — ${err.message}`);
  }
}
console.log('끝.');
