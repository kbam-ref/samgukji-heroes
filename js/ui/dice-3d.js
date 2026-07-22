// 행운의 주사위 — 진짜 3D WebGL 주사위(모서리 둥근 큐브) + 물리(던지고 통통 튀며 굴러 결과 면에 안착).
// 2026-07-22 수석: ①굴러 멈춘 뒤 결과 면 고정(대기 회전이 결과를 돌려버리던 버그 수리) ②크기 축소 ③모서리 둥글게.
import * as THREE from '../vendor/three.module.js';

let renderer, scene, cam, mount;
const dice = [];
let raf = 0, last = 0, rolling = false, phaseT = 0, idleSpin = true; // idleSpin: 첫 굴림 전에만 천천히 회전
const BOUNCE_DUR = 1.05, SETTLE_DUR = 0.5, GRAV = 12, REST = 0.5; // REST=큐브 반높이(size/2)
let onDone = null, bodyMat = null;
const DIE = 1.0; // 큐브 한 변(축소: 1.3→1.0)

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// 눈(핍) 데칼 — 배경 투명, 점만. 둥근 몸체 면 위에 살짝 띄워 붙인다.
function pipTex(v) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const cell = S / 3, r = S * 0.105;
  for (const idx of PIPS[v]) {
    const cx = (idx % 3 + 0.5) * cell, cy = ((idx / 3) | 0) * cell + cell * 0.5;
    const pg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
    if (v === 1) { pg.addColorStop(0, '#e2604a'); pg.addColorStop(1, '#9c2718'); }   // 1의 눈만 붉게(정통 주사위)
    else { pg.addColorStop(0, '#5a3a1c'); pg.addColorStop(1, '#241202'); }
    g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// 모서리 둥근 큐브 — BoxGeometry 정점을 '둥근 정육면체'로 밀어내 부드러운 모서리. (단일 재질 몸체)
function roundedBoxGeo(size, radius, seg) {
  const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const h = size / 2, ri = h - radius, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const cx = Math.max(-ri, Math.min(ri, x)), cy = Math.max(-ri, Math.min(ri, y)), cz = Math.max(-ri, Math.min(ri, z));
    const dx = x - cx, dy = y - cy, dz = z - cz, len = Math.hypot(dx, dy, dz) || 1;
    p.setXYZ(i, cx + dx / len * radius, cy + dy / len * radius, cz + dz / len * radius);
  }
  g.computeVertexNormals();
  return g;
}

// 결과 값을 윗면(+Y)으로 — 카메라가 위에서 내려다보므로. 각 면의 값 배치와 일치해야 결과가 위로 온다.
//   +X=3, -X=4, +Y=5, -Y=2, +Z=1, -Z=6 (마주보는 합=7)
const TARGET = { 5: [0, 0, 0], 2: [Math.PI, 0, 0], 1: [-Math.PI / 2, 0, 0], 6: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
// 6면 데칼 배치: [값, 위치, 회전(x,y,z)]
const FACES = [
  [1, [0, 0, 1], [0, 0, 0]],
  [6, [0, 0, -1], [0, Math.PI, 0]],
  [3, [1, 0, 0], [0, Math.PI / 2, 0]],
  [4, [-1, 0, 0], [0, -Math.PI / 2, 0]],
  [5, [0, 1, 0], [-Math.PI / 2, 0, 0]],
  [2, [0, -1, 0], [Math.PI / 2, 0, 0]],
];

export function init(canvas, w, h) {
  mount = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h, false); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(32, w / h, 0.1, 100); cam.position.set(0, 3.6, 5.8); cam.lookAt(0, 0.2, 0);
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a3a2c, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2.5, 7, 4); key.castShadow = true;
  key.shadow.mapSize.set(512, 512); key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5; scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8c8ff, 0.35); fill.position.set(-3, 3, -2); scene.add(fill);
  // 펠트 테이블(금테)
  const felt = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ color: 0x2b4c38, roughness: 0.95 }));
  felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.045, 10, 60), new THREE.MeshStandardMaterial({ color: 0xe8c463, emissive: 0x5a4212, roughness: 0.4, metalness: 0.6 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);

  const body = roundedBoxGeo(DIE, DIE * 0.16, 5);
  bodyMat = new THREE.MeshStandardMaterial({ color: 0xf3e9d2, roughness: 0.48, metalness: 0.02 });
  const pipMats = {}; for (let v = 1; v <= 6; v++) pipMats[v] = new THREE.MeshStandardMaterial({ map: pipTex(v), transparent: true, roughness: 0.5, metalness: 0 });
  const pipGeo = new THREE.PlaneGeometry(DIE * 0.66, DIE * 0.66);
  const off = DIE * 0.505;
  for (let i = 0; i < 2; i++) {
    const cube = new THREE.Mesh(body, bodyMat); cube.castShadow = true;
    for (const [v, pos, rot] of FACES) {
      const d = new THREE.Mesh(pipGeo, pipMats[v]);
      d.position.set(pos[0] * off, pos[1] * off, pos[2] * off);
      d.rotation.set(rot[0], rot[1], rot[2]); d.castShadow = false;
      cube.add(d);
    }
    cube.userData.baseX = i ? 0.92 : -0.92;
    cube.position.set(cube.userData.baseX, REST, 0);
    cube.rotation.set(-0.35, -0.5 + i * 0.3, 0.15);
    scene.add(cube); dice.push(cube);
  }
  idleSpin = true;
  last = performance.now();
  loop();
}

export function roll(d1, d2, cb) {
  if (!renderer) return;
  onDone = cb; const vals = [d1, d2];
  idleSpin = false; // 굴리기 시작 — 이후 대기 회전 없음(결과 고정)
  dice.forEach((c, i) => {
    const u = c.userData;
    u.py = 3.2 + Math.random() * 0.7;
    u.vy = 1.2 + Math.random() * 1.6;
    u.vx = (i ? 1 : -1) * (0.35 + Math.random() * 0.45);
    u.vz = (Math.random() * 2 - 1) * 0.45;
    u.rv = new THREE.Vector3((Math.random() * 2 - 1) * 20, (Math.random() * 2 - 1) * 20, (Math.random() * 2 - 1) * 18);
    u.targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...TARGET[vals[i]]));
    u.startQ = null;
    c.position.set(u.baseX, u.py, 0);
  });
  rolling = true; phaseT = 0;
}
export function lucky(on) { if (bodyMat) bodyMat.emissive.set(on ? 0x7a5a1a : 0x000000); }

function loop() {
  raf = requestAnimationFrame(loop);
  const now = performance.now(); const dt = Math.min(0.04, (now - last) / 1000); last = now;
  if (rolling) {
    phaseT += dt;
    if (phaseT < BOUNCE_DUR) { // 물리: 중력 + 바닥 바운스 + 텀블
      dice.forEach((c) => {
        const u = c.userData;
        u.vy -= GRAV * dt; u.py += u.vy * dt;
        c.position.x += u.vx * dt; c.position.z += u.vz * dt;
        if (u.py <= REST) { u.py = REST; if (u.vy < 0) { u.vy = -u.vy * 0.5; u.vx *= 0.55; u.vz *= 0.55; u.rv.multiplyScalar(0.62); } }
        c.position.y = u.py;
        c.rotation.x += u.rv.x * dt; c.rotation.y += u.rv.y * dt; c.rotation.z += u.rv.z * dt;
      });
    } else { // 안착: 결과 면을 위로 슬러프 + 제자리로
      const t = Math.min(1, (phaseT - BOUNCE_DUR) / SETTLE_DUR), e = 1 - Math.pow(1 - t, 3);
      dice.forEach((c) => {
        const u = c.userData;
        if (!u.startQ) u.startQ = c.quaternion.clone();
        c.quaternion.slerpQuaternions(u.startQ, u.targetQ, e);
        c.position.x += (u.baseX - c.position.x) * Math.min(1, dt * 8);
        c.position.z += (0 - c.position.z) * Math.min(1, dt * 8);
        c.position.y = REST;
      });
      if (t >= 1) { rolling = false; dice.forEach((c) => { c.userData.startQ = null; }); if (onDone) { const cb = onDone; onDone = null; cb(); } }
    }
  } else if (idleSpin) {
    dice.forEach((c) => { c.rotation.y += dt * 0.3; }); // 첫 굴림 전 대기 회전만(굴린 뒤엔 결과 면 고정)
  }
  renderer.render(scene, cam);
}

export function resize(w, h) { if (renderer) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } }
export function dispose() {
  if (raf) cancelAnimationFrame(raf); raf = 0;
  // 감사 2026-07-22: 굴릴 때마다(도박) dispose+init 하므로 지오/머티리얼/핍 텍스처를 반드시 해제(누수 방지).
  if (scene) {
    scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) { if (m) { m.map?.dispose?.(); m.dispose(); } }
    });
  }
  if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); }
  dice.length = 0; renderer = scene = cam = bodyMat = null; rolling = false; onDone = null; idleSpin = true;
}
export function ready() { return !!renderer; }
