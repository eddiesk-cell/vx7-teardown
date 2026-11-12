// The VX-7 as a scene graph: structural joint nodes (posed from kin.js) and, hanging on them, separable PARTS
// (armor panels, frame, cables, hydraulics, reactor, and the ten planetary drives split into eight sub-parts each).
// Each part has a home, an explode vector and a stage: armor flies first, then drives/frame, then the gears split.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ACT, ARM, D2R, DRIVES, GEAR, LEG, actLen, driveKin, pose} from './kin.js';
import {addBody} from './body.js';

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
    const [rx, ry, rz] = (place.r || [0, 0, 0]).map((a) => a * D2R);
    const n = new V3(0, 0, 1).applyEuler(new THREE.Euler(rx, ry, rz));
    const rad = new V3(place.p[0], (place.p[1] - cy) * 0.3, place.p[2]);
    const ov = out ? new V3(...out).normalize() : rad.lengthSq() > 0.004 ? rad.normalize().multiplyScalar(0.7).add(n.clone().multiplyScalar(0.6)).normalize() : n;
    const p = mkPart(parent, id, name, 'armor', {tags, pos: place.p, out: ov.toArray(), dist: dist ?? 0.55 + 0.4 * hash(id), stage: 1});
    p.group.rotation.set(rx, ry, rz);
    const shell = ext(poly(shapePts), d);
    const front = d / 2 + 0.012;
    const m = new Merge().add(shell, {c: col});
    if (line) {
      const s = poly(scalePts(shapePts, 0.8));
      s.holes.push(new THREE.Path(scalePts(shapePts, 0.76).reverse().map(([x, y]) => new THREE.Vector2(x, y))));
      m.add(new THREE.ExtrudeGeometry(s, {depth: 0.003, bevelEnabled: false}), {p: [0, 0, front], c: COL.ink});
    }
    let xs = shapePts.map((q) => q[0]);
    let ys = shapePts.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cyy = (Math.max(...ys) + Math.min(...ys)) / 2;
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
  const N = {};
  N.pelvis = node(root, 0, 1.95, 0, 0);
  N.waist = node(N.pelvis, 0, 0.3, 0);
  N.chest = node(N.waist, 0, 0, 0, 0.55);
  N.neck = node(N.chest, 0, 0.95, 0.02);
  N.head = node(N.neck, 0, 0, 0, 0.28);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    N['hipAbd' + s] = node(N.pelvis, sx * 0.4, -0.12, 0);
    N['hip' + s] = node(N['hipAbd' + s]);
    N['thigh' + s] = N['hip' + s];
    N['knee' + s] = node(N['thigh' + s], 0, -LEG.thigh, 0);
    N['hock' + s] = node(N['knee' + s], 0, -LEG.shin, 0);
    N['foot' + s] = node(N['hock' + s], 0, -LEG.meta, 0);
    N['shAbd' + s] = node(N.chest, sx * 0.55, 0.82, 0);
    N['sh' + s] = node(N['shAbd' + s]);
    N['el' + s] = node(N['sh' + s], 0, -ARM.upper, 0);
    N['wrist' + s] = node(N['el' + s], 0, -ARM.fore, 0);
    for (const k of ['thigh', 'knee', 'hock', 'sh', 'el']) N[k + s].userData.cy = -0.38;
  }
  N.shield = node(N.chest, 0.98, 0.35, -0.3);
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
    const planetsOf = (st, g) => {
      // sun, three planets on pins, carrier spider, ring: one stage's gears, phased to mesh exactly (sun tooth at 0 deg, planet gap at its pin)
      const sunG = new THREE.Group();
      const carG = new THREE.Group();
      g.group.add(sunG, carG);
      const ms = new Merge().add(gearGeo(GEAR.Zs, false, 8), {c: COL.steel}).add(cyl(3, 3, 16, 12), {r: [Math.PI / 2, 0, 0], c: COL.chrome});
      ms.add(annulus(6, 3.4, 1.2), {p: [0, 0, 4.4], c: COL.dark});
      addMesh({mats: g.mats, group: sunG}, ms.build(), 'metal').userData.part = g;
      const mc = new Merge().add(cyl(8, 8, 1.6, 16), {p: [0, 0, -5.3], r: [Math.PI / 2, 0, 0], c: COL.dark});
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3;
        mc.add(box(GEAR.pinR - 4, 3, 1.6, 0.4), {p: [Math.cos(a) * (GEAR.pinR / 2 + 2), Math.sin(a) * (GEAR.pinR / 2 + 2), -5.3], r: [0, 0, a], c: COL.dark});
        mc.add(cyl(2, 2, 14, 10), {p: [Math.cos(a) * GEAR.pinR, Math.sin(a) * GEAR.pinR, 0], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      }
      addMesh({mats: g.mats, group: carG}, mc.build(), 'metal').userData.part = g;
      const planets = [];
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3;
        const pg = new THREE.Group();
        pg.position.set(Math.cos(a) * GEAR.pinR, Math.sin(a) * GEAR.pinR, 0);
        carG.add(pg);
        const mp = new Merge().add(gearGeo(GEAR.Zp, false, 8), {c: k === 0 ? COL.orange : COL.steel}).add(annulus(4, 2.2, 8.4), {c: COL.dark});
        addMesh({mats: g.mats, group: pg}, mp.build(), 'metal').userData.part = g;
        planets.push({pg, a: (a * 180) / Math.PI});
      }
      D.spin[st] = {sunG, carG, planets};
    };
    const ringOf = (g) => {
      const m = new Merge().add(gearGeo(GEAR.Zr, true, 8), {c: COL.steel}).add(annulus(47, 41.5, 3), {p: [0, 0, -2.5], c: COL.graphite});
      for (const a of ring(12, 0, (t) => t)) m.add(cyl(1.3, 1.3, 1.2, 8), {p: [Math.cos(a) * 44.3, Math.sin(a) * 44.3, -4.4], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      m.add(box(10, 3, 4, 0.5), {p: [0, 47, 0], c: COL.orange});
      addMesh(g, m.build(), 'metal');
    };
    // 1 bearing: outer race fixed, inner race and the cage with balls turn at the output angle; bolt circles on the face plate
    sub('bearing', 'CROSS-ROLLER BEARING', -11, -80, (p) => {
      const outer = new Merge().add(annulus(47, 38.5, 8), {c: COL.steel}).add(annulus(47, 44, 2), {p: [0, 0, -4], c: COL.graphite});
      for (const a of ring(12, 0, (t) => t)) outer.add(cyl(1.4, 1.4, 1.2, 8), {p: [Math.cos(a) * 45.5, Math.sin(a) * 45.5, -5.2], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      outer.add(box(9, 3, 3, 0.5), {p: [0, 47, 0], c: COL.orange});
      addMesh(p, outer.build(), 'metal');
      const inner = new THREE.Group();
      p.group.add(inner);
      const mi = new Merge().add(annulus(36.5, 27, 8), {c: COL.chrome}).add(annulus(38, 33, 1.6), {p: [0, 0, 4.4], c: COL.graphite});
      for (const a of ring(8, 0, (t) => t)) mi.add(cyl(1.5, 1.5, 1.2, 8), {p: [Math.cos(a) * 31, Math.sin(a) * 31, 5.4], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      addMesh({mats: p.mats, group: inner}, mi.build(), 'metal').userData.part = p;
      const cage = new THREE.Group();
      p.group.add(cage);
      const mb = new Merge();
      for (const a of ring(24, 0, (t) => t)) mb.add(new THREE.SphereGeometry(2.1, 8, 6), {p: [Math.cos(a) * 37.7, Math.sin(a) * 37.7, 0], c: COL.chrome});
      mb.add(annulus(39.5, 36, 1.5), {p: [0, 0, 0], c: COL.copper});
      addMesh({mats: p.mats, group: cage}, mb.build(), 'metal').userData.part = p;
      D.spin.bearing = {inner, cage};
    });
    // 2-5 the two planetary stages: ring (housing) separates from its gears
    sub('ring2', 'STAGE 2 RING 72T', 0, -40, (p) => ringOf(p));
    sub('gears2', 'STAGE 2 GEARS', 0, 0, (p) => planetsOf('s2', p));
    sub('gears1', 'STAGE 1 GEARS', 12, 40, (p) => planetsOf('s1', p));
    sub('ring1', 'STAGE 1 RING 72T', 12, 80, (p) => ringOf(p));
    // 6 stator with 24 copper coils, 7 rotor with 20 magnets and an encoder disc, 8 shaft collar and circlips
    sub('stator', 'MOTOR STATOR', 26, 120, (p) => {
      const m = new Merge().add(annulus(43, 31, 12), {c: COL.graphite});
      for (const a of ring(24, 0, (t) => t)) m.add(box(5, 4, 11, 0.8), {p: [Math.cos(a) * 28.5, Math.sin(a) * 28.5, 0], r: [0, 0, a], c: COL.copper});
      for (const a of ring(24, 0, (t) => t)) m.add(box(2, 3, 12.4, 0.3), {p: [Math.cos(a) * 43, Math.sin(a) * 43, 0], r: [0, 0, a], c: COL.dark});
      for (const a of ring(8, 0, (t) => t)) m.add(cyl(1.4, 1.4, 1.2, 8), {p: [Math.cos(a) * 37, Math.sin(a) * 37, 6.5], r: [Math.PI / 2, 0, 0], c: COL.chrome});
      addMesh(p, m.build(), 'metal');
    });
    sub('rotor', 'MOTOR ROTOR + ENCODER', 26, 160, (p) => {
      const rg = new THREE.Group();
      p.group.add(rg);
      const m = new Merge().add(annulus(24, 12, 10), {c: COL.dark}).add(cyl(3, 3, 34, 12), {r: [Math.PI / 2, 0, 0], c: COL.chrome});
      for (const a of ring(20, 0, (t) => t)) m.add(box(4.2, 2.6, 9, 0.4), {p: [Math.cos(a) * 24.5, Math.sin(a) * 24.5, 0], r: [0, 0, a], c: COL.steel});
      for (const a of ring(20, 0, (t) => t)) if (Math.round((a / (2 * Math.PI)) * 20) % 2) m.add(box(4.2, 2.6, 9.2, 0.4), {p: [Math.cos(a) * 24.5, Math.sin(a) * 24.5, 0], r: [0, 0, a], c: COL.ink});
      // encoder disc: slits and one orange index mark
      m.add(annulus(20, 5, 1), {p: [0, 0, 8.5], c: COL.chrome});
      for (const a of ring(36, 0, (t) => t)) m.add(box(1, 5, 1.3, 0.1), {p: [Math.cos(a) * 16, Math.sin(a) * 16, 8.5], r: [0, 0, a - Math.PI / 2], c: COL.ink});
      m.add(box(2.4, 7, 1.5, 0.2), {p: [0, 17, 8.8], c: COL.orange});
      addMesh({mats: p.mats, group: rg}, m.build(), 'metal').userData.part = p;
      D.spin.rotor = rg;
    });
    sub('collar', 'SHAFT COLLAR + CIRCLIPS', 26, 200, (p) => {
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
  buildDrive(DRV.neck, N.chest, [0, 0.95, 0.02], 1, 1, ['head', 'neck'], 1);
  buildDrive(DRV.waist, N.pelvis, [0, 0.3, 0], -1, 1, ['waist', 'spine'], 1);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    buildDrive(DRV['sh' + s], N.chest, [sx * 0.55, 0.82, 0], sx, -1, ['shoulder', 'shoulder' + s, s === 'R' ? 'blade' : 'shield'], 1);
    buildDrive(DRV['el' + s], N['sh' + s], [0, -ARM.upper, 0], sx, -1, ['arm' + s, s === 'R' ? 'blade' : 'shield'], 1);
    buildDrive(DRV['hip' + s], N['hipAbd' + s], [0, 0, 0], sx, -1, ['hip', 'leg' + s], 1);
    buildDrive(DRV['knee' + s], N['thigh' + s], [0, -LEG.thigh, 0], sx, 1, ['knee', 'leg' + s], 1);
  }
  const _ = {ARM, LEG, ACT, actLen};
  void _;
  return {COL, root, parts, byId, movers, pickables, drives, acts, feet, N, SX, spinDrives, mkPart, addMesh, solid, Merge, armor, hexA, bone, cable, segs, node, box, cyl, poly, ext, hexPts, annulus, ring, between, MATS, useMat, hash, sm, pose};
}

// ------------------------------------------------------------ the finished mech
export function buildMech() {
  const C = core();
  addBody(C);
  const {root, parts, byId, movers, N, acts, feet, drives, pickables} = C;
  const Y = new V3(0, 1, 0);
  const tmpA = new V3();
  const setPose = (seq, tau) => {
    const P = pose(seq, tau);
    N.pelvis.rotation.x = P.lean * D2R;
    N.waist.rotation.x = P.waist * D2R;
    N.neck.rotation.x = P.neck * D2R;
    N.shield.rotation.set(0, (50 + P.shield) * D2R, 10 * D2R);
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      N['hipAbd' + s].rotation.z = sx * LEG.abd * D2R;
      N['hip' + s].rotation.x = -(LEG.thighLean + P['hip' + s]) * D2R;
      N['knee' + s].rotation.x = (LEG.kneeBend + P['knee' + s]) * D2R;
      N['hock' + s].rotation.x = -(LEG.hockBend + P['hock' + s]) * D2R;
      N['foot' + s].rotation.x = -(N.pelvis.rotation.x + N['hip' + s].rotation.x + N['knee' + s].rotation.x + N['hock' + s].rotation.x);
      N['shAbd' + s].rotation.z = sx * (s === 'R' ? 30 : 14) * D2R;
      N['sh' + s].rotation.x = -P['sh' + s] * D2R;
      N['el' + s].rotation.x = -P['el' + s] * D2R;
    }
    for (const k in N) N[k].updateMatrix();
    // the lowest claw tip rests on the floor
    N.pelvis.position.y = 0;
    root.updateMatrixWorld(true);
    let low = 1e9;
    for (const m of feet) low = Math.min(low, m.getWorldPosition(tmpA).y);
    N.pelvis.position.y = -low;
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
      p.group.position.copy(p.home).addScaledVector(p.out, p.dist * e);
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
      if (o.isMesh) o.castShadow = a > 0.5;
      if (o.isMesh || o.isLineSegments) o.visible = o.isLineSegments ? edge > 0.02 : a > 0.01;
    });
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
  return {...C, setPose, applyExplode, tick, style, gearCount, homeError, worldPos};
}
