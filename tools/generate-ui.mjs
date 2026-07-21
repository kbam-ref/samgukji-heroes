// UI 스킨·이펙트 에셋 생성 — 패널 프레임, 버튼 플레이트, 타이틀 키 아트, 전투 VFX.
// VFX는 순흑 배경으로 생성해 게임에서 mix-blend-mode: screen으로 얹는다 (검정=투명).
//
// 사용법: node tools/generate-ui.mjs [--force] [이름...]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'ui');

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

const ITEMS = {
  // 9-slice용 프레임 — 대칭·직선 모서리가 생명
  'panel-frame': {
    w: 768, h: 512,
    prompt:
      'ornate rectangular picture frame border, korean traditional dark lacquered wood with gold inlay pattern, ' +
      'perfectly symmetrical, straight flat edges, empty pure black center, game UI asset, flat front view, ' +
      'no perspective, no text, no watermark',
  },
  'button-gold': {
    w: 512, h: 256,
    prompt:
      'polished golden metal game button plate, horizontal rounded rectangle, embossed bevel edges, ' +
      'subtle dragon engraving on the rim only, empty smooth center, on pure black background, ' +
      'flat front view, game UI asset, no text, no watermark',
  },
  // 타이틀/로딩 공용 키 아트 — 삼영전여포(호뢰관): 유비·관우·장비 셋이 여포 하나와 말 위에서 격돌.
  // 2026-07-22 수석: 상단에 '반드시 비워둔' 하늘(제목 자리). 뒤에 병사·성. 치비 금지.
  'title-art': {
    w: 896, h: 512,
    prompt:
      'epic cinematic splash key art, the legendary Battle of Hulao Pass, three heroic ancient Chinese warriors on horseback fighting ' +
      'together against one mighty enemy warlord: a bearded general with a long green-dragon crescent guandao polearm, a huge fierce ' +
      'warrior with a serpent spear, and a noble leader with twin swords, all clashing against a single powerful armored warlord on a ' +
      'black horse wielding a long halberd in the center, dramatic cavalry clash, behind them ranks of soldiers with tall banners and a ' +
      'great stone fortress gate, dust and sparks, dramatic sky, wide cinematic landscape, IMPORTANT: keep the entire top third an empty ' +
      'plain dark stormy sky with no characters so a title can be placed there, highly detailed painterly digital illustration, heroic ' +
      'proportions, dramatic rim lighting, epic warm and moody color palette, professional AAA game splash art, artstation quality, ' +
      'sharp focus, no chibi, no text, no watermark, no logo',
  },
  'ribbon-header': {
    w: 512, h: 192,
    prompt:
      'traditional korean silk ribbon banner, deep crimson with gold trim and tassels at both ends, ' +
      'horizontal, perfectly symmetrical, empty center for text, on pure black background, ' +
      'flat front view, game UI asset, no text, no watermark',
  },
  'summon-gate': {
    w: 512, h: 768,
    prompt:
      'massive ancient golden palace gate opening with divine light rays pouring out, ' +
      'mystical golden clouds swirling, centered symmetrical composition, painterly, vertical, ' +
      'dark edges, no people, no text, no watermark',
  },
  // 전투 VFX — 순흑 배경 (screen 블렌드로 검정이 사라진다)
  'fx-slash': {
    w: 512, h: 512,
    prompt:
      'single golden curved slash energy arc, bright glowing trail with sparks, centered, ' +
      'on pure black background, game vfx sprite, no text, no watermark',
  },
  'fx-burst': {
    w: 512, h: 512,
    prompt:
      'golden impact burst, radial star explosion with glowing embers, centered, ' +
      'on pure black background, game vfx sprite, no text, no watermark',
  },
};

async function generateOne(id) {
  const item = ITEMS[id];
  const body = {
    parameters: {
      type: 'txt2img',
      prompt: item.prompt,
      numSamples: 1,
      width: item.w,
      height: item.h,
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
const targets = names.length > 0 ? names : Object.keys(ITEMS);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

console.log(`UI 에셋 ${targets.length}장 생성 시작`);
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
