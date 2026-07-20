// 스켈레탈 애니(걷기) — 이미 생성된 모델을 Meshy 리깅해 걷기 애니 GLB로 교체.
// task id는 gen-models 배치 로그에서 파싱(형식: "[id] 생성 시작…" 다음 줄 "task=<id>").
// 사용: node tools/3d/rig-models.mjs <배치로그경로> <id...>
//   예) node tools/3d/rig-models.mjs /path/to/batch.output yellow-turban dong-soldier ...
// 결과: assets/models/{id}.glb 를 걷기 애니 포함본으로 덮어씀(엔진이 Hips.position 제거+SkeletonUtils로 사용).

import { readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
function readKey() {
  if (process.env.MESHY_API_KEY) return process.env.MESHY_API_KEY.trim();
  const f = join(ROOT, 'tools/3d/meshy-key.txt');
  if (!existsSync(f)) return '';
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) { const s = line.trim(); if (s && !s.startsWith('#') && s !== '여기에_키를_붙여넣으세요') return s; }
  return '';
}
const KEY = readKey();
if (!KEY) { console.error('Meshy 키 없음'); process.exit(1); }
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const OUT = join(ROOT, 'assets/models');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 배치 로그 파싱 → id→taskId
function parseTaskIds(logPath) {
  const map = {};
  const txt = readFileSync(logPath, 'utf8');
  const re = /\[([a-z0-9-]+)\]\s*생성 시작[\s\S]*?task=([0-9a-f-]+)/g;
  let m; while ((m = re.exec(txt))) map[m[1]] = m[2];
  return map;
}
async function rig(taskId) {
  const r = await fetch('https://api.meshy.ai/openapi/v1/rigging', { method: 'POST', headers: H, body: JSON.stringify({ input_task_id: taskId, height_meters: 1.7 }) });
  const t = await r.text(); if (!r.ok) throw new Error('rig ' + r.status + ': ' + t);
  return JSON.parse(t).result;
}
async function pollRig(id) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`https://api.meshy.ai/openapi/v1/rigging/${id}`, { headers: H });
    const j = JSON.parse(await r.text());
    process.stdout.write(`\r  리깅 ${j.status} ${j.progress ?? ''}%   `);
    if (j.status === 'SUCCEEDED') return j;
    if (j.status === 'FAILED') throw new Error('rig FAILED');
    await sleep(5000);
  }
  throw new Error('rig 타임아웃');
}
function optimizeAnim(raw, final) { // 애니는 텍스처 축소만(양자화는 스킨드 스케일 깨짐)
  execSync(`npx --yes @gltf-transform/cli@latest resize "${raw}" "${final}" --width 1024 --height 1024`, { stdio: 'pipe' });
}

const [logPath, ...ids] = process.argv.slice(2);
if (!logPath || !ids.length) { console.error('사용: node tools/3d/rig-models.mjs <로그경로> <id...>'); process.exit(1); }
const taskIds = parseTaskIds(logPath);
for (const id of ids) {
  const tid = taskIds[id];
  if (!tid) { console.error(`\n[${id}] task id 못 찾음(로그 확인)`); continue; }
  try {
    console.log(`\n[${id}] 리깅 시작 (task ${tid})`);
    const rigId = await rig(tid);
    const done = await pollRig(rigId);
    const walk = done.result?.basic_animations?.walking_glb_url;
    if (!walk) throw new Error('walking_glb_url 없음');
    const glb = Buffer.from(await (await fetch(walk)).arrayBuffer());
    const out = join(OUT, id + '.glb');
    const raw = out + '.animraw';
    writeFileSync(raw, glb);
    optimizeAnim(raw, out);
    try { rmSync(raw); } catch { /* noop */ }
    console.log(`\r  ✔ ${id}.glb (걷기 애니) ${(glb.length / 1048576).toFixed(1)}MB → ${(statSync(out).size / 1048576).toFixed(2)}MB`);
  } catch (e) { console.error(`\n  ✗ ${id} 실패: ${e.message}`); }
}
console.log('\n리깅 끝.');
