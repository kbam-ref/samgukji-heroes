// 삼국지 랜덤 디펜스 — 3D 필드 렌더러 (Three.js, 로컬 번들).
// 엔진 좌표(x/y 0~100)를 바닥 평면에 매핑하고, 치비 컷아웃 PNG를 "서 있는 빌보드"로 세운다(2.5D).
// 엔진/데이터는 읽기만 한다. DOM은 캔버스 1개 + (이름표는 defense-screen이 project()로 오버레이).

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as skeletonClone } from '../vendor/SkeletonUtils.js';
import { DEFENSE, ELEMENT_COLOR } from '../data/defense.js';

// ── 튜닝값 (라이브 조정) ──────────────────────────────
const FIELD_W = 10;              // 월드 가로(=필드 100%). 세로는 화면 비율로 파생.
let TILT = 0.74;                 // 카메라 기울기(라디안, 수직 0=탑다운). 가로에선 더 탑다운(RTS)으로 재설정.
const CAM_FOV = 40;
let CAM_DIST = 15.2;             // 바라보는 점에서 카메라까지 거리 (resize에서 아스펙트로 재계산)
let CAM_LIFT = 0.7;              // 시선을 필드 중앙보다 살짝 위로 (가로에선 낮춰 필드 중앙 정렬)
const UNIT_H = 1.0;              // 유닛 높이(월드) — 더 축소(마린/저글링 스케일)
const ENEMY_H = 0.85;            // 적 기준 높이(× 사이즈 배수)
const BOB_AMP = 0.05;            // idle 상하 흔들림
const MODEL_YAW = 0;             // GLB 모델 기본 정면 보정(뒷면 보이면 Math.PI)
const FACE_TURN = 0.5;           // (레거시) 빌보드 좌우 트는 각도
const MODEL_LEAN = 0.12;         // 걸음 시 앞으로 살짝 기울임(이동방향 바라보기라 카메라 보정 불필요)
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
const pool = { arrow: [], slash: [], lance: [], burst: [], ring: [] };
let burstTex, ringGeo, arrowGeo, burstGeo, slashGeo, lanceGeo, auraGeo, beamGeo;

// 등급 오라 — 별표 대신 "좋은 캐릭"임을 캐릭터 몸에서 뿜는 기운으로. 등급↑ = 색·크기·맥박·후광↑
const AURA = {
  2: { color: 0x86d992, base: 0.9, amp: 0.06, op: 0.15, halo: false, beam: false },
  3: { color: 0x5aa8f2, base: 1.1, amp: 0.10, op: 0.28, halo: false, beam: false },
  4: { color: 0xc79bff, base: 1.55, amp: 0.16, op: 0.55, halo: true, beam: true },  // 전설 — 강한 보라 오라 + 빛기둥
  5: { color: 0xffd24a, base: 1.9, amp: 0.20, op: 0.72, halo: true, beam: true },   // 신화 — 금빛
  6: { color: 0xfff0a0, base: 2.3, amp: 0.26, op: 0.92, halo: true, beam: true },   // 초월 — 찬란
};

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
  if (animated) { // 스켈레탈 — 적=걷기 루프, 영웅=공격 클립(대기 정지 + fx 때 1회)
    n.mixer = new THREE.AnimationMixer(inst);
    const clip = md.anims[0];
    n.action = n.mixer.clipAction(clip);
    if (/attack/i.test(clip.name)) {
      n.action.setLoop(THREE.LoopOnce, 1); n.action.clampWhenFinished = true;
      n.action.play(); n.action.paused = true; // frame0 대기 포즈
      n.isAttacker = true;
    } else { n.action.play(); } // 걷기 루프(적 행군)
  }
  if (n.sprite) n.sprite.visible = false; // 빌보드 숨김
  n.shadow.scale.set(sx * s * 0.8, sx * s * 0.42, 1);
  n.baseH = n.wantH; n.sized = true; n.isModel = true; n.modelBuilt = true;
  n.group.visible = true;
}

export function init(mount, w, h) {
  mountEl = mount; W = Math.max(1, w); H = Math.max(1, h);
  FIELD_D = FIELD_W * (H / W);
  computeCam();

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
  scene.fog = new THREE.Fog(0x6b4c2c, CAM_DIST * 0.95, CAM_DIST * 2.8); // 카메라 거리 기준 — 아레나는 선명, 먼 지형만 사라짐

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

  // 바깥 지형(먼 바닥) — 아레나와 어울리는 따뜻한 톤(어두운 빈 공간 방지), 안개로 사라짐
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_W * 4, FIELD_D * 4),
    new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 1, metalness: 0 })
  );
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; scene.add(outer);
  // 전장 바닥(플레이 영역) — 아레나 그림. 크게 깔아 먼 곳까지 채운다(위 빈 공간 제거).
  arenaMat = new THREE.MeshStandardMaterial({ color: 0x9c7c52, roughness: 1, metalness: 0 });
  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 1.35, FIELD_D * 1.6), arenaMat);
  groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.z = -FIELD_D * 0.12; scene.add(groundMesh);

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
  arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.6);        // 화살 — 길쭉한 축
  ringGeo = new THREE.RingGeometry(0.86, 1.0, 40);
  slashGeo = new THREE.TorusGeometry(0.42, 0.055, 6, 16, Math.PI * 1.15); // 베기 초승달 궤적
  lanceGeo = new THREE.BoxGeometry(0.05, 0.05, 1);          // 창 찌르기 — z로 늘여 씀
  auraGeo = new THREE.PlaneGeometry(1, 1);                  // 등급 오라 발밑 광채
  beamGeo = new THREE.PlaneGeometry(0.62, 1.5);             // 전설+ 몸에서 솟는 빛기둥

  scatterRocks(); // 실제 3D 바위로 전장 입체감(평면 회화 보완)
}

// 필드 가장자리(배치박스 밖)에 저폴리 3D 바위 산개 — 진짜 입체 지형감
function scatterRocks() {
  const geo = new THREE.IcosahedronGeometry(1, 1); // 청크 보울더(각지지 않게 저디테일)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 0.86 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.22; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.66, p.getZ(i) * f); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 1, metalness: 0, flatShading: true }); // 사막 사암 보울더
  const spots = [[6, 13, 1.4], [94, 16, 1.5], [4, 44, 1.1], [96, 50, 1.2], [7, 87, 1.4], [93, 85, 1.3]];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const [x, y, sc] of spots) {
    const s = sc * (0.42 + rnd() * 0.3);
    const r = new THREE.Mesh(geo, mat);
    r.scale.set(s * (0.9 + rnd() * 0.4), s * (0.6 + rnd() * 0.3), s * (0.9 + rnd() * 0.4));
    r.position.set(wx(x), s * 0.28, wz(y)); r.rotation.y = rnd() * 6.28;
    scene.add(r);
    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.rotation.x = -Math.PI / 2; sh.position.set(wx(x), 0.02, wz(y)); sh.scale.set(s * 1.7, s * 1.2, 1);
    scene.add(sh);
  }
}

// 이펙트 메시 풀 — 종류별 재사용(GC 스파이크 방지)
function takeFx(kind, colorHex) {
  let m = pool[kind].pop();
  if (!m) {
    const geo = kind === 'arrow' ? arrowGeo : kind === 'lance' ? lanceGeo : kind === 'slash' ? slashGeo : kind === 'ring' ? ringGeo : burstGeo;
    let mat;
    if (kind === 'arrow' || kind === 'lance') mat = new THREE.MeshBasicMaterial();
    else if (kind === 'slash') mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    else if (kind === 'ring') mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
    else mat = new THREE.MeshBasicMaterial({ map: burstTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
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

// 무기별 전용 공격 연출 — 활=포물선 화살, 창=찌르기, 칼=베기 궤적, 마법=파이어볼. rarity↑ = 큰 이펙트.
export function spawnShot3d(sx, sy, ex, ey, atkType, colorHex, reduce, rarity = 1) {
  if (!renderer) return;
  const pw = 1 + Math.max(0, rarity - 3) * 0.3; // 등급 배수(1~3:1, 4:1.3, 5:1.6, 6:1.9)
  const to = new THREE.Vector3(wx(ex), ENEMY_H * 0.42, wz(ey));
  if (reduce) { spawnBurst(to, colorHex, pw); return; }
  const from = new THREE.Vector3(wx(sx), UNIT_H * 0.55, wz(sy));
  if (atkType === 'bow') {
    // 활 — 화살이 포물선을 그리며 날아가 명중
    const m = takeFx('arrow', colorHex); m.position.copy(from); m.scale.setScalar(pw);
    const mid = from.clone().lerp(to, 0.5); mid.y += 0.55; // 포물선 정점
    fx3d.push({ kind: 'arc', mk: 'arrow', mesh: m, from, mid, to, t: 0, dur: 0.26, color: colorHex, pw });
  } else if (atkType === 'spear') {
    // 창 — 창대가 적을 향해 쭉 뻗었다 사라짐 + 촉 스파크
    const m = takeFx('lance', colorHex); m.scale.set(pw, pw, 0);
    const mid = from.clone().lerp(to, 0.5); m.position.copy(mid); m.lookAt(to);
    fx3d.push({ kind: 'thrust', mk: 'lance', mesh: m, len: from.distanceTo(to), to, t: 0, dur: 0.17, color: colorHex, pw });
  } else if (atkType === 'sword') {
    // 칼 — 적 앞에서 초승달 궤적이 휘둘러짐
    const m = takeFx('slash', colorHex);
    m.position.copy(to); m.position.y = ENEMY_H * 0.5; m.scale.setScalar(0.6 * pw);
    fx3d.push({ kind: 'slash', mk: 'slash', mesh: m, t: 0, dur: 0.2, color: colorHex, pw });
  } else if (atkType === 'magic') {
    // 마법 — 빛나는 구체(파이어볼)가 포물선을 그리며 날아가 적에게서 폭발
    const m = takeFx('burst', colorHex); m.position.copy(from); m.scale.setScalar(0.55 * pw);
    const mid = from.clone().lerp(to, 0.5); mid.y += 0.42; // 살짝 포물선
    fx3d.push({ kind: 'orb', mk: 'burst', mesh: m, from, mid, to, t: 0, dur: 0.3, color: colorHex, pw });
  } else {
    // 기본 근접 — 명중 스파크가 적으로
    const m = takeFx('burst', colorHex); m.scale.setScalar(0.5 * pw); m.position.copy(from);
    fx3d.push({ kind: 'proj', mk: 'burst', mesh: m, from, to, t: 0, dur: 0.1, color: colorHex, pw });
  }
}
function spawnBurst(pos, colorHex, pw = 1) {
  const m = takeFx('burst', colorHex);
  m.position.copy(pos); m.scale.setScalar(0.3 * pw);
  fx3d.push({ kind: 'burst', mk: 'burst', mesh: m, t: 0, dur: 0.26, pw });
}
// 파이어볼 폭발 — 큰 섬광 + 지면 충격 링
function spawnBoom(pos, colorHex, pw = 1) {
  const m = takeFx('burst', colorHex);
  m.position.copy(pos); m.scale.setScalar(0.5 * pw);
  fx3d.push({ kind: 'boom', mk: 'burst', mesh: m, t: 0, dur: 0.34, pw });
  const r = takeFx('ring', colorHex);
  r.position.set(pos.x, 0.07, pos.z); r.scale.setScalar(0.3 * pw); r.material.opacity = 0.6;
  fx3d.push({ kind: 'shock', mk: 'ring', mesh: r, t: 0, dur: 0.4, pw });
}
// 제갈량 끈끈이 — 바닥에 초록 점액 장(반경 radiusPct)이 잠깐 깔렸다 사라진다
export function spawnSlowField3d(x, y, radiusPct, colorHex) {
  if (!renderer) return;
  const m = takeFx('burst', colorHex);
  m.position.set(wx(x), 0.04, wz(y)); m.rotation.x = -Math.PI / 2;
  const d = (radiusPct / 100) * FIELD_W * 2; // 지름(월드)
  m.scale.set(d, d, 1); m.material.opacity = 0.45;
  fx3d.push({ kind: 'slowfield', mk: 'burst', mesh: m, t: 0, dur: 2.6, d });
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
      if (p >= 1) { spawnBurst(f.to, f.color, f.pw); freeFx(f.mk, f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'arc') {
      // 포물선 화살 — 2차 베지에(from→mid→to), 화살촉이 진행방향을 향함
      const u = Math.min(1, p), iu = 1 - u;
      const pos = f.mesh.position;
      pos.set(
        iu * iu * f.from.x + 2 * iu * u * f.mid.x + u * u * f.to.x,
        iu * iu * f.from.y + 2 * iu * u * f.mid.y + u * u * f.to.y,
        iu * iu * f.from.z + 2 * iu * u * f.mid.z + u * u * f.to.z);
      const nu = Math.min(1, u + 0.05), inu = 1 - nu; // 살짝 앞 지점으로 조준
      f.mesh.lookAt(
        inu * inu * f.from.x + 2 * inu * nu * f.mid.x + nu * nu * f.to.x,
        inu * inu * f.from.y + 2 * inu * nu * f.mid.y + nu * nu * f.to.y,
        inu * inu * f.from.z + 2 * inu * nu * f.mid.z + nu * nu * f.to.z);
      if (p >= 1) { spawnBurst(f.to, f.color, f.pw); freeFx('arrow', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'thrust') {
      // 창 찌르기 — 0→길이로 쭉 뻗었다 짧게 유지 후 사라짐
      const ext = p < 0.4 ? p / 0.4 : 1;
      f.mesh.scale.z = f.len * ext;
      f.mesh.material.opacity = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      if (p >= 0.38 && !f.sparked) { f.sparked = true; spawnBurst(f.to, f.color, f.pw); }
      if (p >= 1) { freeFx('lance', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'slash') {
      // 베기 — 초승달이 카메라를 향한 채 휘둘러지며(회전) 커졌다 사라짐
      f.mesh.quaternion.copy(cam.quaternion);
      f.mesh.rotateZ(-0.7 + p * 1.4); // 위→아래 스윕
      f.mesh.scale.setScalar((0.6 + p * 0.7) * (f.pw || 1));
      f.mesh.material.opacity = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.6;
      if (p >= 1) { freeFx('slash', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'dust') {
      // 기마 돌격 흙먼지 — 발밑에서 낮게 퍼지며 옅어짐
      faceCam(f.mesh); f.mesh.scale.setScalar(0.45 + p * 1.1); f.mesh.material.opacity = 0.7 * (1 - p);
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'orb') {
      // 파이어볼 — 포물선 비행, 두근거리며 살짝 커짐, 명중 시 폭발
      const u = Math.min(1, p), iu = 1 - u;
      f.mesh.position.set(
        iu * iu * f.from.x + 2 * iu * u * f.mid.x + u * u * f.to.x,
        iu * iu * f.from.y + 2 * iu * u * f.mid.y + u * u * f.to.y,
        iu * iu * f.from.z + 2 * iu * u * f.mid.z + u * u * f.to.z);
      faceCam(f.mesh); f.mesh.scale.setScalar((0.5 + Math.abs(Math.sin(u * 22)) * 0.08 + u * 0.18) * (f.pw || 1));
      if (p >= 1) { spawnBoom(f.to, f.color, f.pw); freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'boom') {
      // 파이어볼 폭발 — 큰 섬광이 부풀며 사라짐
      faceCam(f.mesh); f.mesh.scale.setScalar((0.5 + p * 2.1) * (f.pw || 1)); f.mesh.material.opacity = 1 - p;
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'shock') {
      // 폭발 충격 링 — 지면을 훑는 작은 파문
      f.mesh.scale.setScalar((0.3 + p * 2.0) * (f.pw || 1)); f.mesh.material.opacity = 0.6 * (1 - p);
      if (p >= 1) { freeFx('ring', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'slowfield') {
      // 끈끈이 장 — 바닥에 눕힌 채(빌보드 X) 살짝 맥박, 뒤쪽 25%에서 서서히 사라짐
      f.mesh.rotation.x = -Math.PI / 2;
      const fade = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      f.mesh.scale.set(f.d * (0.96 + 0.04 * Math.sin(clock * 4)), f.d, 1);
      f.mesh.material.opacity = 0.42 * fade;
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'burst') {
      faceCam(f.mesh); f.mesh.scale.setScalar((0.3 + p * 1.0) * (f.pw || 1)); f.mesh.material.opacity = 1 - p;
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

// 아스펙트에 맞춰 카메라 거리·시선높이 산출 — 가로(넓고 얕은 필드)는 당겨서 폭을 채우고 시선을 바닥 중앙으로.
function computeCam() {
  const aspect = W / H;
  if (aspect >= 1) {
    const hHalf = Math.atan(Math.tan((CAM_FOV * Math.PI / 180) / 2) * aspect); // 수평 반각
    CAM_DIST = Math.max(8.5, (FIELD_W * 0.5) / Math.tan(hHalf * 0.9));          // 필드 폭 ~90% 채우기(빈 가장자리 축소)
    CAM_LIFT = 0.1; TILT = 0.6;  // 더 탑다운(RTS) — 위쪽 하늘/빈 코너 제거, 바닥이 화면을 채움
  } else { CAM_DIST = 15.2; CAM_LIFT = 0.7; TILT = 0.74; }
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
  computeCam();
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
  if (n.hpBar) { n.hpBar.children.forEach((c) => c.material.dispose()); }
  if (n.aura) n.aura.material.dispose();
  if (n.halo) n.halo.material.dispose();
  if (n.beam) n.beam.material.dispose();
}
// 적 머리 위 HP바(3D, 카메라 향함). depthTest 꺼서 항상 위에.
function ensureHpBar(n) {
  if (n.hpBar) return;
  const bg = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: 0x180606, transparent: true, opacity: 0.82, depthWrite: false, depthTest: false }));
  const fill = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: 0x66dd55, transparent: true, depthWrite: false, depthTest: false }));
  bg.scale.set(0.66, 0.11, 1); fill.scale.set(0.61, 0.07, 1); fill.position.z = 0.01;
  const hb = new THREE.Group(); hb.add(bg); hb.add(fill); hb.renderOrder = 5;
  n.group.add(hb); n.hpBar = hb; n.hpFill = fill;
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

// 등급 오라 부여/갱신 — 발밑 광채(모든 등급 공유) + 고등급은 회전 후광 링
function setAura(n, rarity) {
  const t = AURA[Math.min(6, rarity)] || null;
  if (!t) { if (n.aura) n.aura.visible = false; if (n.halo) n.halo.visible = false; return; }
  if (!n.aura) {
    const disc = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ map: burstTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; disc.renderOrder = 1;
    n.group.add(disc); n.aura = disc; n.auraPhase = (units.size % 7) * 0.9;
  }
  n.aura.visible = true; n.aura.material.color.set(t.color); n.auraTier = t;
  if (t.halo) {
    if (!n.halo) {
      const halo = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: t.color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; halo.renderOrder = 1;
      n.group.add(halo); n.halo = halo;
    }
    n.halo.visible = true; n.halo.material.color.set(t.color);
  } else if (n.halo) n.halo.visible = false;
  if (t.beam) { // 전설+ — 몸에서 솟는 빛기둥(수직, 수평 빌보드)
    if (!n.beam) {
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: burstTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 0.75; beam.renderOrder = 1;
      n.group.add(beam); n.beam = beam;
    }
    n.beam.visible = true; n.beam.material.color.set(t.color);
  } else if (n.beam) n.beam.visible = false;
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
    if (n.rarity !== u.rarity) { setAura(n, u.rarity); n.rarity = u.rarity; } // 등급 오라(합성 시 갱신)
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
    ensureHpBar(n); n.hpPct = Math.max(0, e.hp / e.maxHp); // 적 체력바
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
    // 이동 방향(엔진 위치 델타 — 돌진 오프셋 적용 전에 측정)
    const dx = g.position.x - (n.prevX ?? g.position.x), dz = g.position.z - (n.prevZ ?? g.position.z);
    n.prevX = g.position.x; n.prevZ = g.position.z;
    const speed = Math.hypot(dx, dz);
    if (n.lungeAmt > 0) { g.position.x += n.lx * n.lungeAmt; g.position.z += n.lz * n.lungeAmt; n.lungeAmt -= dt * 6; if (n.lungeAmt < 0) n.lungeAmt = 0; }
    // 바라볼 방향: 공격 중=타겟, 이동 중=이동 방향(마린/저글링), 정지=마지막 방향
    let yaw;
    if (n.faceT > 0) { n.faceT -= dt; yaw = n.atkYaw; }
    else if (speed > 0.0015) { yaw = Math.atan2(dx, dz); n.headYaw = yaw; }
    else yaw = (n.headYaw != null) ? n.headYaw : Math.atan2(camX - g.position.x, camZ - g.position.z);
    const moving = speed > 0.0015;
    if (n.isModel) {
      g.rotation.y = 0;
      let cur = n.modelObj.rotation.y, diff = yaw - cur;
      while (diff > Math.PI) diff -= 6.28318; while (diff < -Math.PI) diff += 6.28318;
      n.modelObj.rotation.y = cur + diff * Math.min(1, dt * 12); // 이동/공격 방향으로 몸 회전
      if (n.mixer) { // 스켈레탈 — 팔다리 애니(적=걷기, 영웅=공격/대기)
        n.mixer.update(dt);
        n.modelObj.position.y = n.hit ? -0.06 : 0;
        n.modelObj.rotation.z = n.isAttacker ? Math.sin(clock * 1.6 + n.phase) * 0.02 : 0;
      } else { // 절차적(정적 모델) — 이동 시 걸음 튐, 정지 시 미세 숨쉬기, 공격 시 내려치기 스윙
        const t = clock * (moving ? 8.5 : 2.4) + n.phase;
        n.modelObj.position.y = (n.hit ? -0.06 : 0) + (moving ? Math.abs(Math.sin(t)) * 0.07 : Math.sin(t) * BOB_AMP * 0.6);
        if (n.swingT > 0) { // 공격 스윙 — 앞으로 숙였다 복귀(무기 없어도 '친다'는 느낌)
          n.swingT -= dt;
          const sp = Math.sin((1 - n.swingT / 0.28) * Math.PI); // 0→1→0
          n.modelObj.rotation.x = -sp * 0.6; n.modelObj.rotation.z = sp * 0.12;
        } else { n.modelObj.rotation.x = 0; n.modelObj.rotation.z = moving ? Math.sin(t) * 0.05 : 0; }
      }
    } else {
      g.rotation.y = Math.atan2(camX - g.position.x, camZ - g.position.z);
      n.sprite.scale.x = n.baseW * (n.face || 1);
      const y = bob ? Math.sin(clock * 2.4 + n.phase) * BOB_AMP : 0;
      n.sprite.position.y = n.baseH / 2 + y + (n.hit ? -0.04 : 0);
      n.sprite.material.color.setScalar(n.hit ? 1.6 : 1);
    }
    if (n.aura && n.aura.visible) { // 등급 오라 — 발밑 광채가 등급색으로 맥박, 고등급은 후광 링 호흡
      const t = n.auraTier, puls = Math.sin(clock * 2.6 + (n.auraPhase || 0));
      const s = (t.base + puls * t.amp) * (n.baseH || 1);
      n.aura.scale.set(s, s, 1);
      n.aura.material.opacity = t.op * (0.82 + 0.18 * puls);
      if (n.halo && n.halo.visible) {
        const hs = s * (1.2 + puls * 0.06);
        n.halo.scale.set(hs, hs, 1);
        n.halo.material.opacity = t.op * 0.6 * (0.7 + 0.3 * puls);
      }
      if (n.beam && n.beam.visible) { // 빛기둥 — 수평으로 카메라 향하고 세로 유지, 맥박
        n.beam.rotation.y = Math.atan2(camX - g.position.x, camZ - g.position.z);
        const bh = (n.baseH || 1) * (1.05 + puls * 0.1);
        n.beam.scale.set((n.baseH || 1) * (0.9 + puls * 0.08), bh, 1);
        n.beam.position.y = bh * 0.5;
        n.beam.material.opacity = t.op * 0.5 * (0.7 + 0.3 * puls);
      }
    }
    if (n.hpBar) { // 적 HP바 — 머리 위, 카메라 향함, 체력 비율만큼 채움
      n.hpBar.visible = n.hpPct < 0.999;
      if (n.hpBar.visible) {
        n.hpBar.position.set(0, n.baseH + 0.16, 0);
        n.hpBar.quaternion.copy(cam.quaternion);
        const pc = Math.max(0.001, n.hpPct);
        n.hpFill.scale.x = 0.61 * pc; n.hpFill.position.x = -0.305 * (1 - pc);
        n.hpFill.material.color.setHex(pc <= 0.3 ? 0xdd4433 : pc <= 0.6 ? 0xe0b83a : 0x66dd55);
      }
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

// 영웅 공격 애니 1회 재생(스켈레탈 공격 클립). 정적/절차적 모델이면 무시.
export function playAttack(uid) {
  const n = units.get(uid);
  if (!n) return;
  if (n.action && n.isAttacker) { n.action.reset(); n.action.timeScale = 2.6; n.action.paused = false; n.action.play(); }
  else n.swingT = 0.28; // 공격 클립 없는 모델(리깅 실패 4종) — 절차적 '내려치기' 스윙
}

// 공격 순간 그 적(tx,ty%) 쪽으로 잠깐 돌진하는 연출
export function lunge(uid, tx, ty) {
  const n = units.get(uid); if (!n || !n.sized) return;
  const dx = wx(tx) - n.group.position.x, dz = wz(ty) - n.group.position.z;
  const m = Math.hypot(dx, dz) || 1;
  const amt = n.isAttacker ? 0.13 : 0.45; // 스켈레탈은 클립이 팔다리를 움직이니 돌진 최소화(앞뒤 슬라이드 방지)
  n.lx = (dx / m) * amt; n.lz = (dz / m) * amt; n.lungeAmt = 1;
  n.atkYaw = Math.atan2(dx / m, dz / m); n.faceT = 0.45; // 그 적을 바라보며 공격
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
