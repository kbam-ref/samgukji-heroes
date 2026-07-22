// 삼국지 랜덤 디펜스 — 3D 필드 렌더러 (Three.js, 로컬 번들).
// 엔진 좌표(x/y 0~100)를 바닥 평면에 매핑하고, 치비 컷아웃 PNG를 "서 있는 빌보드"로 세운다(2.5D).
// 엔진/데이터는 읽기만 한다. DOM은 캔버스 1개 + (이름표는 defense-screen이 project()로 오버레이).

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as skeletonClone } from '../vendor/SkeletonUtils.js';
import { DEFENSE, ELEMENT_COLOR, ENEMY_SPRITES, BOSS_SPRITES, HERO_ATTACK_TYPE } from '../data/defense.js';

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

// 등급 오라 — 별표 대신 "좋은 캐릭"임을 캐릭터 몸에서 뿜는 기운으로. 등급↑ = 색·크기·맥박·빛기둥↑
// 2026-07-22 수석: 바닥 후광 링(halo) 폐지 — 사정거리로 오해됨. 대신 몸에서 솟는 빛기둥(beam)으로만 표현.
const AURA = {
  2: { color: 0x86d992, base: 0.72, amp: 0.05, op: 0.12, halo: false, beam: false },
  3: { color: 0x5aa8f2, base: 0.86, amp: 0.08, op: 0.22, halo: false, beam: false },
  4: { color: 0xc79bff, base: 1.0, amp: 0.12, op: 0.42, halo: false, beam: true },  // 전설 — 보라 빛기둥
  5: { color: 0xffd24a, base: 1.15, amp: 0.15, op: 0.55, halo: false, beam: true }, // 신화 — 금빛 빛기둥
  6: { color: 0xfff0a0, base: 1.3, amp: 0.2, op: 0.72, halo: false, beam: true },   // 초월 — 찬란한 빛기둥
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
      // Meshy 공격 클립은 모델마다 편차가 커(측면 흔들림·눕기 등) — 가중치를 낮춰 절차 타격이 주도하게 한다.
      n.action.setEffectiveWeight(0.65);
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
  // 2026-07-22 수석 '몹 쌓이면 렉': 적 100마리 풀필드 렌더는 프래그먼트(픽셀채움) 부하가 커 — 고DPI 폰에서
  //   픽셀비를 1.5로 낮춰 채움부하를 크게 줄인다(체감 선명도 차이는 작고 프레임은 확실히 회복).
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
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
    pmrem.dispose(); // 감사: 렌더타깃 누수 방지(환경맵 텍스처는 dispose()에서 해제)
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

  // 배치 경계는 스산한 선 대신 흙성벽·망루로 표현(buildBoundary, scatterRocks 뒤 호출)
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
  buildBoundary(); // 배치 경계 = 흙성벽 + 모서리 망루(스산한 선 대체, v121)
}

// 배치 경계 — 2026-07-22 수석 "네모 우리 같다": 연속 성벽/망루 폐지. 둘레에 끊긴 흙둔덕·바위·모래주머니·
// 풀·진영 깃발을 불규칙하게(갭 포함) 흩어 '자연스러운 진영 가장자리'로. 낮은 것 위주(적 시야 안 가림), 깃발은 모서리만.
function buildBoundary() {
  const b = DEFENSE.unit.bounds;
  const x1 = wx(b.x1), x2 = wx(b.x2), zF = wz(b.y1), zN = wz(b.y2);
  let seed = 21; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x47453f, roughness: 1, metalness: 0, flatShading: true, envMapIntensity: 0.3 }); // 어두운 회색 돌
  const earthMat = new THREE.MeshStandardMaterial({ color: 0x745730, roughness: 1, metalness: 0, flatShading: true });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xb39457, roughness: 1, metalness: 0, flatShading: true });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x82913e, roughness: 1, metalness: 0, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4f371e, roughness: 1, metalness: 0, flatShading: true });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xb23a2c, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const tentMat = new THREE.MeshStandardMaterial({ color: 0xcdb488, roughness: 1, metalness: 0, flatShading: true });
  const lumpGeo = new THREE.IcosahedronGeometry(1, 0); // 저폴리 흙더미/바위
  const blob = (x, z, s) => { const m = new THREE.Mesh(shadowGeo, shadowMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); m.scale.set(s, s * 0.72, 1); scene.add(m); };

  const grass = (x, z) => { // 풀 포기(선명한 초록 — 색 대비로 '살아있는' 진영)
    for (let i = 0; i < 5; i++) { const h = 0.1 + rnd() * 0.13; const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, h, 4), grassMat); m.position.set(x + (rnd() - 0.5) * 0.3, h / 2, z + (rnd() - 0.5) * 0.3); m.rotation.z = (rnd() - 0.5) * 0.4; scene.add(m); }
  };
  const rocks = (x, z) => { // 어두운 회색 바위 무리(1~2개, 작게)
    const n = 1 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) { const s = 0.09 + rnd() * 0.1; const m = new THREE.Mesh(lumpGeo, stoneMat); m.scale.set(s, s * 0.7, s); m.position.set(x + (rnd() - 0.5) * 0.3, s * 0.34, z + (rnd() - 0.5) * 0.3); m.rotation.y = rnd() * 6.28; scene.add(m); }
    blob(x, z, 0.45);
  };
  const sandbags = (x, z) => { // 모래주머니 더미(낮게 쌓임)
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.12), bagMat); m.position.set(x + (i - 1) * 0.13, 0.05, z + (rnd() - 0.5) * 0.05); m.rotation.y = (rnd() - 0.5) * 0.4; scene.add(m); }
    for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.11), bagMat); m.position.set(x + (i - 0.5) * 0.13, 0.14, z); scene.add(m); }
    blob(x, z, 0.5);
  };
  const berm = (x, z) => { // 낮은 흙둔덕(끊긴 조각) + 풀
    const w = 0.45 + rnd() * 0.5, h = 0.09 + rnd() * 0.07, d = 0.24 + rnd() * 0.16;
    const m = new THREE.Mesh(lumpGeo, earthMat); m.scale.set(w, h, d); m.position.set(x, h * 0.42, z); m.rotation.y = rnd() * 6.28;
    scene.add(m); blob(x, z, w * 1.3); grass(x, z);
  };
  const banner = (x, z, h0 = 0.58) => { // 전장 깃발(장대+붉은 깃천) — 색 포인트
    const h = h0 + rnd() * 0.12;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, h, 6), woodMat); pole.position.set(x, h / 2, z); scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), clothMat); flag.position.set(x + 0.14, h - 0.14, z); flag.rotation.y = -0.2; scene.add(flag);
    blob(x, z, 0.34);
  };
  const brazier = (x, z) => { // 화톳불 — 따뜻한 점광원으로 진영 분위기
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.14, 8), woodMat); pot.position.set(x, 0.07, z); scene.add(pot);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 7), new THREE.MeshBasicMaterial({ color: 0xff9a3c })); fire.position.set(x, 0.21, z); scene.add(fire);
    const light = new THREE.PointLight(0xffa040, 0.55, 2.4); light.position.set(x, 0.32, z); scene.add(light);
    blob(x, z, 0.34);
  };
  const tent = (x, z) => { // 막사(피라미드 텐트+깃발) — '진영' 완성도
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.52, 4), tentMat); body.position.set(x, 0.26, z); body.rotation.y = Math.PI / 4; scene.add(body);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.68, 6), woodMat); pole.position.set(x, 0.34, z); scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.11), clothMat); flag.position.set(x + 0.08, 0.62, z); flag.rotation.y = -0.2; scene.add(flag);
    blob(x, z, 0.72);
  };

  // 둘레를 불규칙하게 훑으며 낮은 프롭 배치(간격·종류 랜덤, 16% 갭). 앞(near)은 성기게 → 시야 확보.
  const edges = [
    { ax: x1, az: zF, bx: x2, bz: zF, nx: 0, nz: -1, n: 6 }, // far(뒤)
    { ax: x2, az: zF, bx: x2, bz: zN, nx: 1, nz: 0, n: 5 },  // right
    { ax: x2, az: zN, bx: x1, bz: zN, nx: 0, nz: 1, n: 3 },  // near(앞) — 성기게
    { ax: x1, az: zN, bx: x1, bz: zF, nx: -1, nz: 0, n: 5 }, // left
  ];
  for (const e of edges) {
    for (let i = 0; i < e.n; i++) {
      if (rnd() < 0.16) continue; // 자연스러운 끊김
      const t = (i + 0.5) / e.n + (rnd() - 0.5) * 0.14, off = 0.14 + rnd() * 0.12;
      const x = e.ax + (e.bx - e.ax) * t + e.nx * off, z = e.az + (e.bz - e.az) * t + e.nz * off;
      const k = rnd();
      if (k < 0.28) rocks(x, z); else if (k < 0.5) sandbags(x, z); else if (k < 0.85) grass(x, z); else berm(x, z);
    }
  }
  // 뒤 두 모서리엔 막사, 네 모서리 깃발, 좌우 중앙 화톳불 — '진영' 완성도(우리(cage) 느낌 없이)
  tent(x1 - 0.3, zF - 0.3); tent(x2 + 0.3, zF - 0.3);
  for (const [cx, cz, ox, oz] of [[x1, zF, -0.16, -0.16], [x2, zF, 0.16, -0.16], [x1, zN, -0.16, 0.16], [x2, zN, 0.16, 0.16]]) banner(cx + ox, cz + oz);
  brazier(x1 - 0.22, (zF + zN) / 2); brazier(x2 + 0.22, (zF + zN) / 2);
}

// 필드 가장자리(배치박스 밖)에 저폴리 3D 바위 산개 — 진짜 입체 지형감.
// 2026-07-22 수석 "배경 완성도": 창백한 사암(골프공 느낌) → 어둑한 회갈색 풍화 바위·개체별 변주 + 곁바위·밑동 풀.
function scatterRocks() {
  const geo = new THREE.IcosahedronGeometry(1, 1); // 청크 보울더(각지지 않게 저디테일)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 0.86 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.22; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.66, p.getZ(i) * f); }
  geo.computeVertexNormals();
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x63702f, roughness: 1, metalness: 0, flatShading: true });
  const spots = [[6, 13, 1.2], [94, 16, 1.3], [4, 44, 0.95], [96, 50, 1.05], [7, 87, 1.2], [93, 85, 1.1]];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const [x, y, sc] of spots) {
    const s = sc * (0.34 + rnd() * 0.22);
    const col = new THREE.Color().setHSL(0.09 + rnd() * 0.03, 0.06 + rnd() * 0.05, 0.13 + rnd() * 0.05); // 어두운 회색 화강암
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 1, metalness: 0, flatShading: true, envMapIntensity: 0.3 });
    const r = new THREE.Mesh(geo, mat);
    r.scale.set(s * (0.9 + rnd() * 0.4), s * (0.55 + rnd() * 0.3), s * (0.9 + rnd() * 0.4));
    r.position.set(wx(x), s * 0.22, wz(y)); r.rotation.y = rnd() * 6.28;
    scene.add(r);
    if (rnd() < 0.75) { // 곁바위(무리 짓기)
      const s2 = s * (0.3 + rnd() * 0.3), r2 = new THREE.Mesh(geo, mat);
      r2.scale.set(s2, s2 * 0.6, s2); r2.position.set(wx(x) + (rnd() - 0.5) * s * 1.7, s2 * 0.18, wz(y) + (rnd() - 0.5) * s * 1.7); r2.rotation.y = rnd() * 6.28;
      scene.add(r2);
    }
    for (let g = 0; g < 3; g++) { // 밑동 풀
      const h = 0.09 + rnd() * 0.1, gm = new THREE.Mesh(new THREE.ConeGeometry(0.03, h, 4), grassMat);
      gm.position.set(wx(x) + (rnd() - 0.5) * s * 2.2, h / 2, wz(y) + (rnd() - 0.5) * s * 2.2); gm.rotation.z = (rnd() - 0.5) * 0.4;
      scene.add(gm);
    }
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
// 조조 싸이오닉 스톰 — 바닥에 보라 전기장이 지지직 깜빡이며 유지(지속 데미지)
export function spawnStorm3d(x, y, radiusPct) {
  if (!renderer) return;
  const m = takeFx('burst', '#a98cff');
  m.position.set(wx(x), 0.05, wz(y)); m.rotation.x = -Math.PI / 2;
  const d = (radiusPct / 100) * FIELD_W * 2;
  m.scale.set(d, d, 1); m.material.opacity = 0.5;
  fx3d.push({ kind: 'storm', mk: 'burst', mesh: m, t: 0, dur: 2.1, d });
}
// 초월 광역기 — 2026-07-22 수석: 바닥 확산 링(사정거리 오해) 폐지. '내리꽂히는 벼락 + 폭발'식 수직 연출로.
//   하늘에서 빛기둥이 내리꽂히고 → 중앙 대형 섬광 → 사방으로 파편(shard)이 솟구쳐 흩어진다. 링 없음.
export function spawnAoe3d(x, y, colorHex) {
  if (!renderer) return;
  const cx = wx(x), cz = wz(y);
  // 1) 하늘에서 내리꽂히는 빛기둥(수직 낙하)
  const bolt = takeFx('burst', '#fff2c8');
  bolt.position.set(cx, 3.2, cz);
  fx3d.push({ kind: 'aoebolt', mk: 'burst', mesh: bolt, cx, cz, t: 0, dur: 0.22 });
  // 2) 착지 순간 중앙 대형 섬광(바닥에 눕힘)
  const flash = takeFx('burst', '#fff2c8');
  flash.position.set(cx, 0.12, cz); flash.rotation.x = -Math.PI / 2; flash.scale.setScalar(1);
  fx3d.push({ kind: 'aoeflash', mk: 'burst', mesh: flash, t: 0, dur: 0.5, delay: 0.18 });
  // 3) 솟구치는 빛기둥(카메라 향함)
  const col = takeFx('burst', colorHex);
  col.position.set(cx, 1.4, cz);
  fx3d.push({ kind: 'aoepillar', mk: 'burst', mesh: col, t: 0, dur: 0.55, delay: 0.16 });
  // 4) 사방 8갈래 파편 — 위로 솟았다 바깥으로 흩어지며 소멸(폭발 별). 링과 달리 '터짐'으로 읽힘.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sh = takeFx('burst', colorHex);
    sh.position.set(cx, 0.3, cz);
    fx3d.push({ kind: 'shard', mk: 'burst', mesh: sh, cx, cz, vx: Math.cos(a) * 3.4, vz: Math.sin(a) * 3.4, t: 0, dur: 0.5, delay: 0.16 });
  }
}
// 매 프레임 이펙트 갱신
function updateFx(dt) {
  for (let i = fx3d.length - 1; i >= 0; i--) {
    const f = fx3d[i]; f.t += dt;
    if (f.delay && f.t < f.delay) { if (f.mesh) f.mesh.material.opacity = 0; continue; } // 지연 시작(순차 연출)
    const p = f.delay ? (f.t - f.delay) / f.dur : f.t / f.dur;
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
      f.mesh.scale.setScalar(0.4 + p * (FIELD_W * (f.big ? 0.75 : 0.5))); f.mesh.material.opacity = (f.big ? 0.85 : 0.7) * (1 - p);
      if (p >= 1) { freeFx('ring', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'storm') {
      // 싸이오닉 스톰 — 바닥 전기장이 빠르게 깜빡(지지직), 뒤 20%에서 소멸
      f.mesh.rotation.x = -Math.PI / 2;
      const fade = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
      const flick = 0.55 + 0.45 * Math.abs(Math.sin(clock * 34 + f.t * 11));
      f.mesh.scale.set(f.d * (0.94 + 0.06 * Math.sin(clock * 9)), f.d, 1);
      f.mesh.material.opacity = 0.5 * fade * flick;
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'aoebolt') {
      // 초월 광역기 — 하늘에서 내리꽂히는 빛기둥(수직 낙하 + 세로로 길쭉)
      faceCam(f.mesh); f.mesh.position.y = 3.2 * (1 - p) + 0.2; f.mesh.scale.set(0.7, 2.4 - p * 1.4, 1); f.mesh.material.opacity = 0.9;
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'aoeflash') {
      // 초월 광역기 중앙 바닥 대형 섬광
      f.mesh.rotation.x = -Math.PI / 2; f.mesh.scale.setScalar(1 + p * 7); f.mesh.material.opacity = 0.8 * (1 - p);
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'aoepillar') {
      // 초월 광역기 중앙 솟구치는 빛기둥
      faceCam(f.mesh); f.mesh.scale.set(1.6 + p * 1.2, 3 + p * 3.5, 1); f.mesh.position.y = 1.6 + p * 1.6; f.mesh.material.opacity = 0.85 * (1 - p);
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'shard') {
      // 초월 광역기 파편 — 중앙에서 위로 솟았다 바깥·아래로 흩어지며 소멸(폭발 별)
      faceCam(f.mesh);
      f.mesh.position.set(f.cx + f.vx * p, 0.3 + Math.sin(p * Math.PI) * 1.3, f.cz + f.vz * p);
      f.mesh.scale.setScalar(0.55 * (1 - p * 0.5)); f.mesh.material.opacity = 1 - p;
      if (p >= 1) { freeFx('burst', f.mesh); fx3d.splice(i, 1); }
    } else if (f.kind === 'die') {
      // 3D 쓰러짐(2026-07-22 수석: 사망이 2D로 보이던 회전Y '카드 뒤집힘' 폐지) —
      //   발밑을 축으로 옆으로 넘어가며 땅속으로 가라앉고, 마지막에 사그라든다.
      const g2 = f.node.group;
      const tip = Math.min(1, p / 0.55);
      g2.rotation.z = (f.dir || 1) * tip * 1.4;                       // 옆으로 쓰러짐(~80°) — Y회전은 건드리지 않음(카드 뒤집힘 방지)
      g2.position.y = -(p * p) * 0.34;                                // 서서히 땅속으로
      g2.scale.setScalar(p < 0.7 ? 1 : Math.max(0.001, 1 - (p - 0.7) / 0.3)); // 후반 사그라듦
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
    n.atkType = HERO_ATTACK_TYPE[u.heroId] || 'sword'; // 무기별 공격 개성(활/마법/근접)
    n.group.position.x = wx(u.x); n.group.position.z = wz(u.y);
    n.face = u.face || 1; n.moving = !!u.moving;
    n.lunge = 0;
    if (n.rarity !== u.rarity) { setAura(n, u.rarity); n.rarity = u.rarity; } // 등급 오라(합성 시 갱신)
  }
  for (const [uid, n] of units) if (!seen.has(uid)) { disposeNode(n); units.delete(uid); }
}

// 준비시간(적 나오기 전)에 전 적/보스 모델을 미리 로드 — 첫 스폰부터 3D(2D 빌보드로 잠깐 뜨는 현상 방지, 수석 2026-07-22)
export function preloadModels() {
  if (!renderer) return;
  for (const id of [...ENEMY_SPRITES, ...BOSS_SPRITES]) loadModel(id);
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
    if (n.sized) { // 사망 연출: 발밑축 3D 쓰러짐 + 땅속 침강, 자리에 흙먼지
      fx3d.push({ kind: 'die', node: n, t: 0, dur: 0.36, dir: (n.face || 1) });
      spawnBurst(new THREE.Vector3(n.group.position.x, (n.baseH || 1) * 0.4, n.group.position.z), '#e6b678');
    } else disposeNode(n);
  }
}

// 공격 포즈(2026-07-22 재설계) — 수석 피드백: '앞으로 미끄러져 뜨는 느낌'(주유)·'머리만 흔듦'을 잡는다.
//   핵심: 타격 순간 체중을 '아래로 눌러 밟는'(dip<0) 그라운딩으로 부양감 제거 + 빠른 타격 아크(hit)로 손맛.
//   3구간: 윈드업(당김) → 빠른 타격 → 복귀. u:0→1. jab=타깃방향 전진(월드, 활은 반동), dip=상하(음수=눌림), pitch=앞숙임.
function strikePose(u, type) {
  const wind = u < 0.2 ? u / 0.2 : 1;                   // 윈드업(활 당김 전용)
  const st = u < 0.2 ? 0 : (u - 0.2) / 0.8;             // 타격 진행
  const hit = Math.sin(Math.min(1, st) * Math.PI);      // 0→1→0 빠른 타격 아크(치고 복귀)
  let jab, dip, pitch;
  if (type === 'bow') {          // 활 — 상체를 확실히 뒤로 젖혀 시위를 당겼다(조준) 놓는다(반동). 활만 크게 당긴다.
    jab = -wind * 0.12 + hit * 0.06; dip = 0; pitch = -wind * 0.22 + hit * 0.10;
  } else if (type === 'magic') { // 마법 — 손/지팡이 앞으로 내지름
    jab = hit * 0.16; dip = -hit * 0.05; pitch = hit * 0.13;
  } else if (type === 'spear') { // 창 — 뒤로 당김 없이 곧장 앞으로 강하게 찌른다(총 반동 느낌 제거)
    jab = hit * 0.30; dip = -hit * 0.05; pitch = hit * 0.07;
  } else {                        // 칼 — 뒤로 안 젖히고 앞·아래로 무게 실어 내려벤다
    jab = hit * 0.14; dip = -hit * 0.12; pitch = hit * 0.26;
  }
  return { jab, dip, pitch, lean: 0, sqY: 1 - hit * 0.07, sqXZ: 1 + hit * 0.045 };
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
      const faceY = cur + diff * Math.min(1, dt * 12); // 이동/공격 방향으로 몸 회전(부드럽게)
      n.modelObj.rotation.y = faceY;
      if (n.mixer) { n.mixer.update(dt); }
      // 스켈레탈 공격 클립이 끝나면 중립 프레임으로 되돌려(고정 방지)
      if (n.isAttacker && n.mixer && n.attacking && n.action) {
        const dur = n._clipDur || (n._clipDur = (n.action.getClip && n.action.getClip() ? n.action.getClip().duration : 0.5));
        if (n.action.time >= dur - 0.02) { n.action.time = 0; n.action.paused = true; n.attacking = false; }
      }
      const mo = n.modelObj, hy = (n.hit ? -0.06 : 0);
      if (n.strikeT > 0) {
        n.strikeT -= dt;
        const ay = n.atkYaw ?? faceY;
        {
          // 전 영웅 통일(2026-07-22 재설계) — 그라운디드 절차 타격. 리깅 영웅도 같은 몸동작을 얹어
          //   '머리만 흔듦'을 없앤다. 단 리깅은 클립이 회전을 보태므로 절차 피치를 축소해 '눕기'를 막는다.
          const s = strikePose(1 - n.strikeT / 0.34, n.atkType);
          // 리깅 근접/마법=클립이 회전을 보태므로 절차 피치 축소(눕기 방지). 활은 클립이 약해 절차가 주도(전량).
          const pMul = !n.isAttacker || n.atkType === 'bow' ? 1 : 0.5;
          mo.position.set(Math.sin(ay) * s.jab, hy + s.dip, Math.cos(ay) * s.jab);
          mo.rotation.x = s.pitch * pMul; mo.rotation.z = 0;
          mo.scale.set(s.sqXZ, s.sqY, s.sqXZ);
        }
      } else if (moving && n.mixer && !n.isAttacker) { // 적 걷기 클립 — 다리는 클립이, 몸통은 정면
        mo.position.set(0, hy, 0); mo.rotation.x = 0; mo.rotation.z = 0; mo.scale.set(1, 1, 1);
      } else if (moving) { // 정적/공격 모델 걷기 — 좌우 무게이동 스웨이 + 앞 기울임(성큼성큼, '콩콩' 폐지)
        const ph = (n.walkPh = (n.walkPh || 0) + dt * 7);
        mo.position.set(0, hy + Math.abs(Math.sin(ph)) * 0.026, 0);
        mo.rotation.x = -0.09; mo.rotation.z = Math.sin(ph) * 0.08;
        mo.scale.set(1, 1, 1);
      } else { // 대기 — 은은한 호흡 + 미세 좌우 무게이동
        mo.position.set(0, hy + Math.sin(clock * 1.5 + n.phase) * 0.016, 0);
        mo.rotation.x = 0; mo.rotation.z = Math.sin(clock * 0.9 + n.phase) * 0.018;
        mo.scale.set(1, 1, 1);
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
  if (n.action && n.isAttacker) { n.action.reset(); n.action.timeScale = 1.7; n.action.paused = false; n.action.play(); n.attacking = true; }
  n.strikeT = 0.34; // 모든 영웅 — 절차적 '윈드업→타격'(무기별 개성, strikePose와 길이 일치)
}

// 공격 순간 그 적(tx,ty%) 쪽으로 잠깐 돌진하는 연출
export function lunge(uid, tx, ty) {
  const n = units.get(uid); if (!n || !n.sized) return;
  const dx = wx(tx) - n.group.position.x, dz = wz(ty) - n.group.position.z;
  const m = Math.hypot(dx, dz) || 1;
  // 2026-07-22: 전진 '찌르기'는 modelObj(홀더)에서 처리 → 그룹 위치는 안 건드림(이동감지 오염·이중전진·미끄러짐 방지).
  n.atkYaw = Math.atan2(dx / m, dz / m); n.faceT = 0.45; // 그 적을 바라보며 공격(찌르기 방향)
}

export function dispose() {
  // 2026-07-22 감사: 재마운트마다 GPU 자원(텍스처·지오·머티리얼·PMREM·WebGL 컨텍스트)이 새던 것 전면 수리.
  fx3d.length = 0;
  for (const k in pool) pool[k].length = 0;
  units.clear(); enemies.clear();
  if (scene) {
    // 씬의 모든 메시 지오메트리·머티리얼·텍스처 해제(프롭·바닥·유닛/적 노드·이펙트 풀 전부)
    scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (!m) continue;
        for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap']) m[k]?.dispose?.();
        m.dispose();
      }
    });
    if (scene.background && scene.background.isTexture) scene.background.dispose();
    if (scene.environment && scene.environment.isTexture) scene.environment.dispose();
  }
  for (const [, e] of texCache) e.tex?.dispose?.(); // 캐시된 컷아웃 텍스처
  texCache.clear();
  for (const [, e] of modelCache) {
    if (e.proto) e.proto.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); }
    });
  }
  modelCache.clear();
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.(); // WebGL 컨텍스트 즉시 해제 → 재마운트 반복 시 "too many contexts" 방지
    if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  renderer = scene = cam = null;
}

export function ready() { return !!renderer; }
