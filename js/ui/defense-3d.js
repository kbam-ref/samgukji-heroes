// 삼국지 랜덤 디펜스 — 3D 필드 렌더러 (Three.js, 로컬 번들).
// 엔진 좌표(x/y 0~100)를 바닥 평면에 매핑하고, 치비 컷아웃 PNG를 "서 있는 빌보드"로 세운다(2.5D).
// 엔진/데이터는 읽기만 한다. DOM은 캔버스 1개 + (이름표는 defense-screen이 project()로 오버레이).

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as skeletonClone } from '../vendor/SkeletonUtils.js';
import { DEFENSE, ELEMENT_COLOR } from '../data/defense.js';

// ── 튜닝값 (라이브 조정) ──────────────────────────────
const FIELD_W = 10;              // 월드 가로(=필드 100%). 세로는 화면 비율로 파생.
const TILT = 0.74;               // 카메라 기울기(라디안, 수직 0=탑다운). 살짝 옆에서 봐 모델 얼굴이 보이게.
const CAM_FOV = 40;
const CAM_DIST = 15.2;           // 바라보는 점에서 카메라까지 거리
const CAM_LIFT = 0.7;            // 시선을 필드 중앙보다 살짝 위로(원근 여유)
const UNIT_H = 2.15;             // 유닛 높이(월드)
const ENEMY_H = 1.85;            // 적 기준 높이(× 사이즈 배수)
const BOB_AMP = 0.05;            // idle 상하 흔들림
const MODEL_YAW = 0;             // GLB 모델 기본 정면 보정(뒷면 보이면 Math.PI)
const FACE_TURN = 0.5;           // 헤딩(좌/우)으로 모델이 트는 각도(라디안)
const MODEL_LEAN = 0.32;         // 모델을 카메라 쪽으로 젖혀 얼굴이 보이게(탑다운 보정)
const ENEMY_3D = true;           // 적을 3D 모델로(성능 부담 시 false → 적은 빌보드, 영웅만 3D)
// ─────────────────────────────────────────────────────

let renderer, scene, cam;
let mountEl, W = 1, H = 1, FIELD_D = 13;
let raycaster, groundMesh, groundPlane, arenaMat, arenaUrl = '';
let planeGeo, shadowTex, shadowGeo, shadowMat;
const texCache = new Map();      // url -> {tex, aspect, loaded}
const units = new Map();         // uid -> node
const enemies = new Map();       // eid -> node
let clock = 0;
// 3D 이펙트(투사체·명중·광역·사망) — 공유 지오메트리 + 메시 풀로 드로우콜·GC 최소화
const fx3d = [];
const pool = { arrow: [], slash: [], burst: [], ring: [] };
let burstTex, ringGeo, arrowGeo, burstGeo;

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
// 명중·광역 이펙트용 방사형 스파크 텍스처
function makeBurstTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); g.stroke(); }
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

// ── GLB 3D 모델(있으면 빌보드 대신 사용, 없으면 폴백) ──
const gltfLoader = new GLTFLoader();
const modelCache = new Map(); // id -> {proto, anims, bbox, loaded, failed}
function loadModel(id) {
  let e = modelCache.get(id);
  if (e) return e;
  e = { proto: null, anims: null, bbox: null, loaded: false, failed: false };
  modelCache.set(id, e);
  gltfLoader.load(`./assets/models/${id}.glb`,
    (gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      e.bbox = { sx: size.x || 1, sy: size.y || 1, sz: size.z || 1, cx: c.x, cz: c.z, minY: box.min.y };
      gltf.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; o.castShadow = false; o.receiveShadow = false; } });
      e.anims = gltf.animations || [];
      // 루트 모션 제거 → 제자리걷기(엔진이 위치 제어). Meshy 리그 루트본=Hips.
      for (const clip of e.anims) clip.tracks = clip.tracks.filter((t) => t.name !== 'Hips.position');
      e.animated = e.anims.length > 0 && gltf.scene.getObjectByProperty('isSkinnedMesh', true) != null;
      e.proto = gltf.scene; e.loaded = true;
    },
    undefined,
    () => { e.failed = true; } // GLB 없으면(아직 미생성) 빌보드로 폴백
  );
  return e;
}
// 정적 GLB 인스턴스 — 클론(지오메트리·머티리얼 공유). (스킨드 애니는 추후 SkeletonUtils)
function buildModel(n) {
  const md = n.model;
  const animated = md.animated;
  const inst = animated ? skeletonClone(md.proto) : md.proto.clone(true);
  // 사이즈·오프셋 — 스킨드는 posed bbox(스킨 반영), 정적은 사전계산 bbox
  let sy, sx, cx, cz, minY;
  if (animated) {
    let sm = null; inst.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; });
    if (sm) { sm.computeBoundingBox(); const b = sm.boundingBox; sy = b.max.y - b.min.y; sx = b.max.x - b.min.x; cx = (b.max.x + b.min.x) / 2; cz = (b.max.z + b.min.z) / 2; minY = b.min.y; }
    else { const bb = md.bbox; sy = bb.sy; sx = bb.sx; cx = bb.cx; cz = bb.cz; minY = bb.minY; }
  } else { const bb = md.bbox; sy = bb.sy; sx = bb.sx; cx = bb.cx; cz = bb.cz; minY = bb.minY; }
  const s = n.wantH / (sy || 1);
  inst.scale.setScalar(s);
  inst.position.set(-cx * s, -minY * s, -cz * s);
  const holder = new THREE.Group(); // 헤딩(Y)·젖힘(X) 회전용 래퍼 — 발밑을 축으로
  holder.rotation.x = -MODEL_LEAN;   // 카메라 쪽으로 젖혀 얼굴이 보이게(탑다운 보정)
  holder.add(inst);
  n.group.add(holder);
  n.modelObj = holder;
  if (animated) { n.mixer = new THREE.AnimationMixer(inst); n.mixer.clipAction(md.anims[0]).play(); } // 스켈레탈 걷기
  if (n.sprite) n.sprite.visible = false; // 빌보드 숨김
  n.shadow.scale.set(sx * s * 0.8, sx * s * 0.42, 1);
  n.baseH = n.wantH; n.sized = true; n.isModel = true; n.modelBuilt = true;
  n.group.visible = true;
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

  scene.add(new THREE.HemisphereLight(0xfff1da, 0x4a381f, 1.1));
  const sun = new THREE.DirectionalLight(0xffe8c0, 1.25);
  sun.position.set(5, 9, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x88b6ff, 0.35); // 푸른 림라이트로 3D 볼륨 강조
  rim.position.set(-5, 4, -4); scene.add(rim);
  // 환경맵 — 금장·갑옷 PBR 반사(없으면 금속이 검게). 따뜻한 방 환경 근사.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x8a7a5a);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  } catch { /* PMREM 불가 환경이면 무시 */ }

  // 바깥 지형(먼 바닥) — 어두운 톤, 안개로 사라짐 → 디오라마 깊이
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_W * 3.4, FIELD_D * 3.4),
    new THREE.MeshStandardMaterial({ color: 0x43331f, roughness: 1, metalness: 0 })
  );
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; scene.add(outer);
  // 전장 바닥(플레이 영역) — 아레나 배경 그림을 깐다(setArena로 교체). 살짝 어둡게 해 캐릭터가 뜨게.
  arenaMat = new THREE.MeshStandardMaterial({ color: 0x9c7c52, roughness: 1, metalness: 0 });
  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 1.02, FIELD_D * 1.02), arenaMat);
  groundMesh.rotation.x = -Math.PI / 2; scene.add(groundMesh);

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

  // 이펙트 공유 자원
  burstTex = makeBurstTex();
  burstGeo = new THREE.PlaneGeometry(1, 1);
  arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
  ringGeo = new THREE.RingGeometry(0.86, 1.0, 40);
}

// 이펙트 메시 풀 — 종류별 재사용(GC 스파이크 방지)
function takeFx(kind, colorHex) {
  let m = pool[kind].pop();
  if (!m) {
    const geo = kind === 'arrow' ? arrowGeo : kind === 'ring' ? ringGeo : burstGeo;
    const mat = kind === 'arrow'
      ? new THREE.MeshBasicMaterial()
      : kind === 'ring'
        ? new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })
        : new THREE.MeshBasicMaterial({ map: burstTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    m = new THREE.Mesh(geo, mat);
    if (kind === 'ring') m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    scene.add(m);
  }
  m.visible = true; m.material.opacity = 1; m.material.color.set(colorHex);
  return m;
}
function freeFx(kind, m) { m.visible = false; pool[kind].push(m); }
function faceCam(m) { if (cam) m.quaternion.copy(cam.quaternion); }

// 참격/화살 — 유닛 몸통에서 적 몸통으로 날아가 명중 스파크
export function spawnShot3d(sx, sy, ex, ey, weapon, colorHex, reduce) {
  if (!renderer) return;
  const to = new THREE.Vector3(wx(ex), ENEMY_H * 0.42, wz(ey));
  if (reduce) { spawnBurst(to, colorHex); return; }
  const from = new THREE.Vector3(wx(sx), UNIT_H * 0.5, wz(sy));
  const arrow = weapon === 'arrow';
  const m = takeFx(arrow ? 'arrow' : 'burst', colorHex);
  if (!arrow) m.scale.setScalar(0.5);
  m.position.copy(from);
  fx3d.push({ kind: 'proj', mk: arrow ? 'arrow' : 'burst', mesh: m, from, to, t: 0, dur: arrow ? 0.22 : 0.1, color: colorHex });
}
function spawnBurst(pos, colorHex) {
  const m = takeFx('burst', colorHex);
  m.position.copy(pos); m.scale.setScalar(0.3);
  fx3d.push({ kind: 'burst', mk: 'burst', mesh: m, t: 0, dur: 0.26 });
}
// 초월 광역기 — 바닥에서 링이 전장으로 퍼진다
export function spawnAoe3d(x, y, colorHex) {
  if (!renderer) return;
  const m = takeFx('ring', colorHex);
  m.position.set(wx(x), 0.06, wz(y)); m.scale.setScalar(0.4); m.material.opacity = 0.7;
  fx3d.push({ kind: 'ring', mk: 'ring', mesh: m, t: 0, dur: 0.62 });
}
// 매 프레임 이펙트 갱신
function updateFx(dt) {
  for (let i = fx3d.length - 1; i >= 0; i--) {
    const f = fx3d[i]; f.t += dt; const p = f.t / f.dur;
    if (f.kind === 'proj') {
      f.mesh.position.lerpVectors(f.from, f.to, Math.min(1, p));
      if (f.mk === 'arrow') f.mesh.lookAt(f.to); else faceCam(f.mesh);
      if (p >= 1) { spawnBurst(f.to, f.color); freeFx(f.mk, f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'burst') {
      faceCam(f.mesh); f.mesh.scale.setScalar(0.3 + p * 1.0); f.mesh.material.opacity = 1 - p;
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'ring') {
      f.mesh.scale.setScalar(0.4 + p * (FIELD_W * 0.5)); f.mesh.material.opacity = 0.7 * (1 - p);
      if (p >= 1) { freeFx('ring', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'die') {
      const s = Math.max(0.001, 1 - p * p); f.node.group.scale.setScalar(s);
      f.node.group.position.y = p * 0.6; f.node.group.rotation.y += dt * 6;
      if (p >= 1) { disposeNode(f.node); fx3d.splice(i, 1); }
    }
  }
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

// 전장 바닥에 아레나 배경 그림을 깐다(스테이지마다 교체). defense-screen의 updateBg가 호출.
export function setArena(url) {
  if (!arenaMat || url === arenaUrl) return;
  arenaUrl = url;
  new THREE.TextureLoader().load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    if (arenaMat) { arenaMat.map = tex; arenaMat.color.set(0xb2a486); arenaMat.needsUpdate = true; } // 살짝 어둡게 → 캐릭터 부각
  }, undefined, () => { /* 없으면 사막톤 폴백 유지 */ });
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
  // GLB 모델이 로드됐으면 빌보드 대신 실제 3D 모델을 세운다(로딩 전엔 빌보드로 먼저 보여줌)
  if (n.model && n.model.loaded) {
    if (!n.modelBuilt) buildModel(n);
    return;
  }
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
    if (!n.modelTried) { n.model = loadModel(u.heroId); n.modelTried = true; } // GLB 있으면 3D 모델로 승격
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
    if (ENEMY_3D && !n.modelTried) { n.model = loadModel(e.spriteId); n.modelTried = true; }
    n.group.position.x = wx(e.x); n.group.position.z = wz(e.y);
    n.face = e.face || 1;
    n.hit = e.hit > 0;
  }
  for (const [eid, n] of enemies) if (!seen.has(eid)) {
    enemies.delete(eid);
    if (n.sized) { // 사망 연출: 오그라들며 회전+상승, 자리에 스파크
      fx3d.push({ kind: 'die', node: n, t: 0, dur: 0.3 });
      spawnBurst(new THREE.Vector3(n.group.position.x, (n.baseH || 1) * 0.4, n.group.position.z), '#e6b678');
    } else disposeNode(n);
  }
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
    if (n.isModel) {
      g.rotation.y = 0; // 모델은 빌보딩 안 함(진짜 3D — 회전이 살아있음)
      const target = MODEL_YAW + (n.face >= 0 ? -1 : 1) * FACE_TURN; // 헤딩(좌/우)으로 몸을 튼다
      n.modelObj.rotation.y += (target - n.modelObj.rotation.y) * Math.min(1, dt * 10);
      if (n.mixer) { // 스켈레탈 — 걷기 애니가 팔다리를 움직임(절차적 미사용)
        n.mixer.update(dt);
        n.modelObj.position.y = n.hit ? -0.06 : 0; n.modelObj.rotation.z = 0;
      } else {
        const walking = bob ? n.moving : true; // 유닛=이동 중일 때만, 적=항상 행군
        const t = clock * (walking ? 8.5 : 2.4) + n.phase;
        n.modelObj.position.y = (n.hit ? -0.06 : 0) + (walking ? Math.abs(Math.sin(t)) * 0.085 : Math.sin(t) * BOB_AMP * 0.6); // 걸음마다 발디딤 튐
        n.modelObj.rotation.z = walking ? Math.sin(t) * 0.05 : 0; // 좌우 뒤뚱(치비 워크)
      }
    } else {
      g.rotation.y = Math.atan2(camX - g.position.x, camZ - g.position.z);
      n.sprite.scale.x = n.baseW * (n.face || 1);
      const y = bob ? Math.sin(clock * 2.4 + n.phase) * BOB_AMP : 0;
      n.sprite.position.y = n.baseH / 2 + y + (n.hit ? -0.04 : 0);
      n.sprite.material.color.setScalar(n.hit ? 1.6 : 1); // 피격 플래시
    }
  };
  for (const n of units.values()) upd(n, true);
  for (const n of enemies.values()) upd(n, false);
  updateFx(dt);
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
  fx3d.length = 0;
  for (const k in pool) pool[k].length = 0;
  for (const [, n] of units) disposeNode(n); units.clear();
  for (const [, n] of enemies) disposeNode(n); enemies.clear();
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  renderer = scene = cam = null;
  texCache.clear();
  for (const [, e] of modelCache) {
    if (e.proto) e.proto.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); }
    });
  }
  modelCache.clear();
}

export function ready() { return !!renderer; }
