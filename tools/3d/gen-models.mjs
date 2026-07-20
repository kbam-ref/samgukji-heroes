// 이미지→3D 모델 생성 — Meshy API로 치비 컷아웃 PNG를 GLB로 변환.
// 키: tools/3d/meshy-key.txt (한 줄) 또는 환경변수 MESHY_API_KEY. (스크립트가 런타임에 읽음 — 값은 로그에 안 남김)
// 사용: node tools/3d/gen-models.mjs guanyu            (한 명 테스트)
//       node tools/3d/gen-models.mjs guanyu lvbu ...   (여러 명)
//       node tools/3d/gen-models.mjs --all             (전체 영웅+적)
//
// Meshy Image-to-3D (openapi/v1). 응답 스키마가 다르면 첫 실행 로그를 보고 조정한다.

import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// 키 파싱 — 파일에서 # 주석·빈 줄은 무시하고 첫 실제 키 줄만 사용(사용자가 주석 아래에 붙여넣어도 OK)
function readKey() {
  if (process.env.MESHY_API_KEY) return process.env.MESHY_API_KEY.trim();
  const f = join(ROOT, 'tools/3d/meshy-key.txt');
  if (!existsSync(f)) return '';
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (s && !s.startsWith('#') && s !== '여기에_키를_붙여넣으세요') return s;
  }
  return '';
}
const KEY = readKey();
if (!KEY) { console.error('키 없음: tools/3d/meshy-key.txt 의 주석 아래에 Meshy API 키를 붙여넣으세요(또는 MESHY_API_KEY 환경변수).'); process.exit(1); }

const HEROES = ['lvbu','guanyu','caocao','zhugeliang','zhangfei','zhaoyun','zhouyu','xiahoudun','sunce','dongzhuo','zhangliao','ganning','liubei','sunshangxiang','yuanshao','xunyu','huaxiong','zhoucang','caohong','handang','jiling','liaohua','yujin','chengpu'];
const ENEMIES = ['yellow-turban','dong-soldier','warlord-soldier','yuan-soldier','wu-soldier','nanman-soldier','zhangjiao'];

const API = 'https://api.meshy.ai/openapi/v1/image-to-3d';
const OUT = join(ROOT, 'assets/models');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pngDataUri(id, kind) {
  const dir = kind === 'enemy' ? 'assets/enemies-cut' : 'assets/heroes-cut';
  const p = join(ROOT, dir, id + '.png');
  if (!existsSync(p)) throw new Error('PNG 없음: ' + p);
  return 'data:image/png;base64,' + readFileSync(p).toString('base64');
}

async function createTask(dataUri) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: dataUri, enable_pbr: true, should_remesh: true, should_texture: true, ai_model: 'meshy-5', target_polycount: 20000 }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`create ${res.status}: ${txt}`);
  const j = JSON.parse(txt);
  return j.result || j.id || j.task_id;
}

// GLB 최적화 — 텍스처 1024 축소 + 양자화(three 네이티브, draco 미사용). 8.5MB→~1MB.
function optimize(rawPath, finalPath) {
  execSync(`npx --yes @gltf-transform/cli@latest optimize "${rawPath}" "${finalPath}" --compress quantize --texture-size 1024`, { stdio: 'pipe' });
}

async function pollTask(taskId) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${API}/${taskId}`, { headers: { Authorization: 'Bearer ' + KEY } });
    const j = JSON.parse(await res.text());
    const st = j.status;
    process.stdout.write(`\r  ${st} ${j.progress ?? ''}%   `);
    if (st === 'SUCCEEDED') { console.log(''); return j; }
    if (st === 'FAILED' || st === 'CANCELED') throw new Error('task ' + st + ' ' + JSON.stringify(j.task_error || j));
    await sleep(5000);
  }
  throw new Error('타임아웃');
}

const FORCE = process.argv.includes('--force');
async function genOne(id, kind) {
  const out = join(OUT, id + '.glb');
  if (existsSync(out) && !FORCE) { console.log(`[${id}] 이미 있음 — 건너뜀`); return; }
  console.log(`\n[${id}] 생성 시작…`);
  const taskId = await createTask(pngDataUri(id, kind));
  console.log(`  task=${taskId}`);
  const done = await pollTask(taskId);
  const glbUrl = done.model_urls?.glb;
  if (!glbUrl) throw new Error('glb URL 없음: ' + JSON.stringify(done.model_urls));
  const glb = Buffer.from(await (await fetch(glbUrl)).arrayBuffer());
  const raw = out + '.raw';
  writeFileSync(raw, glb);
  optimize(raw, out); // 최적화(텍스처·양자화)
  const sz = statSync(out).size;
  try { rmSync(raw); } catch { /* noop */ }
  console.log(`  ✔ ${id}.glb  ${(glb.length / 1048576).toFixed(1)}MB → ${(sz / 1048576).toFixed(2)}MB`);
}

const args = process.argv.slice(2);
let list;
if (args.includes('--all')) list = [...HEROES.map((h) => [h, 'hero']), ...ENEMIES.map((e) => [e, 'enemy'])];
else list = args.map((a) => [a, ENEMIES.includes(a) ? 'enemy' : 'hero']);
if (!list.length) { console.error('대상 없음. 예: node tools/3d/gen-models.mjs guanyu'); process.exit(1); }

for (const [id, kind] of list) {
  try { await genOne(id, kind); }
  catch (e) { console.error(`  �’ ${id} 실패: ${e.message}`); }
}
console.log('\n완료.');
