// 전장 전용 스프라이트 생성 — 무배경(민무늬 회색 스튜디오) 대기/공격 포즈.
// 카드용 초상(등급 후광 포함)과 별개다: 전장 누끼에 후광 원이 딸려 나오는 문제의 근본 해결.
// 결과: assets/heroes-cut/, assets/heroes-atk-cut/ 를 깨끗한 누끼로 교체한다.
//
// 사용법: node tools/generate-sprites.mjs [--force] [id...]   (기본: 대기+공격 전원)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEROES } from '../js/data/heroes.js';
import { STYLE, HERO_PROMPTS } from './generate-heroes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
const MODEL = process.env.SCENARIO_MODEL_ID || 'flux.1-dev';

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

// 세력 갑주색만 — 배경 문구는 뺀다 (무배경이 목적)
const FACTION_ARMOR = {
  wei: 'deep blue and silver themed armor and clothing',
  shu: 'green and gold themed armor and clothing',
  wu: 'crimson and scarlet themed armor and clothing',
  free: 'dark iron and violet themed armor and clothing',
};

// 무배경 강제 — 후광·광선·원 금지
const NO_BG =
  'standing on a plain flat light gray studio background, no background scenery, no halo, ' +
  'no glowing circle, no light rays, no vignette, full body visible with feet on the ground';

const ATTACK_POSE =
  'captured mid-attack: lunging forward and swinging the weapon in a wide arc, ' +
  'leaning into the strike, fierce battle expression';

const META = Object.fromEntries(HEROES.map((h) => [h.id, h]));

async function gen(prompt, outPath, label) {
  const body = {
    parameters: { type: 'txt2img', prompt, numSamples: 1, width: 512, height: 768, guidance: 3.5, numInferenceSteps: 30 },
  };
  const started = await api(`/models/${MODEL}/inferences`, { method: 'POST', body: JSON.stringify(body) });
  const infId = started.inference?.id;
  if (!infId) throw new Error('생성 시작 실패');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await api(`/models/${MODEL}/inferences/${infId}`);
    const status = st.inference?.status;
    process.stdout.write(`\r  ${label}: ${status ?? '?'} (${i * 4}s)   `);
    if (status === 'succeeded') {
      const img = await fetch(st.inference.images[0].url);
      writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
      console.log(`\r  ${label}: 저장 완료`);
      return;
    }
    if (status === 'failed') throw new Error('생성 실패');
  }
  throw new Error('시간 초과');
}

const force = process.argv.includes('--force');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = names.length > 0 ? names : Object.keys(HERO_PROMPTS);

const IDLE_DIR = join(ROOT, 'assets', 'sprites-raw');
const ATK_DIR = join(ROOT, 'assets', 'sprites-atk-raw');
for (const d of [IDLE_DIR, ATK_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

console.log(`무배경 스프라이트 ${targets.length}명 × 2포즈 생성`);
for (const id of targets) {
  const meta = META[id];
  const base = `${STYLE}, ${FACTION_ARMOR[meta.faction]}, ${HERO_PROMPTS[id]}`;
  const idleOut = join(IDLE_DIR, `${id}.png`);
  const atkOut = join(ATK_DIR, `${id}.png`);
  try {
    if (force || !existsSync(idleOut)) await gen(`${base}, ${NO_BG}`, idleOut, `${id}(대기)`);
    else console.log(`  ${id}(대기): 있음 — 건너뜀`);
    if (force || !existsSync(atkOut)) await gen(`${base}, ${ATTACK_POSE}, ${NO_BG}`, atkOut, `${id}(공격)`);
    else console.log(`  ${id}(공격): 있음 — 건너뜀`);
  } catch (err) {
    console.error(`\n  ${id}: 실패 — ${err.message}`);
  }
}
console.log('생성 끝 — 이어서 배경 제거를 돌리세요.');
