// 영웅 공격 애니 — 이미 생성된 모델을 리깅 → Attack(action 4) 애니 GLB로 교체.
// task id는 gen-models 배치 로그에서 파싱. 텍스처 512로 축소(인게임 작게 표시 + 로드 경량).
// 사용: node tools/3d/rig-attack.mjs <배치로그> <id...>   또는  --all-heroes

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
const ATTACK_ACTION = 4;
const HEROES = ['lvbu','guanyu','caocao','zhugeliang','zhangfei','zhaoyun','zhouyu','xiahoudun','sunce','dongzhuo','zhangliao','ganning','liubei','sunshangxiang','yuanshao','xunyu','huaxiong','zhoucang','caohong','handang','jiling','liaohua','yujin','chengpu'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseTaskIds(logPath) {
  const map = {}; const txt = readFileSync(logPath, 'utf8');
  const re = /\[([a-z0-9-]+)\]\s*생성 시작[\s\S]*?task=([0-9a-f-]+)/g;
  let m; while ((m = re.exec(txt))) map[m[1]] = m[2];
  return map;
}
async function rig(taskId) {
  const r = await fetch('https://api.meshy.ai/openapi/v1/rigging', { method: 'POST', headers: H, body: JSON.stringify({ input_task_id: taskId, height_meters: 1.7 }) });
  const t = await r.text(); if (!r.ok) throw new Error('rig ' + r.status + ': ' + t.slice(0, 120));
  return JSON.parse(t).result;
}
async function pollRig(id) {
  for (let i = 0; i < 60; i++) {
    const j = JSON.parse(await (await fetch(`https://api.meshy.ai/openapi/v1/rigging/${id}`, { headers: H })).text());
    process.stdout.write(`\r  리깅 ${j.status} ${j.progress ?? ''}%   `);
    if (j.status === 'SUCCEEDED') return j; if (j.status === 'FAILED') throw new Error('rig FAILED');
    await sleep(5000);
  }
  throw new Error('rig 타임아웃');
}
async function animate(rigId, actionId) {
  let aid;
  for (let attempt = 0; attempt < 5; attempt++) { // 리그 후 모델 준비까지 지연 + 재시도
    const r = await fetch('https://api.meshy.ai/openapi/v1/animations', { method: 'POST', headers: H, body: JSON.stringify({ rig_task_id: rigId, action_id: actionId }) });
    const t = await r.text();
    if (r.ok) { aid = JSON.parse(t).result; break; }
    if (/not found|not rigged/i.test(t) && attempt < 4) { process.stdout.write(`\r  리그 준비 대기…재시도 ${attempt + 1}   `); await sleep(15000); continue; }
    throw new Error('anim ' + r.status + ': ' + t.slice(0, 120));
  }
  for (let i = 0; i < 60; i++) {
    const j = JSON.parse(await (await fetch(`https://api.meshy.ai/openapi/v1/animations/${aid}`, { headers: H })).text());
    process.stdout.write(`\r  공격애니 ${j.status} ${j.progress ?? ''}%   `);
    if (j.status === 'SUCCEEDED') return j.result.animation_glb_url;
    if (j.status === 'FAILED') throw new Error('anim FAILED');
    await sleep(5000);
  }
  throw new Error('anim 타임아웃');
}
function resize512(raw, final) { execSync(`npx --yes @gltf-transform/cli@latest resize "${raw}" "${final}" --width 512 --height 512`, { stdio: 'pipe' }); }

const args = process.argv.slice(2);
const logPath = args[0];
let ids = args.slice(1).filter((a) => !a.startsWith('--'));
if (args.includes('--all-heroes')) ids = HEROES;
if (!logPath || !ids.length) { console.error('사용: node tools/3d/rig-attack.mjs <로그> <id...>|--all-heroes'); process.exit(1); }
const taskIds = parseTaskIds(logPath);
for (const id of ids) {
  const tid = taskIds[id];
  if (!tid) { console.error(`\n[${id}] task id 못 찾음`); continue; }
  try {
    console.log(`\n[${id}] 리깅+공격애니 (task ${tid})`);
    const rigId = await rig(tid);
    await sleep(12000); // 리그 SUCCEEDED 후 모델 파일 준비까지 여유
    const url = await animate(rigId, ATTACK_ACTION);
    const glb = Buffer.from(await (await fetch(url)).arrayBuffer());
    const out = join(OUT, id + '.glb'); const raw = out + '.atkraw';
    writeFileSync(raw, glb); resize512(raw, out); try { rmSync(raw); } catch { /* noop */ }
    console.log(`\r  ✔ ${id}.glb (공격) ${(glb.length / 1048576).toFixed(1)}MB → ${(statSync(out).size / 1048576).toFixed(2)}MB`);
  } catch (e) { console.error(`\n  ✗ ${id}: ${e.message}`); }
}
console.log('\n공격 리깅 끝.');
