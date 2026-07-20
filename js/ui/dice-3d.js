// 도박 주사위 — 진짜 3D WebGL 육면체(Three.js) + 물리(던지고 통통 튀며 굴러 결과 면에 안착).
import * as THREE from '../vendor/three.module.js';

let renderer, scene, cam, mount;
const dice = [];
let raf = 0, last = 0, rolling = false, phaseT = 0;
const BOUNCE_DUR = 1.35, SETTLE_DUR = 0.45, GRAV = 16, REST = 0.85; // REST=큐브 반높이
let onDone = null;

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function pipTex(v) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#fdf7ec'); grd.addColorStop(1, '#e3d6bd');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#cbb787'; g.lineWidth = 6; g.strokeRect(3, 3, S - 6, S - 6);
  const cell = S / 3, r = S * 0.085;
  for (const idx of PIPS[v]) {
    const cx = (idx % 3 + 0.5) * cell, cy = ((idx / 3) | 0) * cell + cell * 0.5;
    const pg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
    if (v === 1) { pg.addColorStop(0, '#e2604a'); pg.addColorStop(1, '#9c2718'); }
    else { pg.addColorStop(0, '#5a3a1c'); pg.addColorStop(1, '#241202'); }
    g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// BoxGeometry 면 [+X,-X,+Y,-Y,+Z,-Z] → 값(마주보는 합=7): +Z=1,-Z=6,+X=3,-X=4,+Y=5,-Y=2
const FACE_VALUES = [3, 4, 5, 2, 1, 6];
// 결과 값을 윗면(+Y)으로 — 카메라가 위에서 내려다보므로. (+Y면 기본값=5)
const TARGET = { 5: [0, 0, 0], 2: [Math.PI, 0, 0], 1: [-Math.PI / 2, 0, 0], 6: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };

export function init(canvas, w, h) {
  mount = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h, false); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(32, w / h, 0.1, 100); cam.position.set(0, 4.2, 6.4); cam.lookAt(0, 0.4, 0);
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a3a2c, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2.5, 7, 4); key.castShadow = true;
  key.shadow.mapSize.set(512, 512); key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5; scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8c8ff, 0.35); fill.position.set(-3, 3, -2); scene.add(fill);
  // 펠트 테이블(금테)
  const felt = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: 0x2b4c38, roughness: 0.95 }));
  felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.06, 10, 60), new THREE.MeshStandardMaterial({ color: 0xe8c463, emissive: 0x5a4212, roughness: 0.4, metalness: 0.6 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);

  const mats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: pipTex(v), roughness: 0.42, metalness: 0.02 }));
  const geo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
  for (let i = 0; i < 2; i++) {
    const cube = new THREE.Mesh(geo, mats); cube.castShadow = true;
    cube.userData.baseX = i ? 1.5 : -1.5;
    cube.position.set(cube.userData.baseX, REST, 0);
    cube.rotation.set(-0.35, -0.5 + i * 0.3, 0.15);
    scene.add(cube); dice.push(cube);
  }
  last = performance.now();
  loop();
}

export function roll(d1, d2, cb) {
  if (!renderer) return;
  onDone = cb; const vals = [d1, d2];
  dice.forEach((c, i) => {
    const u = c.userData;
    u.py = 3.4 + Math.random() * 0.8;         // 위에서 던짐
    u.vy = 1.2 + Math.random() * 1.6;          // 살짝 위로 튕겨 올림
    u.vx = (i ? 1 : -1) * (0.4 + Math.random() * 0.5); // 바깥으로 흩어짐
    u.vz = (Math.random() * 2 - 1) * 0.5;
    u.rv = new THREE.Vector3((Math.random() * 2 - 1) * 20, (Math.random() * 2 - 1) * 20, (Math.random() * 2 - 1) * 18); // 텀블
    u.targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...TARGET[vals[i]]));
    c.position.set(u.baseX, u.py, 0);
  });
  rolling = true; phaseT = 0;
}
export function lucky(on) { dice.forEach((c) => c.material.forEach((m) => m.emissive.set(on ? 0x7a5a1a : 0x000000))); }

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
        if (u.py <= REST) { // 테이블에 튕김
          u.py = REST;
          if (u.vy < 0) { u.vy = -u.vy * 0.52; u.vx *= 0.55; u.vz *= 0.55; u.rv.multiplyScalar(0.62); }
        }
        c.position.y = u.py;
        c.rotation.x += u.rv.x * dt; c.rotation.y += u.rv.y * dt; c.rotation.z += u.rv.z * dt;
      });
    } else { // 안착: 결과 면을 앞으로 슬러프 + 제자리로
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
  } else {
    dice.forEach((c) => { c.rotation.y += dt * 0.3; }); // 대기 시 천천히 회전
  }
  renderer.render(scene, cam);
}

export function resize(w, h) { if (renderer) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } }
export function dispose() {
  if (raf) cancelAnimationFrame(raf); raf = 0;
  if (renderer) renderer.dispose();
  dice.length = 0; renderer = scene = cam = null; rolling = false; onDone = null;
}
export function ready() { return !!renderer; }
