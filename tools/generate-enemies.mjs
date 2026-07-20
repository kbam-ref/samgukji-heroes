// Scenario API로 적 유닛 일러스트를 생성하는 개발 도구 (영웅용과 자매).
// 게임 코드가 아니며 앱에 포함되지 않는다.
//
// 사용법:
//   node tools/generate-enemies.mjs                ← 아직 없는 적 전부 생성
//   node tools/generate-enemies.mjs --force zhangjiao
//
// 결과: assets/enemies/{id}.png
//
// 구성: 장(章)별 잡병 4종 + 비중 있는 우두머리(장각).
// 영웅 명단에 있는 우두머리(화웅·여포·동탁·원소·기령)는 숙적 시스템이
// 영웅 초상을 그대로 쓰므로 여기서 만들지 않는다.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'enemies');

// ── .env 로드 ──
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
const MODEL = process.env.SCENARIO_MODEL_ID || 'flux.1-dev';
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

// ── 기본 화풍 — 영웅과 같은 치비, 단 적답게 탁한 색·험한 인상 ──
const STYLE =
  'high-quality 3D rendered chibi enemy character, cute super-deformed figurine with a big head, ' +
  'Three Kingdoms era hostile soldier, Blender Octane render, soft studio key light with gentle rim light, ' +
  'subsurface scattering, smooth stylized PBR materials, soft ambient occlusion, glossy figure finish, ' +
  'muted gloomy colors, menacing but cute, centered full-body, plain dark simple background, ' +
  'no text, no watermark';

// 적 유닛 (id는 stages.js 장 순서와 맞춘 잡병 + 이름 있는 우두머리)
const ENEMY_PROMPTS = {
  'yellow-turban':   'ragged bandit soldier with yellow headscarf, patched brown clothes, rusty spear, greedy toothy grin',
  'dong-soldier':    'brutish soldier in black-and-crimson armor with iron helmet, curved blade, cruel smirk',
  'warlord-soldier': 'rough mercenary in mismatched gray armor with battered shield, wary scowl',
  'yuan-soldier':    'disciplined soldier in silver-gray armor holding a tall banner spear, stern cold face',
  'wu-soldier':      'river navy soldier in crimson-and-teal light armor with rope and boarding hook, agile stance, sly grin',
  'nanman-soldier':  'wild southern tribal warrior in rattan armor with feather and bone ornaments, face paint, short curved blade, fierce grin',
  zhangjiao:         'sinister old sorcerer with long gray hair, tattered yellow robe, wooden staff with paper talismans, faint eerie green glow, ominous grin',
  // 신규 잡병 8종 — 50라운드 변화용
  'bandit-archer':   'ragged bandit archer drawing a short bow, torn leather vest, straw quiver, sneering face',
  'halberdier':      'heavy soldier in thick dark iron plate armor gripping a long halberd with both hands, grim scowl',
  'shield-brute':    'huge hulking brute crouching behind a massive rectangular tower shield, snarling face',
  'twin-blade':      'agile masked assassin holding two short curved daggers crossed, sly narrow-eyed smirk',
  'crossbowman':     'disciplined soldier aiming a repeating crossbow forward, iron cap, cold focused stare',
  'axe-raider':      'muscular raider swinging a heavy double-bladed war axe overhead, fur shoulder, wild roar',
  'spear-guard':     'armored guard in red lacquered armor standing with a long spear and small round shield, stern face',
  'flag-bearer':     'soldier in dark armor hoisting a tattered black war banner on a pole, shouting mouth open',
  // 신규 보스 2종
  'boss-general':    'towering enemy warlord in ornate blood-red spiked armor and horned helmet, giant twin axes, furious glowing eyes, imposing boss',
  'boss-warlock':    'dark shaman boss in flowing black-and-purple robes floating slightly, skull staff, swirling purple flames, menacing hollow eyes',
};

async function generateOne(id) {
  const desc = ENEMY_PROMPTS[id];
  if (!desc) throw new Error(`알 수 없는 적 id: ${id}`);

  const body = {
    parameters: {
      type: 'txt2img',
      prompt: `${STYLE}, ${desc}`,
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
      const buf = Buffer.from(await img.arrayBuffer());
      writeFileSync(join(OUT_DIR, `${id}.png`), buf);
      console.log(`\r  ${id}: 저장 → assets/enemies/${id}.png (${Math.round(buf.length / 1024)}KB)`);
      return;
    }
    if (status === 'failed') throw new Error('생성 실패(failed)');
  }
  throw new Error('시간 초과');
}

// ── 실행 ──
const args = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');
const targets = args.length > 0 ? args : Object.keys(ENEMY_PROMPTS);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log(`모델 ${MODEL} 로 적 ${targets.length}종 생성 시작`);
for (const id of targets) {
  if (!force && existsSync(join(OUT_DIR, `${id}.png`))) {
    console.log(`  ${id}: 이미 있음 — 건너뜀 (--force로 다시 생성)`);
    continue;
  }
  try {
    await generateOne(id);
  } catch (err) {
    console.error(`\n  ${id}: 실패 — ${err.message}`);
  }
}
console.log('끝. 결과 확인 후 전투 화면 통합을 지시해 주세요.');
