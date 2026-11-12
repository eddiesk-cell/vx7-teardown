// The outer shell: one painted mesh made from the reference turnaround (tools/shell: Hunyuan3D shape + paint, local),
// cut here into armor panels. Every triangle goes to the limb segment it sits closest to (distance to the bone, in
// units of that segment's radius), then by angle around the bone and by band along it. Each panel rides its joint
// node, flies off along its own outward direction on EXPLODE, and pulls out on a click like any other part.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import SHELL from './assets/vx7-shell.glb';
import {REST} from './kin.js';

const V3 = THREE.Vector3;
const R = (k) => new V3(...REST[k]);

// segment: node, end points, radius (m), sectors around the bone, bands along it, tags, name
function segments(N) {
  const S = [
    {id: 'head', node: N.head, a: R('neck'), b: new V3(0, 3.62, 0), r: 0.15, sec: 3, band: 1, tags: ['head'], name: 'HELMET'},
    {id: 'torso', node: N.chest, a: new V3(0, 2.6, -0.05), b: new V3(0, 3.16, -0.05), r: 0.3, sec: 6, band: 2, tags: ['torso'], name: 'CHEST ARMOR'},
    {id: 'pelvis', node: N.pelvis, a: new V3(-0.2, 2.34, 0), b: new V3(0.2, 2.34, 0), r: 0.17, sec: 4, band: 1, tags: ['hip'], name: 'PELVIS ARMOR'},
  ];
  for (const s of ['L', 'R']) {
    const arm = ['arm' + s, s === 'R' ? 'blade' : 'shield'];
    S.push(
      {id: 'upper' + s, node: N['sh' + s], a: R('sh' + s).add(new V3(0, 0.08, 0)), b: R('el' + s), r: 0.12, sec: 3, band: 1, tags: [...arm, 'shoulder', 'shoulder' + s], name: s + ' SHOULDER ARMOR'},
      {id: 'fore' + s, node: N['el' + s], a: R('el' + s), b: R('wr' + s), r: 0.11, sec: 3, band: 1, tags: arm, name: s + ' FOREARM ARMOR'},
      {id: 'hand' + s, node: N['wrist' + s], a: R('wr' + s), b: R('hand' + s), r: 0.08, sec: 1, band: 1, tags: arm, name: s === 'L' ? 'L CLAW HAND' : 'R GAUNTLET'},
      {id: 'thigh' + s, node: N['thigh' + s], a: R('hip' + s), b: R('knee' + s), r: 0.14, sec: 4, band: 2, tags: ['leg' + s, 'hip'], name: s + ' THIGH ARMOR'},
      {id: 'shin' + s, node: N['knee' + s], a: R('knee' + s), b: R('hock' + s), r: 0.11, sec: 4, band: 2, tags: ['leg' + s, 'knee'], name: s + ' SHIN ARMOR'},
      {id: 'meta' + s, node: N['hock' + s], a: R('hock' + s), b: R('foot' + s), r: 0.08, sec: 2, band: 1, tags: ['leg' + s, 'foot'], name: s + ' ANKLE ARMOR'},
      {id: 'foot' + s, node: N['foot' + s], a: R('foot' + s), b: R('foot' + s).add(new V3(0, -0.11, 0.3)), r: 0.1, sec: 2, band: 1, tags: ['leg' + s, 'foot'], name: s + ' CLAW FOOT'},
    );
  }
  for (const g of S) {
    g.u = g.b.clone().sub(g.a);
    g.len = g.u.length();
    g.u.divideScalar(g.len);
    // the angle around the bone is measured from the mech's forward direction (or its left, for a bone that runs forward)
    const ref = Math.abs(g.u.z) > 0.8 ? new V3(1, 0, 0) : new V3(0, 0, 1);
    g.f = ref.clone().addScaledVector(g.u, -ref.dot(g.u)).normalize();
    g.l = new V3().crossVectors(g.u, g.f);
  }
  return S;
}
const SECTOR = {1: [''], 2: ['FRONT', 'REAR'], 3: ['FRONT', 'OUTER', 'INNER'], 4: ['FRONT', 'LEFT', 'REAR', 'RIGHT'], 6: ['FRONT', 'FRONT L', 'REAR L', 'REAR', 'REAR R', 'FRONT R']};

// a material per panel (so each can ghost on its own); back faces read as the dark inside of a hollow shell
const panelMat = (map) => {
  const m = new THREE.MeshStandardMaterial({map, roughness: 0.6, metalness: 0.08, envMapIntensity: 0.55, side: THREE.DoubleSide, shadowSide: THREE.BackSide, transparent: true});
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.09, 0.095, 0.105);');
  };
  m.customProgramCacheKey = () => 'vx7-shell';
  return m;
};

export function loadShell(C) {
  const {N, mkPart, pickables} = C;
  const bytes = Uint8Array.from(atob(SHELL), (c) => c.charCodeAt(0));
  return new Promise((ok, fail) => new GLTFLoader().parse(bytes.buffer, '', ok, fail)).then((gltf) => {
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => o.isMesh && !src && (src = o));
    const g = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry;
    const pa = g.attributes.position;
    const ua = g.attributes.uv;
    const map = src.material.map;
    const n = pa.count / 3;
    // world (rest) positions in metres, as floats
    const P = new Float32Array(pa.count * 3);
    const v = new V3();
    for (let i = 0; i < pa.count; i++) v.fromBufferAttribute(pa, i).applyMatrix4(src.matrixWorld).toArray(P, i * 3);
    const S = segments(N);
    const key = new Int32Array(n);
    const c = new V3();
    const w = new V3();
    for (let t = 0; t < n; t++) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(v.fromArray(P, (t * 3 + k) * 3));
      c.multiplyScalar(1 / 3);
      let best = 1e9;
      let bi = 0;
      let bt = 0;
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        const u = Math.min(1, Math.max(0, w.copy(c).sub(s.a).dot(s.u) / s.len));
        const d = w.copy(s.a).addScaledVector(s.u, u * s.len).distanceTo(c) / s.r;
        if (d < best) [best, bi, bt] = [d, i, u];
      }
      const s = S[bi];
      w.copy(c).sub(s.a).addScaledVector(s.u, -bt * s.len);
      const ang = (Math.atan2(w.dot(s.l), w.dot(s.f)) / (2 * Math.PI) + 1 + 0.5 / s.sec) % 1;
      key[t] = bi * 100 + Math.floor(ang * s.sec) * 10 + Math.min(s.band - 1, Math.floor(bt * s.band));
    }
    // one geometry per panel, in its node's rest frame, with smooth normals welded by position across the paint seams
    const groups = new Map();
    for (let t = 0; t < n; t++) (groups.get(key[t]) || groups.set(key[t], []).get(key[t])).push(t);
    const added = [];
    for (const [k, tris] of groups) {
      if (tris.length < 40) continue; // slivers left at a cut
      const s = S[Math.floor(k / 100)];
      const sec = Math.floor((k % 100) / 10);
      const band = k % 10;
      const inv = s.node.matrixWorld.clone().invert();
      const pos = new Float32Array(tris.length * 9);
      const uv = new Float32Array(tris.length * 6);
      const cen = new V3();
      tris.forEach((t, j) => {
        for (let q = 0; q < 3; q++) {
          v.fromArray(P, (t * 3 + q) * 3);
          cen.add(v);
          v.applyMatrix4(inv).toArray(pos, (j * 3 + q) * 3);
          uv[(j * 3 + q) * 2] = ua.getX(t * 3 + q);
          uv[(j * 3 + q) * 2 + 1] = ua.getY(t * 3 + q);
        }
      });
      cen.multiplyScalar(1 / (tris.length * 3));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      weldNormals(geo);
      // outward: from the bone axis through the panel's centre, leaning away from the body's middle
      const along = Math.min(1, Math.max(0, w.copy(cen).sub(s.a).dot(s.u) / s.len));
      const out = cen.clone().sub(s.a.clone().addScaledVector(s.u, along * s.len));
      if (out.lengthSq() < 1e-6) out.copy(s.f);
      out.normalize().add(new V3(cen.x, (cen.y - 2.1) * 0.3, cen.z).normalize().multiplyScalar(0.5)).normalize();
      const q = s.node.getWorldQuaternion(new THREE.Quaternion()).invert();
      const sn = SECTOR[s.sec][sec];
      const id = `shell-${s.id}-${sec}${band}`;
      const p = mkPart(s.node, id, `${s.name}${sn ? ' · ' + sn : ''}${s.band > 1 ? ((band === 1) === s.b.y > s.a.y ? ' UPPER' : ' LOWER') : ''}`, 'armor', {tags: s.tags, out: out.applyQuaternion(q).toArray(), dist: 0.85 + 0.45 * ((k * 7919) % 97) / 97, stage: 1});
      const m = panelMat(map);
      p.mats.push({m, base: 1, e0: 0});
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.part = p;
      p.group.add(mesh);
      pickables.push(mesh);
      added.push(p);
    }
    g.dispose();
    return added;
  });
}

// average the normals of every vertex sharing a position, so the panel shades smooth across the paint atlas seams
function weldNormals(geo) {
  const p = geo.attributes.position.array;
  const nn = geo.attributes.normal.array;
  const acc = new Map();
  const k = (i) => `${Math.round(p[i] * 2000)},${Math.round(p[i + 1] * 2000)},${Math.round(p[i + 2] * 2000)}`;
  for (let i = 0; i < p.length; i += 3) {
    const s = acc.get(k(i)) || acc.set(k(i), [0, 0, 0]).get(k(i));
    s[0] += nn[i];
    s[1] += nn[i + 1];
    s[2] += nn[i + 2];
  }
  for (let i = 0; i < p.length; i += 3) {
    const s = acc.get(k(i));
    const l = Math.hypot(...s) || 1;
    nn[i] = s[0] / l;
    nn[i + 1] = s[1] / l;
    nn[i + 2] = s[2] / l;
  }
}
