// 삼국지 랜덤 디펜스 — 3D 필드 렌더러 (Three.js, 로컬 번들).
// 엔진 좌표(x/y 0~100)를 바닥 평면에 매핑하고, 치비 컷아웃 PNG를 "서 있는 빌보드"로 세운다(2.5D).
// 엔진/데이터는 읽기만 한다. DOM은 캔버스 1개 + (이름표는 defense-screen이 project()로 오버레이).

import * as THREE from '../vendor/three.module.js';
import { DEFENSE, ELEMENT_COLOR } from '../data/defense.js';

// ── 튜닝값 (라이브 조정) ──────────────────────────────
const FIELD_W = 10;              // 월드 가로(=필드 100%). 세로는 화면 비율로 파생.
const TILT = 0.60;               // 카메라 기울기(라디안, 수직 0=탑다운). ~34°.
const CAM_FOV = 40;
const CAM_DIST = 15.2;           // 바라보는 점에서 카메라까지 거리
const CAM_LIFT = 0.7;            // 시선을 필드 중앙보다 살짝 위로(원근 여유)
const UNIT_H = 2.15;             // 유닛 빌보드 높이(월드)
const ENEMY_H = 1.85;            // 적 기준 높이(× 사이즈 배수)
const BOB_AMP = 0.05;            // idle 상하 흔들림
// ─────────────────────────────────────────────────────

let renderer, scene, cam;
let mountEl, W = 1, H = 1, FIELD_D = 13;
let raycaster, groundMesh, groundPlane;
let planeGeo, shadowTex, shadowGeo, shadowMat;
const texCache = new Map();      // url -> {tex, aspect, loaded}
const units = new Map();         // uid -> node
const enemies = new Map();       // eid -> node
let clock = 0;

function heroCut(id) { return `./assets/heroes-cut/${id}.png`; }
function enemyCut(id) { return `./assets/enemies-cut/${id}.png`; }

// 필드% → 월드 좌표
function wx(x) { return (x / 100 - 0.5) * FIELD_W; }
function wz(y) { return (y / 100 - 0.5) * FIELD_D; }

// 부드러운 원형 그림자 텍스처(캔버스 1회 생성)
function makeShadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,0.42)');
  grd.addColorStop(0.7, 'rgba(0,0,0,0.20)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 은은한 하늘/배경 그라디언트
function makeSkyTex() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#2a1d12');
  grd.addColorStop(0.5, '#5b4026');
  grd.addColorStop(1, '#8a6238');
  g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function loadTex(url) {
  let e = texCache.get(url);
  if (e) return e;
  e = { tex: null, aspect: 1, loaded: false };
  texCache.set(url, e);
  new THREE.TextureLoader().load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    e.tex = tex;
    e.aspect = (tex.image.width || 1) / (tex.image.height || 1);
    e.loaded = true;
  });
  return e;
}

export function init(mount, w, h) {
  mountEl = mount; W = Math.max(1, w); H = Math.max(1, h);
  FIELD_D = FIELD_W * (H / W);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cv = renderer.domElement;
  cv.className = 'rd-3d';
  cv.setAttribute('aria-hidden', 'true');
  mountEl.appendChild(cv);

  scene = new THREE.Scene();
  scene.background = makeSkyTex();
  scene.fog = new THREE.Fog(0x6b4c2c, FIELD_D * 0.9, FIELD_D * 2.4);

  cam = new THREE.PerspectiveCamera(CAM_FOV, W / H, 0.1, 200);
  placeCamera();

  scene.add(new THREE.HemisphereLight(0xfff1da, 0x4a381f, 1.15));
  const sun = new THREE.DirectionalLight(0xffe4b0, 1.0);
  sun.position.set(4, 8, 6); scene.add(sun);

  // 바닥 — 따뜻한 사막 톤. 살짝 텍스처 느낌은 Phase3.
  groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_W * 3, FIELD_D * 3),
    new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 1, metalness: 0 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);

  // 배치 구역(점선 네모) — 바닥 위 얇은 외곽선
  const b = DEFENSE.unit.bounds;
  const boxW = (b.x2 - b.x1) / 100 * FIELD_W, boxD = (b.y2 - b.y1) / 100 * FIELD_D;
  const cx = ((b.x1 + b.x2) / 2 / 100 - 0.5) * FIELD_W;
  const cz = ((b.y1 + b.y2) / 2 / 100 - 0.5) * FIELD_D;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(boxW, boxD)),
    new THREE.LineBasicMaterial({ color: 0xf3e2b0, transparent: true, opacity: 0.5 })
  );
  edges.rotation.x = -Math.PI / 2; edges.position.set(cx, 0.02, cz);
  scene.add(edges);

  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  planeGeo = new THREE.PlaneGeometry(1, 1);
  shadowTex = makeShadowTex();
  shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
}

function placeCamera() {
  // 필드 중앙을 바라보되 살짝 위(원근 여유). 기울기 TILT(수직 기준).
  const look = new THREE.Vector3(0, CAM_LIFT, wz(50) - FIELD_D * 0.04);
  cam.position.set(0, Math.cos(TILT) * CAM_DIST + look.y, Math.sin(TILT) * CAM_DIST + look.z);
  cam.lookAt(look);
}

export function resize(w, h) {
  if (!renderer) return;
  W = Math.max(1, w); H = Math.max(1, h);
  FIELD_D = FIELD_W * (H / W);
  renderer.setSize(W, H, false);
  cam.aspect = W / H; cam.updateProjectionMatrix();
  placeCamera();
}

// 빌보드 노드 생성(유닛/적 공용)
function makeBillboard() {
  const group = new THREE.Group();
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; shadow.renderOrder = 1;
  group.add(shadow);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, depthWrite: true });
  const sprite = new THREE.Mesh(planeGeo, mat);
  sprite.renderOrder = 2;
  group.add(sprite);
  group.visible = false; // 텍스처 로드 전까지 숨김(흰 사각형 방지)
  scene.add(group);
  return { group, sprite, shadow, url: null, sized: false, phase: Math.random() * 6.28 };
}
function disposeNode(n) {
  scene.remove(n.group);
  n.sprite.material.dispose();
}

// 원하는 텍스처/높이를 기록만. 실제 맵·사이징은 frame()에서 로드 완료 시 1회 적용
// (텍스처가 비동기라 sync 호출 시점엔 아직 안 왔을 수 있음 — 프레임 구동으로 확실히 반영).
function applyTex(n, url, baseH) {
  if (n.url !== url || n.wantH !== baseH) {
    n.url = url; n.wantH = baseH; n.sized = false; n.mapSet = false;
    n._texEntry = loadTex(url);
  }
}
function ensureVisual(n) {
  const e = n._texEntry;
  if (!e || !e.loaded) return;
  if (!n.mapSet) { n.sprite.material.map = e.tex; n.sprite.material.needsUpdate = true; n.mapSet = true; }
  if (!n.sized) {
    const h = n.wantH, w = h * e.aspect;
    n.sprite.scale.set(w, h, 1);
    n.sprite.position.y = h / 2;
    n.shadow.scale.set(w * 0.72, w * 0.38, 1);
    n.baseW = w; n.baseH = h; n.sized = true;
    n.group.visible = true;
  }
}

export function syncUnits(list) {
  const seen = new Set();
  for (const u of list) {
    seen.add(u.uid);
    let n = units.get(u.uid);
    if (!n) { n = makeBillboard(); units.set(u.uid, n); }
    applyTex(n, heroCut(u.heroId), UNIT_H);
    n.group.position.x = wx(u.x); n.group.position.z = wz(u.y);
    n.face = u.face || 1; n.moving = !!u.moving;
    n.lunge = 0;
  }
  for (const [uid, n] of units) if (!seen.has(uid)) { disposeNode(n); units.delete(uid); }
}

export function syncEnemies(list) {
  const seen = new Set();
  const sizes = DEFENSE.wave.sizes, bscale = DEFENSE.wave.boss.scale;
  for (const e of list) {
    seen.add(e.eid);
    let n = enemies.get(e.eid);
    if (!n) { n = makeBillboard(); enemies.set(e.eid, n); }
    const mult = (sizes[e.size]?.scale || 1) * (e.isBoss ? bscale : 1);
    applyTex(n, enemyCut(e.spriteId), ENEMY_H * mult);
    n.group.position.x = wx(e.x); n.group.position.z = wz(e.y);
    n.face = e.face || 1;
    n.hit = e.hit > 0;
  }
  for (const [eid, n] of enemies) if (!seen.has(eid)) { disposeNode(n); enemies.delete(eid); }
}

// 매 프레임 — 빌보드가 카메라를 바라보게(수직 유지) + idle bob + 좌우 뒤집기, 그리고 렌더.
export function frame(dt) {
  if (!renderer) return;
  clock += dt;
  const camX = cam.position.x, camZ = cam.position.z;
  const upd = (n, bob) => {
    ensureVisual(n);
    if (!n.sized) return;
    const g = n.group;
    if (n.lungeAmt > 0) { // 공격 순간 그 적 쪽으로 살짝 돌진(sync가 매 프레임 기준위치로 되돌림)
      g.position.x += n.lx * n.lungeAmt; g.position.z += n.lz * n.lungeAmt;
      n.lungeAmt -= dt * 6; if (n.lungeAmt < 0) n.lungeAmt = 0;
    }
    g.rotation.y = Math.atan2(camX - g.position.x, camZ - g.position.z);
    n.sprite.scale.x = n.baseW * (n.face || 1);
    const y = bob ? Math.sin(clock * 2.4 + n.phase) * BOB_AMP : 0;
    n.sprite.position.y = n.baseH / 2 + y + (n.hit ? -0.04 : 0);
    n.sprite.material.color.setScalar(n.hit ? 1.6 : 1); // 피격 플래시
  };
  for (const n of units.values()) upd(n, true);
  for (const n of enemies.values()) upd(n, false);
  renderer.render(scene, cam);
}

// 월드 위치(필드%) → 화면(캔버스) 픽셀 좌표. hFrac: 캐릭터 높이 대비(1=머리 위).
export function project(x, y, hFrac = 1, baseH = UNIT_H) {
  const v = new THREE.Vector3(wx(x), baseH * hFrac, wz(y));
  v.project(cam);
  return { sx: (v.x * 0.5 + 0.5) * W, sy: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 };
}

// 캔버스 로컬 픽셀 → 필드%(바닥 레이캐스트). 드래그 배치용.
export function fieldFromPx(px, py) {
  const ndc = new THREE.Vector2((px / W) * 2 - 1, -(py / H) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  return { x: (hit.x / FIELD_W + 0.5) * 100, y: (hit.z / FIELD_D + 0.5) * 100 };
}

// 공격 순간 그 적(tx,ty%) 쪽으로 잠깐 돌진하는 연출
export function lunge(uid, tx, ty) {
  const n = units.get(uid); if (!n || !n.sized) return;
  const dx = wx(tx) - n.group.position.x, dz = wz(ty) - n.group.position.z;
  const m = Math.hypot(dx, dz) || 1;
  n.lx = (dx / m) * 0.3; n.lz = (dz / m) * 0.3; n.lungeAmt = 1;
}

export function dispose() {
  for (const [, n] of units) disposeNode(n); units.clear();
  for (const [, n] of enemies) disposeNode(n); enemies.clear();
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  renderer = scene = cam = null;
  texCache.clear();
}

export function ready() { return !!renderer; }
