// The body: everything that hangs on the joint nodes besides the drives. Dimensions in metres, mech frame (+z forward, +x its left).
// Lean and tapered: a V chest over a wasp waist, long digitigrade legs, round graphite drums at hips, knees and the shield shoulder.
import * as THREE from 'three';
import {ARM, ACT, BODY, LEG} from './kin.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;

export function addBody(C) {
  const {COL, N, hexA, armor, bone, cable, segs, mkPart, addMesh, solid, Merge, box, cyl, poly, ext, annulus, ring, useMat, acts, feet} = C;
  const G = COL.graphite;
  const L2 = [['L', 1], ['R', -1]];
  const frame = (parent, id, name, tags, o = {}) => mkPart(parent, id, name, 'frame', {tags, out: o.out || [0, 0, 0], dist: o.dist ?? 0.4, stage: 2});
  // a polygon plate, mirrored for the right side; pts are for the +x side
  const side = (pts, sx) => (sx > 0 ? pts : pts.map(([x, y]) => [-x, y]).reverse());
  // a big round graphite drum (axis along local x) with an orange ring and bolts, as a pullable cover
  const drum = (parent, id, name, pos, sx, r, len, tags) => {
    const p = mkPart(parent, id, name, 'armor', {tags, pos, out: [sx, 0.1, 0.1], dist: 0.8, stage: 1});
    const m = new Merge().add(cyl(r, r, len, 28), {r: [0, 0, Math.PI / 2], c: G}).add(new THREE.TorusGeometry(r * 0.86, r * 0.07, 8, 32), {p: [sx * len * 0.5, 0, 0], r: [0, Math.PI / 2, 0], c: COL.orange});
    m.add(cyl(r * 0.5, r * 0.5, len * 0.4, 20), {p: [sx * len * 0.55, 0, 0], r: [0, 0, Math.PI / 2], c: COL.dark});
    for (const a of ring(8, 0, (t) => t)) m.add(cyl(r * 0.05, r * 0.05, 0.015, 8), {p: [sx * len * 0.52, Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66], r: [0, 0, Math.PI / 2], c: COL.chrome});
    addMesh(p, m.build(), 'armor', {edges: new THREE.CylinderGeometry(r, r, len, 28).rotateZ(Math.PI / 2)});
    return p;
  };


  // ---- shell(): loft a chamfered cross-section along from -> to through profile stations [[t, halfWidth, halfDepth, forwardOffset], ...],
  // cut into 6 sectors x 2 length bands (or every edge, for symmetric parts). Each cell is its own pullable armor part: 16 mm thick,
  // 5 mm gaps for panel lines, graphite inner wall, white front/outer, graphite rear/inner, an orange strip on the outer edge, bolts.
  const SECT = {
    1: {front: [0], 'front-outer': [7], outer: [6], 'rear-outer': [5], rear: [4], inner: [1, 2, 3]},
    '-1': {front: [0], 'front-outer': [1], outer: [2], 'rear-outer': [3], rear: [4], inner: [5, 6, 7]},
    0: {front: [0], 'front-L': [7], 'side-L': [6], 'rear-L': [5], rear: [4], 'rear-R': [3], 'side-R': [2], 'front-R': [1]},
  };
  const DARK = new Set(['rear', 'inner', 'rear-L', 'rear-R']);
  const ring8 = (w, d, ck = 0.3) => {
    const c = ck * Math.min(w, d);
    return [[w - c, d], [-(w - c), d], [-w, d - c], [-w, -(d - c)], [-(w - c), -d], [w - c, -d], [w, -(d - c)], [w, d - c]];
  };
  const stationAt = (P, t) => {
    let i = 0;
    while (i < P.length - 2 && t > P[i + 1][0]) i++;
    const k = Math.min(1, Math.max(0, (t - P[i][0]) / (P[i + 1][0] - P[i][0])));
    return [1, 2, 3].map((j) => P[i][j] + (P[i + 1][j] - P[i][j]) * k);
  };
  function shell(node, id, name, from, to, profile, o = {}) {
    const {sx = 1, tags = [], omit = [], split = 0.5, th = 0.016, gap = 0.005, trim = true, dist, bolts = true} = o;
    const A = new V3(...from);
    const D = new V3(...to).sub(A);
    const L = D.length();
    const sectors = SECT[o.sym ? 0 : sx];
    const station = (t, shrink) => {
      const [w, d, dz] = stationAt(profile, t);
      const pts = ring8(Math.max(0.01, w - shrink), Math.max(0.01, d - shrink), o.chamfer ?? 0.3);
      const c = A.clone().addScaledVector(D, t);
      return {c: c.clone().add(new V3(0, 0, dz)), pts: pts.map(([x, z]) => c.clone().add(new V3(x, 0, z + dz)))};
    };
    const bands = [[0, split], [split, 1]];
    const made = [];
    bands.forEach(([t0, t1], bi) => {
      const ts = [t0 + gap / 2 / L, ...profile.map((p) => p[0]).filter((t) => t > t0 + gap / L && t < t1 - gap / L), t1 - gap / 2 / L];
      for (const [sname, edges] of Object.entries(sectors)) {
        if (omit.includes(`${sname}:${bi}`) || omit.includes(sname)) continue;
        const chain = [edges[0], ...edges.map((e) => (e + 1) % 8)];
        const dark = DARK.has(sname) || (o.darkSectors || []).includes(sname);
        const col = dark ? COL.graphite : COL.white;
        const Os = [];
        const Is = [];
        for (const t of ts) {
          const so = station(t, 0);
          const si = station(t, th);
          const cut = (st) => {
            const v = chain.map((k) => st.pts[k].clone());
            // a gap between sector neighbours: pull the two end vertices along their edges
            const n = v.length;
            v[0].lerp(v[1], gap / 2 / Math.max(1e-3, v[0].distanceTo(v[1])));
            v[n - 1].lerp(v[n - 2], gap / 2 / Math.max(1e-3, v[n - 1].distanceTo(v[n - 2])));
            return v;
          };
          Os.push({v: cut(so), c: so.c});
          Is.push({v: cut(si), c: si.c});
        }
        const all = Os.flatMap((s) => s.v);
        const cen = all.reduce((a, v) => a.add(v), new V3()).multiplyScalar(1 / all.length);
        const pos = [];
        const colr = [];
        const quad = (a, b, c, d, ref, sign, color) => {
          const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
          const mid = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
          const flip = n.dot(mid.clone().sub(ref)) * sign < 0;
          const q = flip ? [a, d, c, b] : [a, b, c, d];
          for (const i of [0, 1, 2, 0, 2, 3]) {
            pos.push(q[i].x - cen.x, q[i].y - cen.y, q[i].z - cen.z);
            colr.push(color.r, color.g, color.b);
          }
        };
        const cw = new THREE.Color(col);
        const cg = new THREE.Color(COL.graphite);
        const ns = Os.length;
        const m = chain.length;
        for (let s = 0; s < ns - 1; s++)
          for (let k = 0; k < m - 1; k++) {
            quad(Os[s].v[k], Os[s].v[k + 1], Os[s + 1].v[k + 1], Os[s + 1].v[k], Os[s].c, 1, cw);
            quad(Is[s].v[k], Is[s].v[k + 1], Is[s + 1].v[k + 1], Is[s + 1].v[k], Is[s].c, -1, cg);
          }
        for (const s of [0, ns - 1]) for (let k = 0; k < m - 1; k++) quad(Os[s].v[k], Os[s].v[k + 1], Is[s].v[k + 1], Is[s].v[k], cen, 1, cw);
        for (const k of [0, m - 1]) for (let s = 0; s < ns - 1; s++) quad(Os[s].v[k], Os[s + 1].v[k], Is[s + 1].v[k], Is[s].v[k], cen, 1, cw);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
        geo.computeVertexNormals();
        const edgeSrc = geo.clone();
        edgeSrc.deleteAttribute('color');
        const mid = Os[Math.floor(ns / 2)];
        const out = mid.v.reduce((a, v) => a.add(v), new V3()).multiplyScalar(1 / m).sub(mid.c);
        out.y = 0;
        const part = mkPart(node, `${id}-${sname}-${bi}`, `${name} ${sname.toUpperCase()} ${bi + 1}`, 'armor', {tags, pos: cen.toArray(), out: out.normalize().toArray(), dist: dist ?? 0.55 + 0.4 * hash(`${id}${sname}${bi}`), stage: 1});
        const extra = new Merge();
        const surf = (s, k, off) => Os[s].v[k].clone().sub(Os[s].c).setY(0).normalize().multiplyScalar(off).add(Os[s].v[k]);
        // orange strip along the outer edge
        if (trim && (sname === 'outer' || sname === 'side-L' || sname === 'side-R') && ns > 1) {
          const tp = [];
          const tc = [];
          const k0 = chain.length - 1;
          for (let s = 0; s < ns - 1; s++) {
            const q = [surf(s, 0, 0.0015), surf(s + 1, 0, 0.0015), surf(s + 1, 0, 0.0015).lerp(Os[s + 1].v[1], 0.18), surf(s, 0, 0.0015).lerp(Os[s].v[1], 0.18)];
            for (const i of [0, 1, 2, 0, 2, 3]) tp.push(q[i].x - cen.x, q[i].y - cen.y, q[i].z - cen.z);
          }
          void k0;
          const tg = new THREE.BufferGeometry();
          tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
          tg.computeVertexNormals();
          extra.add(tg, {c: COL.orange});
        }
        // fasteners on the front and outer panels
        if (bolts && !dark && ns > 1) {
          const mk = Math.floor(chain.length / 2);
          for (const s of [0, ns - 1]) {
            const p0 = Os[s].v[mk - 1 >= 0 ? mk - 1 : 0].clone().lerp(Os[s].v[mk], 0.5);
            const p1 = Os[Math.min(ns - 1, s === 0 ? 1 : ns - 2)].v[mk - 1 >= 0 ? mk - 1 : 0].clone().lerp(Os[Math.min(ns - 1, s === 0 ? 1 : ns - 2)].v[mk], 0.5);
            const pp = p0.lerp(p1, 0.25);
            const nrm = pp.clone().sub(Os[s].c).setY(0).normalize();
            extra.add(cyl(0.011, 0.011, 0.009, 8), {p: [pp.x - cen.x + nrm.x * 0.003, pp.y - cen.y, pp.z - cen.z + nrm.z * 0.003], q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), nrm), c: COL.chrome});
          }
        }
        addMesh(part, geo, 'armor', {edges: edgeSrc});
        if (extra.g.length) addMesh(part, extra.build(), 'armor', {shadow: false});
        made.push(part);
      }
    });
    return made;
  }
  const hash = C.hash;

  // ---------------------------------------------------------------- pelvis
  {
    const p = frame(N.pelvis, 'pelvis-core', 'PELVIS CORE', ['hip'], {out: [0, -1, -0.3], dist: 0.55});
    solid(p, new Merge().add(box(0.38, 0.2, 0.22, 0.03), {c: G}).add(box(0.14, 0.26, 0.26, 0.02), {p: [0, -0.06, 0], c: COL.dark}).add(box(0.5, 0.05, 0.28, 0.01), {p: [0, 0.1, 0], c: COL.steel}));
    const b = frame(N.pelvis, 'hip-beam', 'HIP CROSS-BEAM', ['hip'], {out: [0, -0.4, -1], dist: 0.5});
    const m = new Merge().add(cyl(0.04, 0.04, 0.7, 10), {p: [0, -0.12, 0], r: [0, 0, Math.PI / 2], c: G});
    for (const x of [-0.26, -0.1, 0.1, 0.26]) m.add(cyl(0.055, 0.055, 0.03, 12), {p: [x, -0.12, 0], r: [0, 0, Math.PI / 2], c: COL.steel});
    solid(b, m);
    shell(N.pelvis, 'pelvis', 'PELVIS', [0, -0.2, 0], [0, 0.12, 0], [[0, 0.12, 0.13, 0], [0.3, 0.29, 0.19, 0.01], [0.7, 0.27, 0.17, 0], [1, 0.19, 0.13, 0]], {sym: true, chamfer: 0.55, tags: ['hip'], omit: ['rear-L:1', 'rear-R:1', 'rear:1'], trim: false});
    for (const [s, sx] of L2) {
      drum(N['hipAbd' + s], 'hip-drum-' + s, s + ' HIP DRUM', [sx * 0.2, 0, 0], sx, 0.2, 0.1, ['hip', 'leg' + s]);
    }
  }
  // ---------------------------------------------------------------- spine and waist: exposed rings, orange cables
  segs(N.pelvis, 'spine-low', 'SPINE RING', [0, 0.12, 0], 3, 0.075, 0.065, ['waist', 'spine']);
  cable(N.pelvis, 'cable-waist', 'WAIST POWER CABLE', [[0.0, 0.0, 0.12], [0.05, 0.14, 0.1], [-0.03, 0.26, 0.09], [0, BODY.waistY, 0.05]], ['waist'], {n: 5, r: 0.013, out: [0, 0.2, 1], dist: 0.5});
  cable(N.pelvis, 'cable-waist-2', 'WAIST SIDE CABLE', [[0.0, 0.0, -0.12], [-0.06, 0.14, -0.08], [0.03, 0.26, -0.07], [0, BODY.waistY, -0.04]], ['waist'], {n: 3, r: 0.012, out: [0, 0.2, -1], dist: 0.5});

  // ---------------------------------------------------------------- chest: a V, white pectorals meeting at the reactor
  {
    const p = frame(N.chest, 'chest-frame', 'CHEST FRAME', ['torso'], {out: [0, 0.2, -1], dist: 0.6});
    const sh = poly([[-0.07, 0.03], [0.07, 0.03], [0.22, 0.4], [0.27, 0.66], [-0.27, 0.66], [-0.22, 0.4]]);
    const m = new Merge().add(ext(sh, 0.24, 0.015), {c: G}).add(box(0.5, 0.04, 0.24, 0.008), {p: [0, 0.67, 0], c: COL.steel});
    for (const y of [0.12, 0.22, 0.32]) m.add(box(0.1 + y * 0.3, 0.014, 0.22, 0.003), {p: [0, y, 0.0], c: COL.dark});
    solid(p, m, 'metal', {edges: ext(sh, 0.24, 0.015)});
    const b = frame(N.chest, 'back-frame', 'BACK FRAME', ['torso'], {out: [0, 0.2, -1], dist: 0.85});
    const mb = new Merge().add(box(0.4, 0.5, 0.05, 0.01), {p: [0, 0.36, -0.15], c: G});
    for (const y of [0.15, 0.27, 0.39, 0.51]) mb.add(box(0.36, 0.012, 0.012, 0.003), {p: [0, y, -0.18], c: COL.orange});
    solid(b, mb);
    // one lofted shell from the waist to the collar: a strong V, front panel left open on the reactor
    shell(N.chest, 'chest', 'CHEST', [0, 0, 0], [0, 0.68, 0], [[0, 0.18, 0.15, 0], [0.3, 0.32, 0.19, 0.01], [0.62, 0.42, 0.21, 0.02], [0.9, 0.44, 0.18, 0], [1, 0.24, 0.13, 0]], {sym: true, chamfer: 0.8, tags: ['torso'], omit: ['front', 'rear-L:0', 'rear-R:0', 'rear:0'], trim: true});
    for (const [s, sx] of L2) {
      // sloped angular pauldron: a wedge tilted out and down, a front plate and a side plate
      armor(N.chest, 'pauldron-' + s, s + ' PAULDRON', side([[-0.15, -0.11], [0.17, -0.09], [0.21, 0.07], [0.02, 0.17], [-0.15, 0.1]], sx), 0.045, {p: [sx * 0.45, 0.8, -0.01], r: [-90, 0, -sx * 26, 'ZYX']}, {tags: ['shoulder', 'shoulder' + s], trim: 'block', cy: 0.62, dist: 0.8});
      hexA(N.chest, 'pauldron-side-' + s, s + ' PAULDRON SIDE', 0.2, 0.26, 0.04, [sx * 0.6, 0.68, 0], [0, sx * 90, 0], {tags: ['shoulder', 'shoulder' + s], trim: 'stripe', cy: 0.62}, {c: 0.3, tp: 1, bt: 0.5});
      hexA(N.chest, 'pauldron-front-' + s, s + ' PAULDRON FRONT', 0.18, 0.18, 0.04, [sx * 0.45, 0.74, 0.17], [-20, sx * 18, 0], {tags: ['shoulder', 'shoulder' + s], trim: 'edge', cy: 0.62}, {c: 0.3, tp: 0.8, bt: 1});
      const y = frame(N.chest, 'yoke-' + s, s + ' SHOULDER YOKE', ['shoulder', 'shoulder' + s], {out: [sx, 0.5, 0], dist: 0.55});
      solid(y, new Merge().add(box(0.1, 0.1, 0.3, 0.02), {p: [sx * 0.36, BODY.shY, 0], c: G}).add(cyl(0.17, 0.17, 0.03, 20), {p: [sx * 0.46, BODY.shY, 0], r: [0, 0, Math.PI / 2], c: COL.dark}));
    }
  }
  // ---------------------------------------------------------------- reactor
  {
    const T = ['reactor'];
    const c = [0, 0.48, 0.17];
    const h = mkPart(N.chest, 'reactor-housing', 'REACTOR HOUSING', 'reactor', {tags: T, pos: c, out: [0, 0, 1], dist: 0.7, stage: 2});
    const m = new Merge().add(annulus(0.2, 0.115, 0.1).rotateZ(Math.PI / 8), {c: G});
    for (const a of ring(8, 0, (t) => t)) m.add(cyl(0.011, 0.011, 0.014, 8), {p: [Math.cos(a) * 0.175, Math.sin(a) * 0.175, 0.055], r: [Math.PI / 2, 0, 0], c: COL.chrome});
    m.add(annulus(0.12, 0.106, 0.12), {c: COL.orange});
    solid(h, m, 'metal', {edges: new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8).rotateX(Math.PI / 2)});
    const v = mkPart(N.chest, 'reactor-vents', 'REACTOR VENT SLATS', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.002], out: [0, 0.3, 1], dist: 0.95, stage: 2});
    const mv = new Merge();
    for (const a of ring(24, 0, (t) => t)) mv.add(box(0.045, 0.011, 0.026, 0.003), {p: [Math.cos(a) * 0.155, Math.sin(a) * 0.155, 0.07], r: [0, 0, a], c: Math.round((a / (2 * Math.PI)) * 24) % 2 ? COL.steel : COL.dark});
    solid(v, mv);
    const core = mkPart(N.chest, 'reactor-core', 'REACTOR CORE', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.015], out: [0, 0, 1], dist: 0.35, stage: 2});
    addMesh(core, new THREE.TorusGeometry(0.085, 0.028, 12, 28), 'glow', {args: [COL.orange, 0.9]});
    const gl = mkPart(N.chest, 'reactor-glow', 'REACTOR PLASMA', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.02], out: [0, 0, 1], dist: 0.15, stage: 2});
    addMesh(gl, new THREE.SphereGeometry(0.062, 18, 12), 'glow', {args: ['#ffc15a', 0.95], shadow: false});
    for (const [s, sx] of L2) {
      const p = mkPart(N.chest, 'coolant-' + s, s + ' COOLANT PIPE', 'reactor', {tags: T, out: [sx, 0.4, 0.2], dist: 0.55, stage: 2});
      const curve = new THREE.CatmullRomCurve3([new V3(sx * 0.17, 0.43, 0.15), new V3(sx * 0.24, 0.33, 0.08), new V3(sx * 0.33, 0.38, 0.0), new V3(sx * 0.38, 0.54, -0.02)]);
      const mm = new Merge().add(new THREE.TubeGeometry(curve, 20, 0.016, 8), {c: COL.orange});
      for (const t of [0.05, 0.95]) mm.add(cyl(0.028, 0.028, 0.03, 10), {p: curve.getPointAt(t).toArray(), q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), curve.getTangentAt(t)), c: COL.chrome});
      solid(p, mm);
    }
  }
  // ---------------------------------------------------------------- neck, head
  segs(N.chest, 'neck-ring', 'NECK RING', [0, BODY.neckY - 0.12, 0.02], 3, 0.065, 0.05, ['head', 'neck']);
  cable(N.chest, 'cable-neck', 'NECK POWER CABLE', [[0.0, 0.42, 0.09], [0.04, 0.54, 0.09], [-0.02, 0.64, 0.07], [0, BODY.neckY + 0.01, 0.05]], ['head', 'neck'], {n: 5, out: [0, 0.3, 1], dist: 0.55});
  {
    const T = ['head'];
    const k = frame(N.head, 'skull', 'SKULL FRAME', T, {out: [0, 0.3, -1], dist: 0.4});
    solid(k, new Merge().add(box(0.18, 0.22, 0.24, 0.02), {p: [0, 0.22, -0.02], c: G}).add(cyl(0.05, 0.05, 0.05, 12), {p: [0, 0.05, 0], r: [0, 0, Math.PI / 2], c: COL.steel}));
    hexA(N.head, 'helmet-top', 'HELMET TOP PLATE', 0.2, 0.42, 0.04, [0, 0.4, 0.04], [-62, 0, 0], {tags: T, trim: 'stripe', cy: 0.25, out: [0, 1, 0.3], dist: 0.7}, {c: 0.3, tp: 0.3, bt: 1});
    hexA(N.head, 'helmet-face', 'HELMET FACE PLATE', 0.19, 0.28, 0.04, [0, 0.22, 0.16], [-12, 0, 0], {tags: T, trim: 'edge', cy: 0.25, out: [0, 0, 1], dist: 0.8}, {c: 0.3, tp: 1, bt: 0.35});
    hexA(N.head, 'helmet-back', 'HELMET BACK PLATE', 0.2, 0.28, 0.04, [0, 0.24, -0.16], [10, 180, 0], {tags: T, col: G, trim: 'block', cy: 0.25, out: [0, 0.2, -1], dist: 0.7}, {tp: 0.8, bt: 0.8});
    for (const [s, sx] of L2) {
      const cheek = side([[0.05, 0.1], [-0.13, 0.13], [-0.2, 0.28], [0.0, 0.31], [0.11, 0.21]], sx);
      armor(N.head, 'helmet-side-' + s, s + ' HELMET CHEEK', cheek, 0.03, {p: [sx * 0.105, 0, 0], r: [0, sx * 90, 0]}, {tags: T, col: G, trim: 'edge', cy: 0.25, dist: 0.5, bolts: false});
      // fins sweep back and up at about 45 degrees
      armor(N.head, 'fin-' + s, s + ' HELMET FIN', side([[0, 0], [0.24, 0.04], [0.03, 0.08]], sx), 0.012, {p: [sx * 0.08, 0.42, -0.08], r: [0, sx * 90, sx * 38]}, {tags: T, line: false, bolts: false, cy: 0.25, dist: 0.5});
    }
    const vp = mkPart(N.head, 'visor', 'V VISOR', 'armor', {tags: T, pos: [0, 0.27, 0.2], out: [0, 0.2, 1], dist: 0.95, stage: 1});
    addMesh(vp, ext(poly([[-0.12, 0.06], [0, -0.06], [0.12, 0.06], [0.12, 0.1], [0, 0.0], [-0.12, 0.1]]), 0.02, 0.003), 'glow', {args: ['#ff9a2e', 0.85]});
    hexA(N.head, 'chin', 'CHIN GUARD', 0.12, 0.1, 0.03, [0, 0.07, 0.14], [-40, 0, 0], {tags: T, col: G, trim: 'edge', cy: 0.25}, {tp: 0.9, bt: 0.6});
  }
  // ---------------------------------------------------------------- arms: long, thin, tapering to the elbow and wrist
  for (const [s, sx] of L2) {
    const T = ['arm' + s, s === 'R' ? 'blade' : 'shield'];
    bone(N['sh' + s], 'upper-bone-' + s, s + ' UPPER ARM BONE', [0, -0.06, 0], [0, -ARM.upper + 0.06, 0], 0.036, 0.03, T, {out: [sx * 0.3, 0, -0.5], dist: 0.35, rib: true});
    bone(N['el' + s], 'fore-bone-' + s, s + ' FOREARM BONE', [0, -0.06, 0], [0, -ARM.fore + 0.04, 0], 0.034, 0.028, T, {out: [sx * 0.3, 0, -0.5], dist: 0.35, rib: true});
    shell(N['sh' + s], 'upper-arm-' + s, s + ' UPPER ARM', [0, -0.04, 0], [0, -ARM.upper + 0.02, 0], [[0, 0.13, 0.12, 0], [0.3, 0.125, 0.11, 0.01], [1, 0.08, 0.08, 0]], {sx, tags: T, omit: ['rear:1', 'inner:1'], darkSectors: ['front', 'outer', 'front-outer', 'rear-outer'], trim: true});
    shell(N['el' + s], 'forearm-' + s, s + ' FOREARM', [0, -0.03, 0], [0, -ARM.fore + 0.02, 0], [[0, 0.09, 0.09, 0], [0.3, 0.17, 0.13, 0.01], [0.75, 0.13, 0.1, 0.01], [1, 0.08, 0.08, 0]], {sx, tags: T, omit: ['inner:1', 'rear:1'], trim: true});
    cable(N['sh' + s], 'cable-el-' + s, s + ' ELBOW CABLE', [[-sx * 0.03, -0.08, 0.06], [-sx * 0.03, -0.3, 0.08], [0, -0.5, 0.06], [0, -ARM.upper + 0.02, 0.04]], T, {out: [0, 0, 1], dist: 0.5});
    cable(N.chest, 'cable-sh-' + s, s + ' SHOULDER CABLE', [[sx * 0.1, 0.4, 0.12], [sx * 0.2, 0.44, 0.13], [sx * 0.3, 0.54, 0.08], [sx * BODY.shX, BODY.shY - 0.02, 0.07]], ['shoulder', 'shoulder' + s], {out: [sx, 0.2, 1], dist: 0.5});
  }
  // left hand: palm, four fingers (two phalanges), thumb
  {
    const T = ['armL', 'shield'];
    const palm = frame(N.wristL, 'hand-palm', 'CLAW PALM', T, {out: [0.3, -1, 0.2], dist: 0.4});
    solid(palm, new Merge().add(box(0.11, 0.12, 0.06, 0.015), {p: [0, -0.07, 0], c: G}).add(cyl(0.045, 0.045, 0.05, 10), {r: [0, 0, Math.PI / 2], c: COL.steel}).add(box(0.04, 0.05, 0.065, 0.005), {p: [0, -0.07, 0], c: COL.orange}));
    for (let i = 0; i < 4; i++) {
      const x = -0.04 + i * 0.027;
      const f = frame(N.wristL, 'finger-' + (i + 1), 'CLAW FINGER ' + (i + 1), T, {out: [0.4 + 0.1 * i, -1, 0.5], dist: 0.35 + 0.04 * i});
      const a = new V3(x, -0.13, 0);
      const b = new V3(x, -0.22, 0.03);
      const c = new V3(x, -0.29, 0.09);
      const m = new Merge();
      for (const [p0, p1, r] of [[a, b, 0.011], [b, c, 0.009]]) {
        const sg = C.between(p0, p1);
        m.add(cyl(r, r * 0.8, sg.len, 6), {p: sg.p, q: sg.q, c: G});
      }
      for (const q of [a, b]) m.add(new THREE.SphereGeometry(0.012, 8, 6), {p: q.toArray(), c: COL.steel});
      m.add(cyl(0.009, 0.0, 0.05, 6), {p: [x, -0.32, 0.115], r: [Math.PI / 2 + 0.5, 0, 0], c: COL.ink});
      solid(f, m);
    }
    const th = frame(N.wristL, 'thumb', 'CLAW THUMB', T, {out: [-0.4, -0.6, 0.8], dist: 0.35});
    const a = new V3(0.055, -0.08, 0.02);
    const b = new V3(0.085, -0.16, 0.07);
    const sg = C.between(a, b);
    solid(th, new Merge().add(cyl(0.012, 0.009, sg.len, 6), {p: sg.p, q: sg.q, c: G}).add(cyl(0.009, 0, 0.05, 6), {p: [0.09, -0.18, 0.09], r: [Math.PI / 2 + 0.6, 0, 0], c: COL.ink}));
  }
  // right arm: fist and an emitter housing at the wrist, a thick tapered plasma blade pointing down-forward
  {
    const T = ['armR', 'blade'];
    const f = frame(N.wristR, 'fist', 'HILT FIST', T, {out: [-0.3, -1, 0.3], dist: 0.4});
    solid(f, new Merge().add(box(0.13, 0.14, 0.09, 0.02), {p: [0, -0.07, 0.01], c: G}).add(cyl(0.05, 0.05, 0.05, 10), {r: [0, 0, Math.PI / 2], c: COL.steel}));
    const BR = 135 * D2R;
    const em = mkPart(N.wristR, 'blade-emitter', 'BLADE EMITTER HOUSING', 'frame', {tags: T, pos: [0, -0.15, 0.04], out: [-0.3, -0.8, 0.5], dist: 0.55, stage: 2});
    em.group.rotation.set(BR, 0, -0.38);
    solid(em, new Merge().add(cyl(0.062, 0.062, 0.2, 14), {p: [0, 0.1, 0], c: G}).add(cyl(0.07, 0.07, 0.025, 14), {p: [0, 0.2, 0], c: COL.orange}).add(cyl(0.07, 0.07, 0.025, 14), {p: [0, 0.03, 0], c: COL.steel}).add(box(0.1, 0.05, 0.14, 0.01), {p: [0, 0.13, 0], c: COL.dark}));
    const bp = mkPart(N.wristR, 'blade', 'PLASMA BLADE', 'armor', {tags: T, pos: [0, -0.15, 0.04], out: [-0.4, -0.6, 0.7], dist: 0.9, stage: 1});
    bp.keep = true;
    bp.group.rotation.set(BR, 0, -0.38);
    const sh = (w, l, tip) => poly([[-w, 0], [w, 0], [w * 0.72, l - tip], [0, l], [-w * 0.72, l - tip]]);
    addMesh(bp, ext(sh(0.045, 1.5, 0.38), 0.03, 0.006).translate(0, 0.22, 0), 'glow', {args: [COL.orange, 0.85], shadow: false});
    addMesh(bp, ext(sh(0.026, 1.4, 0.36), 0.04, 0.004).translate(0, 0.24, 0), 'glow', {args: ['#ffd68a', 0.95], shadow: false});
  }
  // ---------------------------------------------------------------- legs: digitigrade, tapering to the knee, hock and ankle
  for (const [s, sx] of L2) {
    const T = ['leg' + s];
    const th = N['thigh' + s];
    const kn = N['knee' + s];
    const hk = N['hock' + s];
    const ft = N['foot' + s];
    bone(th, 'thigh-bone-' + s, s + ' THIGH BONE', [0, -0.1, 0], [0, -LEG.thigh + 0.1, 0], 0.05, 0.04, [...T, 'hip', 'knee'], {out: [0, 0, -1], dist: 0.35, rib: true});
    bone(kn, 'shin-bone-' + s, s + ' SHIN BONE', [0, -0.1, 0], [0, -LEG.shin + 0.08, 0], 0.04, 0.03, [...T, 'knee', 'foot'], {out: [0, 0, -1], dist: 0.35, rib: true});
    bone(hk, 'meta-bone-' + s, s + ' METATARSAL BONE', [0, -0.04, 0], [0, -LEG.meta + 0.04, 0], 0.03, 0.024, [...T, 'foot'], {out: [0, 0, -1], dist: 0.35});
    cable(th, 'cable-hip-' + s, s + ' HIP CABLE', [[-sx * 0.1, -0.02, 0.1], [-sx * 0.12, -0.08, 0.13], [-sx * 0.1, -0.12, 0.08], [-sx * 0.04, -0.1, 0.03]], [...T, 'hip'], {out: [-sx, 0.3, 0.5], dist: 0.5});
    cable(th, 'cable-knee-' + s, s + ' KNEE CABLE', [[-sx * 0.1, -0.14, 0.07], [-sx * 0.1, -0.45, 0.1], [-sx * 0.09, -0.7, 0.07], [-sx * 0.05, -LEG.thigh + 0.02, 0.03]], [...T, 'knee'], {out: [-sx, 0, 0.8], dist: 0.5});
    cable(th, 'hose-thigh-' + s, s + ' THIGH HOSE', [[sx * 0.1, -0.1, 0.08], [sx * 0.12, -0.34, 0.1], [sx * 0.1, -0.6, 0.09], [sx * 0.08, -LEG.thigh + 0.04, 0.05]], [...T, 'knee'], {n: 3, r: 0.014, out: [sx, 0, 0.7], dist: 0.55});
    cable(kn, 'hose-shin-' + s, s + ' SHIN HOSE', [[sx * 0.08, -0.1, -0.07], [sx * 0.1, -0.35, -0.09], [sx * 0.1, -0.6, -0.08], [sx * 0.07, -LEG.shin + 0.06, -0.05]], [...T, 'foot'], {n: 3, r: 0.014, out: [sx, 0, -0.7], dist: 0.55});
    drum(th, 'knee-drum-' + s, s + ' KNEE DRUM', [sx * 0.22, -LEG.thigh, 0], sx, 0.17, 0.09, [...T, 'knee']);
    // hydraulic actuators: cylinder from A (home) toward B, rod length follows the law of cosines
    const actuator = (id, name, parentA, a, b, tags, nodeB) => {
      const p = mkPart(parentA, id, name, 'hydraulic', {tags, pos: a, out: [-sx * 0.8, 0, 0.5], dist: 0.45, stage: 2});
      const m = new Merge().add(cyl(0.034, 0.034, 0.22, 14), {p: [0, 0.12, 0], c: G}).add(cyl(0.04, 0.04, 0.02, 14), {p: [0, 0.01, 0], c: COL.steel}).add(cyl(0.04, 0.04, 0.02, 14), {p: [0, 0.23, 0], c: COL.steel});
      m.add(cyl(0.022, 0.022, 0.1, 10), {p: [0, 0.2, 0], c: COL.orange});
      m.add(cyl(0.02, 0.02, 0.1, 10), {p: [0, -0.01, 0], r: [0, 0, Math.PI / 2], c: COL.orange});
      m.add(cyl(0.014, 0.014, 0.05, 8), {p: [0.045, 0.1, 0], r: [0, 0, Math.PI / 2], c: COL.orange}).add(cyl(0.017, 0.017, 0.018, 8), {p: [0.07, 0.1, 0], r: [0, 0, Math.PI / 2], c: COL.chrome});
      solid(p, m);
      const rg = new THREE.CylinderGeometry(ACT.rod / 2, ACT.rod / 2, 1, 12);
      rg.translate(0, 0.5, 0);
      const rod = addMesh(p, new Merge().add(rg, {c: COL.chrome}).build(), 'metal');
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.045, 12), useMat(p, 'glow', COL.orange, 0.2));
      eye.rotation.z = Math.PI / 2;
      p.group.add(eye);
      eye.userData.part = p;
      acts.push({p, rod, eye, nodeB, a: new V3(...a), b: new V3(...b), parentA});
    };
    actuator('act-knee-' + s, s + ' KNEE ACTUATOR', th, [-sx * 0.12, -LEG.thigh + LEG.kA, 0], [-sx * 0.12, -LEG.kB, 0], [...T, 'knee'], kn);
    actuator('act-hock-' + s, s + ' HOCK ACTUATOR', kn, [-sx * 0.12, -LEG.shin + LEG.hA, 0], [-sx * 0.12, -LEG.hB, 0], [...T, 'foot'], hk);
    actuator('act-arm-' + s, s + ' ARM PISTON', N['sh' + s], [sx * 0.09, -ARM.upper + ARM.a, 0.0], [sx * 0.09, -ARM.b, 0], ['arm' + s, s === 'R' ? 'blade' : 'shield'], N['el' + s]);
    // lofted leg shells: thigh bulging at 25%, shin and metatarsal tapering to the hock and ankle
    shell(th, 'thigh-' + s, s + ' THIGH', [0, -0.06, 0], [0, -LEG.thigh, 0], [[0, 0.2, 0.17, 0], [0.25, 0.26, 0.2, 0.02], [0.7, 0.19, 0.16, 0.01], [1, 0.15, 0.13, 0]], {sx, tags: T, omit: ['inner:1', 'rear:0']});
    shell(kn, 'shin-' + s, s + ' SHIN', [0, -0.05, 0], [0, -LEG.shin + 0.04, 0], [[0, 0.15, 0.14, 0.02], [0.3, 0.17, 0.15, 0.03], [1, 0.08, 0.08, 0]], {sx, tags: T, omit: ['inner:0', 'rear:1']});
    shell(hk, 'meta-' + s, s + ' METATARSAL', [0, -0.03, 0], [0, -LEG.meta + 0.03, 0], [[0, 0.1, 0.1, 0], [1, 0.065, 0.06, 0.01]], {sx, tags: [...T, 'foot'], omit: ['inner:1'], bolts: false});
    hexA(th, 'knee-guard-' + s, s + ' KNEE GUARD', 0.2, 0.22, 0.05, [0, -LEG.thigh - 0.02, 0.13], [10, 0, 0], {tags: [...T, 'knee'], trim: 'block'}, {c: 0.3, tp: 0.6, bt: 1});
    hexA(kn, 'hock-guard-' + s, s + ' HOCK GUARD', 0.16, 0.2, 0.045, [0, -LEG.shin + 0.02, -0.09], [0, 180, 0], {tags: [...T, 'foot'], trim: 'block'}, {c: 0.3, tp: 1, bt: 0.8});
    hexA(ft, 'foot-top-' + s, s + ' FOOT COVER', 0.24, 0.22, 0.035, [0, -0.02, 0.14], [-90, 0, 0], {tags: [...T, 'foot'], trim: 'edge', cy: 0}, {c: 0.3, tp: 0.6, bt: 1});
    hexA(ft, 'heel-' + s, s + ' HEEL PLATE', 0.12, 0.12, 0.03, [0, -0.04, -0.07], [-90, 0, 0], {tags: [...T, 'foot'], col: G, cy: 0}, {tp: 0.8, bt: 1});
    for (const [i, x] of [-0.14, 0, 0.14].entries()) {
      const t = frame(ft, `toe-${s}${i + 1}`, `${s} CLAW TOE ${i + 1}`, [...T, 'foot'], {out: [x * 6, -0.3, 1], dist: 0.4});
      const a = new V3(x * 0.4, -0.03, 0.04);
      const b = new V3(x * 1.6, -0.07, 0.34);
      const sg = C.between(a, b);
      solid(t, new Merge().add(cyl(0.045, 0.022, sg.len, 6), {p: sg.p, q: sg.q, c: G}).add(cyl(0.022, 0.0, 0.12, 6), {p: [x * 1.75, -0.095, 0.42], r: [Math.PI / 2 + 0.25, 0, 0], c: COL.ink}).add(new THREE.SphereGeometry(0.03, 8, 6), {p: a.toArray(), c: COL.steel}));
      const mk = new THREE.Object3D();
      mk.position.set(x * 1.75, -0.115, 0.46);
      ft.add(mk);
      feet.push(mk);
    }
    const sp = frame(ft, 'spur-' + s, s + ' REAR SPUR', [...T, 'foot'], {out: [0, -0.3, -1], dist: 0.4});
    solid(sp, new Merge().add(cyl(0.025, 0.0, 0.2, 6), {p: [0, -0.07, -0.1], r: [-Math.PI / 2 - 0.5, 0, 0], c: G}).add(new THREE.SphereGeometry(0.035, 8, 6), {c: COL.steel}));
    const mk = new THREE.Object3D();
    mk.position.set(0, -0.12, -0.2);
    ft.add(mk);
    feet.push(mk);
  }
  // ---------------------------------------------------------------- shield: an elongated hexagon folded along its long axis,
  // white wings, a graphite spine, two orange stripes, on a big rotary drum with an orange ring
  {
    const T = ['shield'];
    const S = N.shield;
    S.rotation.order = 'YXZ';
    const mk = (id, name, pts, o, ry = 0, z = 0, x = 0) => armor(S, id, name, pts, 0.04, {p: [x, 0, z], r: [0, ry, 0]}, {tags: T, cy: 0.1, dist: 0.9 + 0.3 * C.hash(id), ...o});
    mk('shield-left', 'SHIELD LEFT WING', [[-0.07, 0.9], [-0.07, -0.9], [-0.39, -0.55], [-0.39, 0.55]].reverse(), {trim: 'stripe'}, 7);
    mk('shield-right', 'SHIELD RIGHT WING', [[0.07, 0.9], [0.39, 0.55], [0.39, -0.55], [0.07, -0.9]], {trim: 'block'}, -7);
    mk('shield-top', 'SHIELD TOP CAP', [[0, 1.0], [0.39, 0.55], [0.07, 0.9], [-0.07, 0.9], [-0.39, 0.55]].reverse(), {trim: 'edge'}, 0, 0.004);
    mk('shield-bottom', 'SHIELD TIP', [[0, -1.0], [-0.07, -0.9], [-0.39, -0.55], [-0.2, -0.8]].reverse(), {trim: 'edge'}, 0, 0.004);
    mk('shield-spine', 'SHIELD GRAPHITE SPINE', [[0, 1.0], [0.07, 0.9], [0.07, -0.9], [0, -1.0], [-0.07, -0.9], [-0.07, 0.9]], {col: G, trim: 'block'}, 0, 0.03);
    for (const [s, sx] of L2) {
      const st = mkPart(S, 'shield-stripe-' + s, s + ' SHIELD ORANGE STRIPE', 'armor', {tags: T, pos: [sx * 0.21, 0.06, 0.036 + 0.0], out: [sx, 0.2, 1], dist: 1.0, stage: 1});
      st.group.rotation.y = -sx * 7 * D2R;
      addMesh(st, ext(poly([[-0.02, 0.5], [0.02, 0.5], [0.02, -0.3], [-0.02, -0.4]]), 0.012, 0.003), 'glow', {args: [COL.orange, 0.4]});
      const r = frame(S, 'shield-rim-' + s, s + ' SHIELD RIM', T, {out: [sx, 0, -0.5], dist: 0.8});
      const a = new V3(sx * 0.39, 0.55, -0.02);
      const b = new V3(sx * 0.39, -0.55, -0.02);
      const sg = C.between(a, b);
      solid(r, new Merge().add(box(0.03, sg.len, 0.04, 0.005), {p: sg.p, c: G}).add(box(0.032, 0.12, 0.045, 0.005), {p: [sx * 0.39, 0.1, -0.02], c: COL.orange}));
    }
    drum(S, 'shield-drum', 'SHIELD DRUM', [0, 0.75, -0.16], 1, 0.22, 0.12, T).group.rotation.y = Math.PI / 2;
    // boom from the chest to the drum
    const bm = mkPart(N.chest, 'shield-boom', 'SHIELD BOOM', 'frame', {tags: T, out: [0.5, 0.3, -1], dist: 0.6, stage: 2});
    const a = new V3(0.4, 0.9, -0.2);
    const b = new V3(0.9, 1.1, -0.42);
    const sg = C.between(a, b);
    solid(bm, new Merge().add(cyl(0.05, 0.05, sg.len, 8), {p: sg.p, q: sg.q, c: G}).add(cyl(0.065, 0.065, 0.03, 10), {p: sg.p, q: sg.q, c: COL.steel}));
  }
}
