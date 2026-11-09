// ============================================================
// 天空中的生灵与点缀（程序化建模，非 GLB）
// - 云鳐：成群在岛屿之间滑翔的扁平生物，翼尖缓慢扇动
// - 天灯：黄昏与夜晚从主岛、花海岛与天空之城缓缓升起的暖色灯笼
// ============================================================
import * as THREE from 'three';
import { wc } from '../core/materials.js';
import { mulberry32 } from '../core/noise.js';

// ---------------- 云鳐 ----------------
function rayParts() {
  // 单侧翼：从身体中线向外的扇形（x>0），翼尖后掠
  const pts = [[0, 1.9], [1.4, 1.5], [3.0, 0.7], [4.6, -0.4], [3.6, -0.8], [2.0, -1.0], [0.5, -1.6], [0, -1.7]];
  const pos = [], col = [];
  const cTop = new THREE.Color(0xb9bddc), cTip = new THREE.Color(0xf3e8f0);
  for (let i = 0; i < pts.length - 1; i++) {
    for (const [x, z] of [[0, 0], pts[i], pts[i + 1]]) {
      pos.push(x, Math.abs(x) * 0.06, z);
      const c = cTop.clone().lerp(cTip, Math.min(1, x / 4.6));
      col.push(c.r, c.g, c.b);
    }
  }
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wing.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  wing.computeVertexNormals();
  const body = new THREE.SphereGeometry(1, 12, 8); body.scale(0.75, 0.3, 1.9);
  const tail = new THREE.CylinderGeometry(0.03, 0.09, 4.2, 5); tail.rotateX(Math.PI / 2); tail.translate(0, 0, -3.6);
  return { wing, body, tail };
}

/**
 * @param schools [{ c:[x,y,z], R, n, speed, scale }]
 */
export function cloudRays(scene, anim, schools) {
  const { wing, body, tail } = rayParts();
  const wingMat = wc({ vertexColors: true, side: THREE.DoubleSide, grain: 0.4 });
  const bodyMat = wc({ color: 0xaeb2d4, grain: 0.4 });
  const r = mulberry32(515);
  const all = [];
  schools.forEach((s, si) => {
    const grp = new THREE.Group(); grp.name = 'cloudRays';
    const rays = [];
    for (let i = 0; i < s.n; i++) {
      const ray = new THREE.Group();
      const L = new THREE.Mesh(wing, wingMat), Rw = new THREE.Mesh(wing, wingMat);
      Rw.scale.x = -1;
      ray.add(new THREE.Mesh(body, bodyMat), new THREE.Mesh(tail, bodyMat), L, Rw);
      const off = new THREE.Vector3((r() - 0.5) * 34, (r() - 0.5) * 10, (r() - 0.5) * 34);
      ray.scale.setScalar((s.scale ?? 1.6) * (0.75 + r() * 0.5));
      grp.add(ray);
      rays.push({ ray, L, Rw, off, ph: r() * 6.28 });
    }
    scene.add(grp);
    all.push(grp);
    const dir = si % 2 ? 1 : -1, sp = (s.speed ?? 0.045) * dir;
    anim.push((dt, t) => {
      const a = t * sp + si * 1.7;
      grp.position.set(s.c[0] + Math.cos(a) * s.R, s.c[1] + Math.sin(t * 0.15 + si) * 10, s.c[2] + Math.sin(a) * s.R * 0.8);
      // 沿圆周切向前进
      grp.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * 0.8 * dir);
      for (const q of rays) {
        const f = Math.sin(t * 1.3 + q.ph);
        q.L.rotation.z = f * 0.32; q.Rw.rotation.z = -f * 0.32;
        q.ray.position.set(q.off.x, q.off.y + Math.sin(t * 0.6 + q.ph) * 2.5, q.off.z);
        q.ray.rotation.z = Math.sin(t * 0.4 + q.ph) * 0.12;
        q.ray.rotation.x = -f * 0.05;
      }
    });
  });
  return all;
}

// ---------------- 天灯 ----------------
/**
 * @param sources [{ c:[x,y,z], r, n }]  起飞区域（世界坐标）
 * @param getDn () => DayNight
 */
export function skyLanterns(scene, anim, sources, getDn) {
  const total = sources.reduce((a, s) => a + s.n, 0);
  const geo = new THREE.CylinderGeometry(0.42, 0.3, 0.85, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc77a, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.frustumCulled = false; mesh.name = 'skyLanterns'; mesh.renderOrder = 7;
  scene.add(mesh);
  const r = mulberry32(919);
  const L = [];
  for (const s of sources) for (let i = 0; i < s.n; i++) {
    const it = { s, p: new THREE.Vector3(), v: 1 + r() * 0.9, ph: r() * 6.28, h: 0, life: 160 + r() * 90 };
    const spawn = (q, h0) => { const a = r() * 6.28, d = Math.sqrt(r()) * s.r; q.p.set(s.c[0] + Math.cos(a) * d, s.c[1], s.c[2] + Math.sin(a) * d); q.h = h0; };
    it.spawn = spawn;
    spawn(it, r() * it.life);
    L.push(it);
  }
  const dm = new THREE.Object3D(), col = new THREE.Color();
  mesh.userData.lanterns = L;
  anim.push((dt, t) => {
    const dn = getDn?.();
    const k = dn ? Math.min(1, dn.night * 1.3 + dn.dusk * 0.9) : 0;
    mat.opacity += (k * 0.95 - mat.opacity) * (1 - Math.exp(-dt * 0.8));
    mesh.visible = mat.opacity > 0.02;
    mesh.userData.k = mat.opacity;
    if (!mesh.visible) return;
    for (let i = 0; i < L.length; i++) {
      const q = L[i];
      q.h += q.v * dt;
      if (q.h > q.life) q.spawn(q, 0);
      const sway = Math.sin(t * 0.5 + q.ph) * (2 + q.h * 0.03);
      dm.position.set(q.p.x + sway, q.p.y + q.h, q.p.z + Math.cos(t * 0.4 + q.ph) * (1.5 + q.h * 0.02));
      dm.rotation.set(Math.sin(t + q.ph) * 0.08, q.ph, 0);
      // 起飞时慢慢变大，升到高处后渐渐变小、熄灭
      const sc = Math.min(1, q.h / 4) * (1 - Math.max(0, (q.h - q.life * 0.75) / (q.life * 0.25)) * 0.7);
      dm.scale.setScalar(Math.max(0.001, sc));
      dm.updateMatrix();
      mesh.setMatrixAt(i, dm.matrix);
      const fl = 0.85 + 0.15 * Math.sin(t * 7 + q.ph * 5);
      mesh.setColorAt(i, col.setRGB(1.25 * fl, 0.82 * fl, 0.45 * fl));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return mesh;
}
