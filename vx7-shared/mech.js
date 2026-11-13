// The VX-7 as a scene graph: structural joint nodes (posed from kin.js) and, hanging on them, separable PARTS
// (armor panels, frame, cables, hydraulics, reactor, and the ten planetary drives split into eight sub-parts each).
// Each part has a home, an explode vector and a stage: armor flies first, then drives/frame, then the gears split.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ACT, ARM, D2R, DRIVES, GEAR, LEG, REST, SHOTS, actLen, driveKin, pose} from './kin.js';
import {addInner} from './inner.js';
import {loadShell} from './shell.js';

const V3 = THREE.Vector3;
export const COL = {white: '#ececE8', graphite: '#2a2c30', orange: '#f08a24', steel: '#9aa0a6', copper: '#b87333', chrome: '#d8dce0', ink: '#16181b', dark: '#3a3d42'};
const sm = (x) => (x = Math.min(1, Math.max(0, x))) * x * (3 - 2 * x);
const hash = (s) => (([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) % 997) / 997;

// ---- geometry kit: everything merges into one vertex-coloured mesh per material kind
class Merge {
  constructor() {
    this.g = [];
  }
  add(geo, {p = [0, 0, 0], r = [0, 0, 0], q = null, s = 1, c = COL.graphite} = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const qq = q || new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
    g.applyMatrix4(new THREE.Matrix4().compose(new V3(...p), qq, typeof s === 'number' ? new V3(s, s, s) : new V3(...s)));
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    const col = new THREE.Color(c);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of ['uv', 'uv1']) g.deleteAttribute(k);
    this.g.push(g);
    return this;
  }
  build() {
    return mergeGeometries(this.g);
  }
}
const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r1, r0, h, seg);
const box = (w, h, d, r = 0.008) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const poly = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
const ext = (shape, d, b = 0.012) => {
  const g = new THREE.ExtrudeGeometry(shape, {depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 8});
  g.translate(0, 0, -d / 2);
  return g;
};
const hexPts = (w, h, {c = 0.3, tp = 0.8, bt = 0.8} = {}) => {
  const ch = h * c;
  return [[-(w * bt) / 2, -h / 2], [(w * bt) / 2, -h / 2], [w / 2, -h / 2 + ch], [w / 2, h / 2 - ch], [(w * tp) / 2, h / 2], [-(w * tp) / 2, h / 2], [-w / 2, h / 2 - ch], [-w / 2, -h / 2 + ch]];
};
const scalePts = (pts, k) => pts.map(([x, y]) => [x * k, y * k]);
const between = (a, b) => {
  const d = new V3().subVectors(b, a);
  return {p: a.clone().add(b).multiplyScalar(0.5).toArray(), q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()), len: d.length()};
};
const gearShape = (Z, internal) => {
  const rp = Z / 2;
  const da = (Math.PI * 2) / Z;
  const tip = internal ? rp - 1 : rp + 1;
  const root = internal ? rp + 1.25 : rp - 1.25;
  const pts = [];
  for (let i = 0; i < Z; i++) {
    const c = i * da;
    for (const [f, r] of [[-0.3, root], [-0.13, tip], [0.13, tip], [0.3, root], [0.5, root]]) pts.push([r * Math.cos(c + f * da), r * Math.sin(c + f * da)]);
  }
  return pts;
};
const GEARGEO = {};
const gearGeo = (Z, internal = false, w = 8) => {
  const k = `${Z}${internal}${w}`;
  if (GEARGEO[k]) return GEARGEO[k];
  const pts = gearShape(Z, internal);
  let sh;
  if (internal) {
    sh = new THREE.Shape();
    sh.absarc(0, 0, 42, 0, Math.PI * 2, false);
    sh.holes.push(poly(pts));
  } else sh = poly(pts);
  const g = new THREE.ExtrudeGeometry(sh, {depth: w, bevelEnabled: false, curveSegments: 4});
  g.translate(0, 0, -w / 2);
  return (GEARGEO[k] = g);
};
const annulus = (ro, ri, d) => {
  const s = new THREE.Shape();
  s.absarc(0, 0, ro, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, ri, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, {depth: d, bevelEnabled: false, curveSegments: 20});
  g.translate(0, 0, -d / 2);
  return g;
};
const ring = (n, r, f) => Array.from({length: n}, (_, i) => f((i / n) * Math.PI * 2, i));

const MATS = {
  armor: () => new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.62, metalness: 0.04, envMapIntensity: 0.55}),
  metal: () => new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.48, metalness: 0.7, envMapIntensity: 0.75}),
  glow: (c = COL.orange, i = 0.9) => new THREE.MeshStandardMaterial({color: c, emissive: c, emissiveIntensity: i, roughness: 0.4}),
};

function core() {
  const root = new THREE.Group();
  const parts = [];
  const byId = {};
  const movers = [];
  const pickables = [];
  const drives = {};
  const acts = [];
  const feet = [];
  const node = (parent, x = 0, y = 0, z = 0, cy = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.userData.cy = cy;
    parent.add(g);
    return g;
  };

  // ------------------------------------------------------------ the part registry
  function mkPart(parent, id, name, kind, {tags = [], pos = [0, 0, 0], out = [0, 0, 0], dist = 0.4, stage = 2, scale = 1} = {}) {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    const p = {id, name, kind, tags, group: g, home: new V3(...pos), out: new V3(...out).normalize(), dist, stage, pull: 0, pullT: 0, mats: [], edgeMats: [], a: 1, hover: 0, scale, parent};
    g.userData.part = p;
    parts.push(p);
    byId[id] = p;
    movers.push(p);
    return p;
  }
  const useMat = (p, kind, ...args) => {
    const m = MATS[kind](...args);
    m.transparent = true; // always blended at alpha 1: toggling it would recompile the shader
    p.mats.push({m, base: m.opacity, e0: m.emissive ? m.emissiveIntensity : 0});
    return m;
  };
  const addMesh = (p, geo, kind, {edges = null, shadow = true, ...a} = {}) => {
    const mesh = new THREE.Mesh(geo, useMat(p, kind, ...(a.args || [])));
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.userData.part = p;
    p.group.add(mesh);
    pickables.push(mesh);
    if (edges) {
      const lm = new THREE.LineBasicMaterial({color: COL.ink, transparent: true, opacity: 0.55});
      p.edgeMats.push(lm);
      p.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(edges, 35), lm));
    }
    return mesh;
  };
  const solid = (p, m, kind = 'metal', o) => addMesh(p, m.build(), kind, o);

  // ------------------------------------------------------------ armor: bevelled shell, panel line, trim, bolts
  function armor(parent, id, name, shapePts, d, place, o = {}) {
    const {tags = [], trim = null, col = COL.white, bolts = true, dist, out, cy = parent.userData.cy ?? place.p[1], line = true} = o;
    const [rx, ry, rz] = (place.r || [0, 0, 0]).slice(0, 3).map((a) => a * D2R);
    const order = (place.r && place.r[3]) || 'XYZ';
    const n = new V3(0, 0, 1).applyEuler(new THREE.Euler(rx, ry, rz, order));
    const rad = new V3(place.p[0], (place.p[1] - cy) * 0.3, place.p[2]);
    const ov = out ? new V3(...out).normalize() : rad.lengthSq() > 0.004 ? rad.normalize().multiplyScalar(0.7).add(n.clone().multiplyScalar(0.6)).normalize() : n;
    const p = mkPart(parent, id, name, 'armor', {tags, pos: place.p, out: ov.toArray(), dist: dist ?? 0.55 + 0.4 * hash(id), stage: 1});
    p.group.rotation.set(rx, ry, rz, order);
    const shell = ext(poly(shapePts), d);
    const front = d / 2 + 0.012;
    const m = new Merge().add(shell, {c: col});
    const xs = shapePts.map((q) => q[0]);
    const ys = shapePts.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cyy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const about = (k) => shapePts.map(([x, y]) => [cx + (x - cx) * k, cyy + (y - cyy) * k]);
    if (line) {
      const s = poly(about(0.8));
      s.holes.push(new THREE.Path(about(0.76).reverse().map(([x, y]) => new THREE.Vector2(x, y))));
      m.add(new THREE.ExtrudeGeometry(s, {depth: 0.003, bevelEnabled: false}), {p: [0, 0, front], c: COL.ink});
    }
    if (trim === 'stripe') m.add(box(w * 0.09, h * 0.58, 0.005, 0.002), {p: [cx + w * 0.2, cyy, front + 0.002], c: COL.orange});
    if (trim === 'edge') m.add(box(w * 0.5, 0.022, 0.005, 0.002), {p: [cx, cyy - h * 0.36, front + 0.002], c: COL.orange});
    if (trim === 'block') m.add(box(w * 0.22, h * 0.16, 0.005, 0.002), {p: [cx - w * 0.18, cyy + h * 0.25, front + 0.002], c: COL.orange});
    if (bolts) {
      const cen = [cx, cyy];
      for (let i = 0; i < shapePts.length; i += shapePts.length > 5 ? 2 : 1) {
        const [x, y] = shapePts[i];
        m.add(cyl(0.011, 0.011, 0.008, 8), {p: [cen[0] + (x - cen[0]) * 0.84, cen[1] + (y - cen[1]) * 0.84, front + 0.003], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      }
    }
    addMesh(p, m.build(), 'armor', {edges: shell});
    return p;
  }
  const hexA = (parent, id, name, w, h, d, p, r, o = {}, shape = {}) => armor(parent, id, name, hexPts(w, h, shape), d, {p, r}, o);

  // ------------------------------------------------------------ frame parts
  const bone = (parent, id, name, a, b, r0, r1, tags, o = {}) => {
    const A = new V3(...a);
    const B = new V3(...b);
    const s = between(A, B);
    const p = mkPart(parent, id, name, 'frame', {tags, out: o.out || [0, 0, 0], dist: o.dist ?? 0.35, stage: 2});
    const m = new Merge().add(cyl(r0, r1, s.len, 8), {p: s.p, q: s.q, c: COL.graphite});
    for (const t of [0.1, 0.5, 0.9]) {
      const c = A.clone().lerp(B, t);
      m.add(cyl(r0 * 1.35, r0 * 1.35, 0.018, 10), {p: c.toArray(), q: s.q, c: COL.steel});
    }
    if (o.rib) for (const t of [0.3, 0.7]) m.add(box(r0 * 2.6, 0.02, r0 * 2.6, 0.004), {p: A.clone().lerp(B, t).toArray(), q: s.q, c: COL.dark});
    solid(p, m, 'metal', {edges: null});
    return p;
  };
  // a bundle of 3-5 strands with clips
  const cable = (parent, id, name, pts, tags, {n = 4, r = 0.011, out = [0, 0, 0], dist = 0.4} = {}) => {
    const P = pts.map((q) => new V3(...q));
    const p = mkPart(parent, id, name, 'frame', {tags, out, dist, stage: 2});
    const dir = P[P.length - 1].clone().sub(P[0]).normalize();
    const u = new V3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0)).normalize();
    const v = new V3().crossVectors(dir, u);
    const m = new Merge();
    const mid = new THREE.CatmullRomCurve3(P);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const off = u.clone().multiplyScalar(Math.cos(a) * r * 1.25).add(v.clone().multiplyScalar(Math.sin(a) * r * 1.25));
      const c = new THREE.CatmullRomCurve3(P.map((q) => q.clone().add(off)));
      m.add(new THREE.TubeGeometry(c, 22, r, 6), {c: i % 2 ? COL.orange : COL.graphite});
    }
    for (const t of [0.2, 0.55, 0.85]) {
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), mid.getTangentAt(t));
      m.add(new THREE.TorusGeometry(r * 2.6, r * 0.7, 6, 12), {p: mid.getPointAt(t).toArray(), q, c: COL.chrome});
    }
    solid(p, m);
    return p;
  };
  // stacked rings: a segmented spine/neck
  const segs = (parent, id, name, base, n, step, r, tags) => {
    for (let i = 0; i < n; i++) {
      const p = mkPart(parent, `${id}-${i + 1}`, `${name} ${i + 1}`, 'frame', {tags, pos: [base[0], base[1] + i * step, base[2]], out: [(i % 2 ? 1 : -1) * 0.6, 0.5, 0.35], dist: 0.35 + 0.05 * i, stage: 2});
      const m = new Merge().add(cyl(r, r, step * 0.62, 14), {c: COL.graphite}).add(new THREE.TorusGeometry(r, step * 0.17, 6, 16), {p: [0, step * 0.28, 0], r: [Math.PI / 2, 0, 0], c: COL.steel});
      m.add(new THREE.TorusGeometry(r, step * 0.17, 6, 16), {p: [0, -step * 0.28, 0], r: [Math.PI / 2, 0, 0], c: COL.steel});
      for (const a of ring(6, 0, (t) => t)) m.add(cyl(0.008, 0.008, 0.012, 6), {p: [Math.cos(a) * r * 1.02, step * 0.28, Math.sin(a) * r * 1.02], r: [0, 0, Math.PI / 2], c: COL.chrome});
      m.add(box(r * 0.5, step * 0.8, 0.012, 0.003), {p: [0, 0, r * 1.02], c: COL.orange});
      solid(p, m);
    }
  };

  // ------------------------------------------------------------ the joint nodes
  // every node sits on its measured joint (kin.js REST); limb nodes turn so their local -Y runs down the limb to the
  // next joint, which is what the bones, drives and actuators are built along. q0 is that rest turn; poses are deltas.
  const N = {};
  const W = (k) => new V3(...REST[k]);
  const DOWN = new V3(0, -1, 0);
  const at = (parent, k, aim) => {
    const g = node(parent);
    parent.updateMatrixWorld(true);
    const wq = aim ? new THREE.Quaternion().setFromUnitVectors(DOWN, W(aim).sub(W(k)).normalize()) : new THREE.Quaternion();
    g.position.copy(parent.worldToLocal(W(k)));
    g.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    g.userData.q0 = g.quaternion.clone();
    g.updateMatrixWorld(true);
    return g;
  };
  N.pelvis = at(root, 'pelvis');
  N.waist = at(N.pelvis, 'waist');
  N.chest = N.waist;
  N.neck = at(N.chest, 'neck');
  N.head = N.neck;
  for (const s of ['L', 'R']) {
    N['hipAbd' + s] = at(N.pelvis, 'hip' + s);
    N['hip' + s] = N['thigh' + s] = at(N['hipAbd' + s], 'hip' + s, 'knee' + s);
    N['knee' + s] = at(N['thigh' + s], 'knee' + s, 'hock' + s);
    N['hock' + s] = at(N['knee' + s], 'hock' + s, 'foot' + s);
    N['foot' + s] = at(N['hock' + s], 'foot' + s);
    N['shAbd' + s] = at(N.chest, 'sh' + s);
    N['sh' + s] = at(N['shAbd' + s], 'sh' + s, 'el' + s);
    N['el' + s] = at(N['sh' + s], 'el' + s, 'wr' + s);
    N['wrist' + s] = at(N['el' + s], 'wr' + s, 'hand' + s);
    for (const k of ['thigh', 'knee', 'hock', 'sh', 'el']) N[k + s].userData.cy = -0.38;
  }
  // the shield hangs off the left shoulder on a boom, outboard of the arm
  N.shield = node(N.chest, 0.86, 2.62 - REST.waist[1], -0.14);
  N.shield.userData.q0 = new THREE.Quaternion();
  Object.assign(N.shield.userData, {cy: 0.35});
  const SX = {L: 1, R: -1};

  // ------------------------------------------------------------ planetary drives
  const u0 = GEAR.mod;
  function buildDrive(def, parent, pos, outward, jointSign, tags, scale) {
    const s = def.s;
    const mod = mkPart(parent, 'drive-' + def.id, def.name + ' DRIVE', 'drive', {tags, pos, out: [outward, 0, 0], dist: 0.42 + 0.3 * s, stage: 2});
    mod.group.quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(outward, 0, 0));
    const sc = new THREE.Group();
    sc.scale.setScalar(u0 * s);
    mod.group.add(sc);
    const dk = jointSign * outward;
    const D = {def, dk, sc, spin: {}};
    drives[def.id] = D;
    const sub = (id, name, home, ez, fn) => {
      const p = mkPart(sc, `drive-${def.id}-${id}`, `${def.name} ${name}`, 'drive', {tags, pos: [0, 0, home], out: [0, 0, Math.sign(ez - home) || 1], dist: Math.abs(ez - home), stage: 3});
      p.module = mod;
      p.sub = true;
      mod.group.userData.part = mod;
      fn(p);
      return p;
    };
    // a part that rides another part (a ball on its cage, a coil on its stator) and flies straight out of it
    const bit = (parent, id, name, pos, ang, dist, fn) => {
      const p = mkPart(parent, `drive-${def.id}-${id}`, `${def.name} ${name}`, 'drive', {tags, pos, out: [Math.cos(ang), Math.sin(ang), 0], dist, stage: 3});
      p.group.rotation.z = ang;
      p.module = mod;
      p.sub = p.bit = true;
      fn(p);
      return p;
    };
    const gearsOf = (st, label, home, ez, sunEz) => {
      // one stage: carrier spider with pins (turns at the carrier speed and carries the planets), sun, three planets,
      // phased to mesh exactly (sun tooth at 0 deg, planet gap at its pin)
      const car = sub('carrier' + st[1], `${label} CARRIER`, home, ez, (p) => {
        p.carG = new THREE.Group();
        p.group.add(p.carG);
        const mc = new Merge().add(cyl(8, 8, 1.6, 16), {p: [0, 0, -5.3], r: [Math.PI / 2, 0, 0], c: COL.dark});
        for (let k = 0; k < 3; k++) {
          const a = (k * 2 * Math.PI) / 3;
          mc.add(box(GEAR.pinR - 4, 3, 1.6, 0.4), {p: [Math.cos(a) * (GEAR.pinR / 2 + 2), Math.sin(a) * (GEAR.pinR / 2 + 2), -5.3], r: [0, 0, a], c: COL.dark});
          mc.add(cyl(2, 2, 14, 10), {p: [Math.cos(a) * GEAR.pinR, Math.sin(a) * GEAR.pinR, 0], r: [Math.PI / 2, 0, 0], c: COL.chrome});
        }
        addMesh({mats: p.mats, group: p.carG}, mc.build(), 'metal').userData.part = p;
      });
      const sun = sub('sun' + st[1], `${label} SUN ${GEAR.Zs}T`, home, sunEz, (p) => {
        const ms = new Merge().add(gearGeo(GEAR.Zs, false, 8), {c: COL.steel}).add(cyl(3, 3, 16, 12), {r: [Math.PI / 2, 0, 0], c: COL.chrome});
        ms.add(annulus(6, 3.4, 1.2), {p: [0, 0, 4.4], c: COL.dark});
        addMesh(p, ms.build(), 'metal');
      });
      const planets = [0, 1, 2].map((k) => {
        const a = (k * 2 * Math.PI) / 3;
        const pp = bit(car.carG, `planet${st[1]}-${k + 1}`, `${label} PLANET ${k + 1}`, [Math.cos(a) * GEAR.pinR, Math.sin(a) * GEAR.pinR, 0], a, 34, (q) => {
          const mp = new Merge().add(gearGeo(GEAR.Zp, false, 8), {c: k === 0 ? COL.orange : COL.steel}).add(annulus(4, 2.2, 8.4), {c: COL.dark});
          addMesh(q, mp.build(), 'metal');
        });
        pp.group.rotation.z = 0;
        return {pg: pp.group, a: (a * 180) / Math.PI};
      });
      D.spin[st] = {sunG: sun.group, carG: car.carG, planets};
    };
    const ringOf = (g) => {
      const m = new Merge().add(gearGeo(GEAR.Zr, true, 8), {c: COL.steel}).add(annulus(47, 41.5, 3), {p: [0, 0, -2.5], c: COL.graphite});
      for (const a of ring(12, 0, (t) => t)) m.add(cyl(1.3, 1.3, 1.2, 8), {p: [Math.cos(a) * 44.3, Math.sin(a) * 44.3, -4.4], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      m.add(box(10, 3, 4, 0.5), {p: [0, 47, 0], c: COL.orange});
      addMesh(g, m.build(), 'metal');
    };
    // 1 bearing: outer race fixed, inner race and the cage with balls turn at the output angle; bolt circles on the face plate
    sub('bearing', 'BEARING OUTER RACE', -11, -112, (p) => {
      const outer = new Merge().add(annulus(47, 38.5, 8), {c: COL.steel}).add(annulus(47, 44, 2), {p: [0, 0, -4], c: COL.graphite});
      for (const a of ring(12, 0, (t) => t)) outer.add(cyl(1.4, 1.4, 1.2, 8), {p: [Math.cos(a) * 45.5, Math.sin(a) * 45.5, -5.2], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      outer.add(box(9, 3, 3, 0.5), {p: [0, 47, 0], c: COL.orange});
      addMesh(p, outer.build(), 'metal');
    });
    const inner = sub('bearingIn', 'BEARING INNER RACE', -11, -168, (p) => {
      p.spinG = new THREE.Group();
      p.group.add(p.spinG);
      const mi = new Merge().add(annulus(36.5, 27, 8), {c: COL.chrome}).add(annulus(38, 33, 1.6), {p: [0, 0, 4.4], c: COL.graphite});
      for (const a of ring(8, 0, (t) => t)) mi.add(cyl(1.5, 1.5, 1.2, 8), {p: [Math.cos(a) * 31, Math.sin(a) * 31, 5.4], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      addMesh({mats: p.mats, group: p.spinG}, mi.build(), 'metal').userData.part = p;
    });
    const cage = sub('cage', 'BEARING CAGE', -11, -140, (p) => {
      p.spinG = new THREE.Group();
      p.group.add(p.spinG);
      addMesh({mats: p.mats, group: p.spinG}, new Merge().add(annulus(39.5, 36, 1.5), {c: COL.copper}).build(), 'metal').userData.part = p;
    });
    ring(24, 0, (t) => t).forEach((a, k) => bit(cage.spinG, `ball-${k + 1}`, `BEARING BALL ${k + 1}`, [Math.cos(a) * 37.7, Math.sin(a) * 37.7, 0], a, 16, (q) => solid(q, new Merge().add(new THREE.SphereGeometry(2.1, 8, 6), {c: COL.chrome}))));
    D.spin.bearing = {inner: inner.spinG, cage: cage.spinG};
    // 2-5 the two planetary stages: ring (housing) separates from its gears
    sub('ring2', 'STAGE 2 RING 72T', 0, -56, (p) => ringOf(p));
    gearsOf('s2', 'STAGE 2', 0, 0, -28);
    gearsOf('s1', 'STAGE 1', 12, 56, 84);
    sub('ring1', 'STAGE 1 RING 72T', 12, 112, (p) => ringOf(p));
    // 6 stator with 24 copper coils, 7 rotor with 20 magnets and an encoder disc, 8 shaft collar and circlips
    // 6 stator: housing and 24 copper coils, 7 rotor: 20 magnets round a hub with the encoder disc, 8 collar and circlips
    const stator = sub('stator', 'MOTOR STATOR', 26, 168, (p) => {
      const m = new Merge().add(annulus(43, 31, 12), {c: COL.graphite});
      for (const a of ring(24, 0, (t) => t)) m.add(box(2, 3, 12.4, 0.3), {p: [Math.cos(a) * 43, Math.sin(a) * 43, 0], r: [0, 0, a], c: COL.dark});
      for (const a of ring(8, 0, (t) => t)) m.add(cyl(1.4, 1.4, 1.2, 8), {p: [Math.cos(a) * 37, Math.sin(a) * 37, 6.5], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      addMesh(p, m.build(), 'metal');
    });
    ring(24, 0, (t) => t).forEach((a, k) => bit(stator.group, `coil-${k + 1}`, `STATOR COIL ${k + 1}`, [Math.cos(a) * 28.5, Math.sin(a) * 28.5, 0], a, 30, (q) => solid(q, new Merge().add(box(5, 4, 11, 0.8), {c: COL.copper}))));
    const rotor = sub('rotor', 'MOTOR ROTOR + ENCODER', 26, 224, (p) => {
      p.spinG = new THREE.Group();
      p.group.add(p.spinG);
      const m = new Merge().add(annulus(24, 12, 10), {c: COL.dark}).add(cyl(3, 3, 34, 12), {r: [Math.PI / 2, 0, 0], c: COL.chrome});
      // encoder disc: slits and one orange index mark
      m.add(annulus(20, 5, 1), {p: [0, 0, 8.5], c: COL.chrome});
      for (const a of ring(36, 0, (t) => t)) m.add(box(1, 5, 1.3, 0.1), {p: [Math.cos(a) * 16, Math.sin(a) * 16, 8.5], r: [0, 0, a - Math.PI / 2], c: COL.ink});
      m.add(box(2.4, 7, 1.5, 0.2), {p: [0, 17, 8.8], c: COL.orange});
      addMesh({mats: p.mats, group: p.spinG}, m.build(), 'metal').userData.part = p;
    });
    // magnets alternate north and south (steel and ink faces)
    ring(20, 0, (t) => t).forEach((a, k) => bit(rotor.spinG, `magnet-${k + 1}`, `ROTOR MAGNET ${k + 1}`, [Math.cos(a) * 24.5, Math.sin(a) * 24.5, 0], a, 24, (q) => solid(q, new Merge().add(box(4.2, 2.6, 9, 0.4), {c: k % 2 ? COL.ink : COL.steel}))));
    D.spin.rotor = rotor.spinG;
    sub('collar', 'SHAFT COLLAR + CIRCLIPS', 26, 280, (p) => {
      const cg = new THREE.Group();
      p.group.add(cg);
      const m = new Merge().add(cyl(7, 7, 6, 14), {p: [0, 0, 17], r: [Math.PI / 2, 0, 0], c: COL.steel}).add(annulus(8.5, 3.2, 0.8), {p: [0, 0, 13.2], c: COL.chrome}).add(annulus(8.5, 3.2, 0.8), {p: [0, 0, 20.8], c: COL.chrome});
      for (const a of [0.4, 2.5, 4.6]) m.add(cyl(1, 1, 3, 6), {p: [Math.cos(a) * 8, Math.sin(a) * 8, 17], r: [0, Math.PI / 2, 0], q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3(Math.cos(a), Math.sin(a), 0)), c: COL.ink});
      m.add(cyl(4.6, 4.6, 8, 10), {p: [0, 0, 22.5], r: [Math.PI / 2, 0, 0], c: COL.orange});
      addMesh({mats: p.mats, group: cg}, m.build(), 'metal').userData.part = p;
      D.spin.collar = cg;
    });
    return D;
  }
  const setPlanet = (S, st, kin, dk) => {
    const k = st === 's2' ? kin.sun2 : kin.sun1;
    S.sunG.rotation.z = k * dk * D2R;
    S.carG.rotation.z = (st === 's2' ? kin.carrier2 : kin.carrier1) * dk * D2R;
    for (const pl of S.planets) pl.pg.rotation.z = (pl.a + 6 + (st === 's2' ? kin.planet2 : kin.planet1) * dk) * D2R;
  };
  const spinDrives = (P) => {
    for (const id in drives) {
      const D = drives[id];
      const k = driveKin(P[id]);
      setPlanet(D.spin.s2, 's2', k, D.dk);
      setPlanet(D.spin.s1, 's1', k, D.dk);
      D.spin.bearing.inner.rotation.z = k.carrier2 * D.dk * D2R;
      D.spin.bearing.cage.rotation.z = k.carrier2 * 0.5 * D.dk * D2R;
      D.spin.rotor.rotation.z = D.spin.collar.rotation.z = k.sun1 * D.dk * D2R;
    }
  };
  const DRV = Object.fromEntries(DRIVES.map((d) => [d.id, d]));
  // joint sign: how the joint angle turns the node about +x (+1 up-pointing joints and the knee, -1 hanging limbs)
  const P0 = (n) => n.position.toArray();
  buildDrive(DRV.neck, N.chest, P0(N.neck), 1, 1, ['head', 'neck'], 1);
  buildDrive(DRV.waist, N.pelvis, P0(N.waist), -1, 1, ['waist', 'spine'], 1);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    buildDrive(DRV['sh' + s], N.chest, P0(N['shAbd' + s]), sx, -1, ['shoulder', 'shoulder' + s, s === 'R' ? 'blade' : 'shield'], 1);
    buildDrive(DRV['el' + s], N['sh' + s], P0(N['el' + s]), sx, -1, ['arm' + s, s === 'R' ? 'blade' : 'shield'], 1);
    buildDrive(DRV['hip' + s], N['hipAbd' + s], [0, 0, 0], sx, -1, ['hip', 'leg' + s], 1);
    buildDrive(DRV['knee' + s], N['thigh' + s], P0(N['knee' + s]), sx, 1, ['knee', 'leg' + s], 1);
  }
  const _ = {ARM, LEG, ACT, actLen};
  void _;
  return {COL, root, parts, byId, movers, pickables, drives, acts, feet, N, SX, spinDrives, mkPart, addMesh, solid, Merge, armor, hexA, bone, cable, segs, node, box, cyl, poly, ext, hexPts, annulus, ring, between, MATS, useMat, hash, sm, pose};
}

// ------------------------------------------------------------ the finished mech
export function buildMech() {
  const C = core();
  addInner(C);
  const {root, parts, byId, movers, N, acts, feet, drives, pickables, SX} = C;
  const Y = new V3(0, 1, 0);
  const X = new V3(1, 0, 0);
  const Z = new V3(0, 0, 1);
  const tmpA = new V3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  N.shield.userData.z0 = N.shield.position.z;
  // what touches the floor: the claw markers, then (once the shell is in) extreme points of every armor panel and the
  // shield, held in their joint node's frame so an exploded panel never lifts the body
  const hull = feet.map((m) => ({node: m.parent, v: m.position.clone()}));
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], ...[-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c])))].map((d) => new V3(...d).normalize());
  const buildHull = () => {
    // extreme points per joint node over all its armor (not per plate: the floor test runs several times a frame)
    const M = new THREE.Matrix4();
    const best = new Map();
    const v = new V3();
    for (const p of parts) {
      if (p.kind !== 'armor' || p.id === 'blade') continue;
      M.compose(p.home, p.group.quaternion, p.group.scale);
      const b = best.get(p.parent) || best.set(p.parent, DIRS.map(() => ({k: -1e9, v: new V3()}))).get(p.parent);
      for (const o of p.group.children) {
        if (!o.isMesh) continue;
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(o.matrix).applyMatrix4(M);
          DIRS.forEach((d, j) => {
            const k = v.dot(d);
            if (k > b[j].k) b[j].k = k, b[j].v.copy(v);
          });
        }
      }
    }
    for (const [node, b] of best) for (const e of b) hull.push({node, v: e.v.clone()});
    flyCache.clear();
  };
  const ready = loadShell(C).then((added) => {
    buildHull();
    return added;
  });
  const lowest = () => {
    let low = 1e9;
    for (const h of hull) low = Math.min(low, tmpA.copy(h.v).applyMatrix4(h.node.matrixWorld).y);
    return low;
  };
  const turn = (n, ax, deg) => n.quaternion.copy(n.userData.q0 || qb.identity()).multiply(qa.setFromAxisAngle(ax, deg * D2R));
  // pose every joint, stand the pelvis at rest height and return how high the pelvis must sit for the lowest point to touch
  const joints = (P) => {
    turn(N.pelvis, X, P.lean + P.pitch);
    N.waist.quaternion.copy(N.waist.userData.q0).multiply(qa.setFromAxisAngle(Y, P.twist * D2R)).multiply(qb.setFromAxisAngle(X, P.waist * D2R));
    turn(N.neck, X, P.neck);
    turn(N.shield, Y, 40 + P.shield);
    N.shield.position.z = N.shield.userData.z0 + P.shieldZ;
    N.pelvis.position.set(REST.pelvis[0], REST.pelvis[1], REST.pelvis[2] + P.dz);
    const body = new THREE.Quaternion().setFromAxisAngle(X, P.pitch * D2R);
    for (const s of ['L', 'R']) {
      turn(N['hipAbd' + s], Z, SX[s] * P['ha' + s]);
      turn(N['shAbd' + s], Z, SX[s] * P['ab' + s]);
      turn(N['hip' + s], X, -P['hip' + s]);
      turn(N['knee' + s], X, P['knee' + s]);
      turn(N['hock' + s], X, -P['hock' + s]);
      turn(N['sh' + s], X, -P['sh' + s]);
      turn(N['el' + s], X, -P['el' + s]);
      // the foot keeps its rest attitude to the ground (turning with the body only in a roll)
      N['hock' + s].updateWorldMatrix(true, false);
      N['foot' + s].quaternion.copy(N['hock' + s].getWorldQuaternion(qa).invert()).multiply(body);
    }
    byId.blade?.group.scale.set(1, Math.max(0.001, P.blade), 1);
    root.updateMatrixWorld(true);
    return REST.pelvis[1] - lowest();
  };
  // the pelvis height at take-off and touch-down of a flight, so the body flies a clean arc between them
  const flyCache = new Map();
  const groundAt = (seq, t) => {
    const k = seq + t;
    if (!flyCache.has(k)) flyCache.set(k, joints(pose(seq, t)));
    return flyCache.get(k);
  };
  // ---- what the moves fire: laser bolts and the muzzle flash, the spark of a blow on the shield, the blade's trail
  const glowMat = (c, i) => new THREE.MeshBasicMaterial({color: new THREE.Color(c).multiplyScalar(i), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false});
  const fxg = new THREE.Group(); // kept out of the AO pass (stage.js), so a glow never casts occlusion
  root.add(fxg);
  const bolts = SHOTS.map(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.3, 4, 10), glowMat('#ff6a14', 1.8)), new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 1.3, 4, 8), glowMat('#fff0c8', 3)));
    fxg.add(g);
    return g;
  });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glowMat('#ffab4a', 2.5));
  const spark = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glowMat('#ffc066', 2.6));
  const sparkRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), glowMat('#ff8a2a', 2));
  const TRAIL = 9;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 6), 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 6), 3));
  trailGeo.setIndex(Array.from({length: TRAIL - 1}, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
  const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false}));
  trail.frustumCulled = false;
  fxg.add(flash, spark, sparkRing, trail);
  for (const o of [flash, spark, sparkRing, ...bolts]) o.renderOrder = 2;
  const hist = [];
  const fv = new V3();
  const fd = new V3();
  const ORANGE = new THREE.Color('#ff8a2a');
  const fx = (P) => {
    // bolts fly along the upper arm's aim (the forearm kicks with recoil) at 36 m/s for 0.45 s; the flash is the newest shot
    C.muzzle.getWorldPosition(fv);
    fd.set(0, -1, 0).applyQuaternion(N.shL.getWorldQuaternion(qa));
    const shots = P.shots || [];
    bolts.forEach((b, i) => {
      const a = shots[i] ?? -1;
      b.visible = a >= 0 && a < 0.45;
      if (b.visible) b.position.copy(fv).addScaledVector(fd, 0.75 + 36 * a), b.quaternion.setFromUnitVectors(Y, fd);
    });
    const age = Math.min(9, ...shots.filter((a) => a >= 0));
    const f = Math.exp(-age / 0.045);
    flash.visible = f > 0.03;
    flash.position.copy(fv);
    flash.scale.setScalar(0.05 + 0.16 * f);
    // a blow on the shield: a hot core and a ring running out across its face
    const sp = P.spark || 0;
    spark.visible = sparkRing.visible = sp > 0.03;
    if (spark.visible) {
      N.shield.getWorldPosition(fv);
      fd.set(0, 0, 1).applyQuaternion(N.shield.getWorldQuaternion(qa));
      spark.position.copy(fv).addScaledVector(fd, 0.12);
      spark.scale.setScalar(0.32 * sp);
      sparkRing.position.copy(spark.position);
      sparkRing.quaternion.setFromUnitVectors(Z, fd);
      sparkRing.scale.setScalar(0.15 + 0.85 * (1 - sp));
      sparkRing.material.opacity = sp;
    }
    // the blade's trail: its edge over the last frames, bright only while it moves fast
    const bl = byId.blade;
    if (!bl) return;
    bl.group.updateWorldMatrix(true, false);
    hist.unshift([new V3(0, 0.3, 0).applyMatrix4(bl.group.matrixWorld), new V3(0, 1.45, 0).applyMatrix4(bl.group.matrixWorld)]);
    if (hist.length > TRAIL) hist.length = TRAIL;
    let len = 0;
    for (let i = 1; i < hist.length; i++) len += hist[i][1].distanceTo(hist[i - 1][1]);
    const gain = P.blade > 0.5 ? (P.trail || 0) * Math.min(1, Math.max(0, (len - 0.5) / 1.5)) : 0;
    trail.visible = gain > 0;
    const pos = trailGeo.attributes.position.array;
    const col = trailGeo.attributes.color.array;
    for (let i = 0; i < TRAIL; i++) {
      const h = hist[Math.min(i, hist.length - 1)];
      h[0].toArray(pos, i * 6);
      h[1].toArray(pos, i * 6 + 3);
      const k = gain * (1 - i / TRAIL) ** 2.5 * 1.4;
      for (const o of [0, 3]) ORANGE.toArray(col, i * 6 + o), (col[i * 6 + o] *= k), (col[i * 6 + o + 1] *= k), (col[i * 6 + o + 2] *= k);
    }
    trailGeo.attributes.position.needsUpdate = trailGeo.attributes.color.needsUpdate = true;
  };
  const resetFx = () => (hist.length = 0);
  // mix: {P, u} blends from a frozen pose (the moment a sequence was switched) into this one
  const setPose = (seq, tau, mix) => {
    const P = pose(seq, tau);
    if (mix && mix.u < 1) {
      const u = sm(mix.u);
      for (const k in P) if (typeof P[k] === 'number' && k !== 'travel' && k in mix.P) P[k] = mix.P[k] + (P[k] - mix.P[k]) * u;
      delete P.fly;
    }
    let y;
    if (P.fly) {
      const [a, b, u] = P.fly;
      const ya = groundAt(seq, a);
      const yb = groundAt(seq, b);
      joints(P);
      y = ya + (yb - ya) * u + P.air;
    } else y = joints(P) + P.air;
    N.pelvis.position.y = y;
    root.updateMatrixWorld(true);
    // hydraulic cylinders aim at their rod mounts; the rod length is the real distance between mounts
    for (const a of acts) {
      const B = a.b.clone().applyMatrix4(a.nodeB.matrix);
      const dir = B.sub(a.a);
      const L = dir.length();
      a.L = L;
      a.p.group.quaternion.setFromUnitVectors(Y, dir.divideScalar(L));
      a.rod.position.y = 0.22;
      a.rod.scale.y = Math.max(0.001, L - 0.22);
      a.eye.position.y = L;
    }
    C.spinDrives(P);
    fx(P);
    return P;
  };
  // effect of explode k (0 armor, 0.35 drives and frame, 0.7 gears) and of pulled / isolated parts
  const applyExplode = (k, extra) => {
    const e1 = sm(k / 0.35);
    const e2 = sm((k - 0.35) / 0.35);
    const e3 = sm((k - 0.7) / 0.3);
    for (const p of parts) {
      const e = Math.max(p.stage === 1 ? e1 : p.stage === 2 ? e2 : e3, p.pull, extra ? extra(p) : 0);
      p.e = e;
      p.group.position.copy(p.home).addScaledVector(p.out, p.dist * e * (p.stage === 3 ? 1 : 1.1));
    }
    root.updateMatrixWorld(true);
  };
  const tick = (dt) => {
    for (const p of parts) {
      p.raw = (p.raw ?? 0) + Math.sign(p.pullT - (p.raw ?? 0)) * Math.min(Math.abs(p.pullT - (p.raw ?? 0)), dt / 0.6);
      p.pull = sm(p.raw);
    }
  };
  const style = (p, a, edge, hover, sel) => {
    const key = `${a.toFixed(3)}${edge.toFixed(2)}${hover.toFixed(2)}${sel}`;
    if (p._k === key) return;
    p._k = key;
    for (const {m, base, e0} of p.mats) {
      m.opacity = base * a;
      m.depthWrite = a > 0.5;
      if (m.emissive) {
        if (e0 > 0) m.emissiveIntensity = e0;
        else {
          m.emissive.set(COL.orange);
          m.emissiveIntensity = hover * 0.3;
        }
      }
    }
    for (const l of p.edgeMats) {
      l.opacity = edge;
      l.color.set(sel || hover > 0.5 ? COL.orange : COL.ink);
    }
    p.group.traverse((o) => {
      if (o.userData.part && o.userData.part !== p) return; // a part riding inside this one styles itself
      if (o.isMesh) o.castShadow = a > 0.5 && !p.bit; // a ball or a coil casts no shadow worth its draw call
      if (o.isMesh || o.isLineSegments) o.visible = o.isLineSegments ? edge > 0.02 : a > 0.01;
    });
  };
  // explode layout: armor and frame leave along their own normal, pushed away from the body centre so limbs fan into a clean shell
  {
    setPose('STANCE', 0);
    const c = new V3(0, 1.9, 0);
    const wp = new V3();
    const pq = new THREE.Quaternion();
    for (const p of parts) {
      if (p.stage === 3 || (p.kind === 'drive' && !p.sub)) continue;
      p.group.getWorldPosition(wp);
      p.parent.getWorldQuaternion(pq);
      const bias = wp.clone().sub(c);
      bias.y *= 0.4;
      const w = p.out.clone().applyQuaternion(pq).add(bias.normalize().multiplyScalar(0.9)).normalize();
      p.out.copy(w.applyQuaternion(pq.invert()));
    }
  }
  const bounds = () => {
    const lo = new V3(1e9, 1e9, 1e9);
    const hi = new V3(-1e9, -1e9, -1e9);
    const e = new V3();
    for (const p of parts) {
      e.setFromMatrixPosition(p.group.matrixWorld);
      lo.min(e);
      hi.max(e);
    }
    return {lo, hi};
  };
  const gearCount = () => Object.values(drives).reduce((n, D) => n + ['s1', 's2'].reduce((m, st) => m + 2 + D.spin[st].planets.length, 0), 0);
  const worldTmp = new V3();
  const worldHome = new V3();
  const homeError = () => {
    root.updateMatrixWorld(true);
    let worst = 0;
    for (const p of movers) {
      p.parent.localToWorld(worldTmp.copy(p.group.position));
      p.parent.localToWorld(worldHome.copy(p.home));
      worst = Math.max(worst, worldTmp.distanceTo(worldHome));
    }
    return worst;
  };
  const worldPos = (id, out = new V3()) => byId[id].group.getWorldPosition(out);
  return {...C, ready, setPose, applyExplode, tick, style, gearCount, homeError, worldPos, bounds, resetFx, fx: fxg, trail};
}
