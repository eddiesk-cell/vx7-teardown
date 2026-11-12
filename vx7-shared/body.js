// The body: everything that hangs on the joint nodes besides the drives. Dimensions in metres, mech frame (+z forward, +x its left).
import * as THREE from 'three';
import {ARM, LEG, ACT} from './kin.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;

export function addBody(C) {
  const {COL, N, hexA, armor, bone, cable, segs, mkPart, addMesh, solid, Merge, box, cyl, poly, ext, annulus, ring, MATS, useMat, acts, feet} = C;
  const G = COL.graphite;
  const L2 = [['L', 1], ['R', -1]];
  const frame = (parent, id, name, tags, o = {}) => mkPart(parent, id, name, 'frame', {tags, out: o.out || [0, 0, 0], dist: o.dist ?? 0.4, stage: 2});

  // ---------------------------------------------------------------- pelvis
  {
    const p = frame(N.pelvis, 'pelvis-core', 'PELVIS CORE', ['hip'], {out: [0, -1, -0.3], dist: 0.55});
    solid(p, new Merge().add(box(0.56, 0.26, 0.36, 0.03), {c: G}).add(box(0.18, 0.3, 0.4, 0.02), {p: [0, -0.06, 0], c: COL.dark}).add(box(0.62, 0.05, 0.3, 0.01), {p: [0, 0.1, 0], c: COL.steel}));
    const b = frame(N.pelvis, 'hip-beam', 'HIP CROSS-BEAM', ['hip'], {out: [0, -0.4, -1], dist: 0.5});
    const m = new Merge().add(cyl(0.04, 0.04, 0.8, 10), {p: [0, -0.12, 0], r: [0, 0, Math.PI / 2], c: G});
    for (const x of [-0.3, -0.12, 0.12, 0.3]) m.add(cyl(0.055, 0.055, 0.03, 12), {p: [x, -0.12, 0], r: [0, 0, Math.PI / 2], c: COL.steel});
    solid(b, m);
    hexA(N.pelvis, 'pelvis-front', 'PELVIS FRONT PLATE', 0.4, 0.4, 0.045, [0, -0.04, 0.23], [-8, 0, 0], {trim: 'edge', cy: 0}, {c: 0.28, tp: 1, bt: 0.3});
    hexA(N.pelvis, 'pelvis-rear', 'PELVIS REAR PLATE', 0.4, 0.34, 0.045, [0, -0.02, -0.22], [0, 180, 0], {trim: 'block'}, {tp: 0.9, bt: 0.6});
    for (const [s, sx] of L2) {
      hexA(N.pelvis, 'hip-guard-' + s, s + ' HIP DRUM COVER', 0.34, 0.34, 0.04, [sx * 0.72, -0.12, 0], [0, sx * 90, 0], {tags: ['hip'], trim: 'block', cy: -0.12}, {c: 0.3, tp: 1, bt: 1});
      hexA(N.pelvis, 'skirt-' + s, s + ' SKIRT PLATE', 0.2, 0.32, 0.04, [sx * 0.33, -0.28, 0.2], [-14, sx * 18, 0], {trim: 'stripe'}, {tp: 0.9, bt: 0.55});
    }
  }
  // ---------------------------------------------------------------- spine and waist: stacked rings, power cables
  segs(N.pelvis, 'spine-low', 'SPINE RING', [0, 0.11, 0], 2, 0.075, 0.075, ['waist', 'spine']);
  segs(N.chest, 'spine-up', 'SPINE RING', [0, 0.06, 0], 3, 0.075, 0.075, ['waist', 'spine']);
  cable(N.pelvis, 'cable-waist', 'WAIST POWER CABLE', [[0, 0.02, 0.1], [0.03, 0.14, 0.12], [-0.02, 0.24, 0.1], [0, 0.3, 0.04]], ['waist'], {out: [0, 0.2, 1], dist: 0.5});

  // ---------------------------------------------------------------- chest
  {
    const p = frame(N.chest, 'chest-frame', 'CHEST FRAME', ['reactor', 'torso'], {out: [0, 0.2, -1], dist: 0.6});
    const sh = poly([[-0.12, 0.04], [0.12, 0.04], [0.3, 0.55], [0.36, 0.88], [-0.36, 0.88], [-0.3, 0.55]]);
    solid(p, new Merge().add(ext(sh, 0.3, 0.015), {c: G}).add(box(0.7, 0.04, 0.34, 0.008), {p: [0, 0.86, 0], c: COL.steel}).add(box(0.12, 0.5, 0.34, 0.01), {p: [0, 0.4, 0], c: COL.dark}), 'metal', {edges: ext(sh, 0.3, 0.015)});
    const b = frame(N.chest, 'back-frame', 'BACK FRAME', ['torso'], {out: [0, 0.2, -1], dist: 0.85});
    const m = new Merge().add(box(0.5, 0.7, 0.05, 0.01), {p: [0, 0.5, -0.2], c: G});
    for (const y of [0.25, 0.4, 0.55, 0.7]) m.add(box(0.46, 0.012, 0.012, 0.003), {p: [0, y, -0.23], c: COL.orange});
    solid(b, m);
    for (const [s, sx] of L2) {
      hexA(N.chest, 'pec-' + s, s + ' PECTORAL', 0.34, 0.36, 0.05, [sx * 0.4, 0.6, 0.18], [-10, sx * 28, 0], {tags: ['torso'], trim: 'stripe'}, {c: 0.28, tp: 0.8, bt: 0.9});
      hexA(N.chest, 'back-plate-' + s, s + ' BACK PLATE', 0.3, 0.55, 0.045, [sx * 0.2, 0.55, -0.23], [0, 180, 0], {tags: ['torso']}, {tp: 0.8, bt: 0.7});
      hexA(N.chest, 'abdomen-' + s, s + ' ABDOMEN GUARD', 0.18, 0.2, 0.04, [sx * 0.17, 0.12, 0.1], [0, sx * 70, 0], {tags: ['waist'], col: G, trim: 'edge'}, {tp: 0.8, bt: 0.7});
      hexA(N.chest, 'pauldron-' + s, s + ' PAULDRON', 0.4, 0.3, 0.12, [sx * 0.62, 1.03, 0.0], [-90, 0, sx * -8], {tags: ['shoulder', 'shoulder' + s], trim: 'block', cy: 0.82, dist: 0.8}, {c: 0.25, tp: 0.85, bt: 1});
      hexA(N.chest, 'pauldron-side-' + s, s + ' PAULDRON SIDE', 0.3, 0.26, 0.05, [sx * 0.78, 0.86, 0], [0, sx * 90, 0], {tags: ['shoulder', 'shoulder' + s], trim: 'stripe', cy: 0.82}, {c: 0.3, tp: 0.9, bt: 0.8});
      hexA(N.chest, 'pauldron-front-' + s, s + ' PAULDRON FRONT', 0.26, 0.2, 0.05, [sx * 0.6, 0.94, 0.22], [-15, sx * 15, 0], {tags: ['shoulder', 'shoulder' + s], trim: 'edge', cy: 0.82}, {c: 0.3, tp: 0.8, bt: 1});
      // shoulder yoke: a bracket around the shoulder drive
      const y = frame(N.chest, 'yoke-' + s, s + ' SHOULDER YOKE', ['shoulder', 'shoulder' + s], {out: [sx, 0.5, 0], dist: 0.55});
      solid(y, new Merge().add(box(0.12, 0.1, 0.34, 0.02), {p: [sx * 0.43, 0.82, 0], c: G}).add(cyl(0.2, 0.2, 0.03, 20), {p: [sx * 0.52, 0.82, 0], r: [0, 0, Math.PI / 2], c: COL.dark}));
    }
    hexA(N.chest, 'sternum', 'STERNUM PLATE', 0.2, 0.34, 0.045, [0, 0.27, 0.2], [-8, 0, 0], {tags: ['torso'], trim: 'stripe'}, {c: 0.3, tp: 1, bt: 0.45});
    hexA(N.chest, 'upper-chest', 'COLLAR PLATE', 0.34, 0.14, 0.045, [0, 0.88, 0.19], [-12, 0, 0], {tags: ['torso', 'head'], trim: 'block'}, {c: 0.4, tp: 0.7, bt: 1});
  }
  // ---------------------------------------------------------------- reactor
  {
    const T = ['reactor'];
    const c = [0, 0.6, 0.2];
    const h = mkPart(N.chest, 'reactor-housing', 'REACTOR HOUSING', 'reactor', {tags: T, pos: c, out: [0, 0, 1], dist: 0.7, stage: 2});
    const oct = new THREE.CylinderGeometry(0.23, 0.23, 0.1, 8);
    oct.rotateX(Math.PI / 2);
    const m = new Merge().add(annulus(0.23, 0.13, 0.1).rotateZ(Math.PI / 8), {c: G});
    for (const a of ring(8, 0, (t) => t)) m.add(cyl(0.012, 0.012, 0.014, 8), {p: [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.055], r: [Math.PI / 2, 0, 0], c: COL.chrome});
    m.add(annulus(0.135, 0.12, 0.12), {c: COL.orange});
    solid(h, m, 'metal', {edges: oct});
    const v = mkPart(N.chest, 'reactor-vents', 'REACTOR VENT SLATS', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.002], out: [0, 0.3, 1], dist: 0.95, stage: 2});
    const mv = new Merge();
    for (const a of ring(24, 0, (t) => t)) mv.add(box(0.05, 0.012, 0.028, 0.003), {p: [Math.cos(a) * 0.175, Math.sin(a) * 0.175, 0.07], r: [0, 0, a], c: a * 4 % 1 > 0.5 ? COL.steel : COL.dark});
    solid(v, mv);
    const core = mkPart(N.chest, 'reactor-core', 'REACTOR CORE', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.015], out: [0, 0, 1], dist: 0.35, stage: 2});
    addMesh(core, new THREE.TorusGeometry(0.095, 0.03, 12, 28), 'glow', {args: [COL.orange, 0.9]});
    const gl = mkPart(N.chest, 'reactor-glow', 'REACTOR PLASMA', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.02], out: [0, 0, 1], dist: 0.15, stage: 2});
    addMesh(gl, new THREE.SphereGeometry(0.07, 18, 12), 'glow', {args: ['#ffc15a', 0.95], shadow: false});
    for (const [s, sx] of L2) {
      const p = mkPart(N.chest, 'coolant-' + s, s + ' COOLANT PIPE', 'reactor', {tags: T, out: [sx, 0.4, 0.2], dist: 0.55, stage: 2});
      const curve = new THREE.CatmullRomCurve3([new V3(sx * 0.2, 0.55, 0.17), new V3(sx * 0.3, 0.45, 0.1), new V3(sx * 0.42, 0.5, 0.0), new V3(sx * 0.5, 0.66, -0.02)]);
      const mm = new Merge().add(new THREE.TubeGeometry(curve, 20, 0.018, 8), {c: COL.orange});
      for (const t of [0.05, 0.95]) mm.add(cyl(0.03, 0.03, 0.03, 10), {p: curve.getPointAt(t).toArray(), q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), curve.getTangentAt(t)), c: COL.chrome});
      solid(p, mm);
    }
  }
  // ---------------------------------------------------------------- neck, head
  segs(N.chest, 'neck-ring', 'NECK RING', [0, 0.74, 0.02], 3, 0.065, 0.055, ['head', 'neck']);
  cable(N.chest, 'cable-neck', 'NECK POWER CABLE', [[0.0, 0.62, 0.09], [0.04, 0.78, 0.09], [-0.02, 0.9, 0.07], [0, 0.96, 0.05]], ['head', 'neck'], {n: 5, out: [0, 0.3, 1], dist: 0.55});
  {
    const T = ['head'];
    const k = frame(N.head, 'skull', 'SKULL FRAME', T, {out: [0, 0.3, -1], dist: 0.4});
    solid(k, new Merge().add(box(0.2, 0.22, 0.26, 0.02), {p: [0, 0.22, -0.02], c: G}).add(cyl(0.05, 0.05, 0.05, 12), {p: [0, 0.05, 0], r: [0, 0, Math.PI / 2], c: COL.steel}));
    hexA(N.head, 'helmet-top', 'HELMET TOP PLATE', 0.24, 0.4, 0.04, [0, 0.4, 0.03], [-60, 0, 0], {tags: T, trim: 'stripe', cy: 0.25, out: [0, 1, 0.3], dist: 0.7}, {c: 0.3, tp: 0.35, bt: 1});
    hexA(N.head, 'helmet-face', 'HELMET FACE PLATE', 0.22, 0.26, 0.04, [0, 0.22, 0.17], [-12, 0, 0], {tags: T, trim: 'edge', cy: 0.25, out: [0, 0, 1], dist: 0.8}, {c: 0.3, tp: 1, bt: 0.45});
    hexA(N.head, 'helmet-back', 'HELMET BACK PLATE', 0.22, 0.28, 0.04, [0, 0.24, -0.17], [10, 180, 0], {tags: T, col: G, trim: 'block', cy: 0.25, out: [0, 0.2, -1], dist: 0.7}, {tp: 0.8, bt: 0.8});
    for (const [s, sx] of L2) {
      const cheek = [[0.05, 0.1], [-0.13, 0.13], [-0.2, 0.28], [0.0, 0.31], [0.11, 0.21]].map(([x, y]) => [x * (sx > 0 ? 1 : -1), y]);
      armor(N.head, 'helmet-side-' + s, s + ' HELMET CHEEK', cheek, 0.03, {p: [sx * 0.115, 0, 0], r: [0, sx * 90, 0]}, {tags: T, col: G, trim: 'edge', cy: 0.25, dist: 0.5, bolts: false});
      const fin = [[0, 0], [0.34, 0.12], [0.06, 0.15]].map(([x, y]) => [x * (sx > 0 ? 1 : -1), y]);
      armor(N.head, 'fin-' + s, s + ' HELMET FIN', fin, 0.012, {p: [sx * 0.09, 0.36, -0.1], r: [0, sx * 90, sx * 25]}, {tags: T, col: COL.white, line: false, bolts: false, cy: 0.25, dist: 0.5});
    }
    const vp = mkPart(N.head, 'visor', 'V VISOR', 'armor', {tags: T, pos: [0, 0.27, 0.215], out: [0, 0.2, 1], dist: 0.95, stage: 1});
    addMesh(vp, ext(poly([[-0.14, 0.06], [0, -0.07], [0.14, 0.06], [0.14, 0.12], [0, 0.0], [-0.14, 0.12]]), 0.02, 0.003), 'glow', {args: ['#ff9a2e', 0.85]});
    hexA(N.head, 'chin', 'CHIN GUARD', 0.14, 0.1, 0.03, [0, 0.07, 0.15], [-40, 0, 0], {tags: T, col: G, trim: 'edge', cy: 0.25}, {tp: 0.9, bt: 0.6});
  }
  // ---------------------------------------------------------------- arms
  for (const [s, sx] of L2) {
    const T = ['arm' + s, s === 'R' ? 'blade' : 'shield'];
    bone(N['sh' + s], 'upper-bone-' + s, s + ' UPPER ARM BONE', [0, -0.06, 0], [0, -ARM.upper + 0.06, 0], 0.04, 0.036, T, {out: [sx * 0.3, 0, -0.5], dist: 0.35, rib: true});
    bone(N['el' + s], 'fore-bone-' + s, s + ' FOREARM BONE', [0, -0.06, 0], [0, -ARM.fore + 0.04, 0], 0.04, 0.034, T, {out: [sx * 0.3, 0, -0.5], dist: 0.35, rib: true});
    cable(N['sh' + s], 'cable-el-' + s, s + ' ELBOW CABLE', [[-sx * 0.03, -0.08, 0.07], [-sx * 0.03, -0.3, 0.09], [0, -0.5, 0.07], [0, -ARM.upper + 0.02, 0.04]], T, {out: [0, 0, 1], dist: 0.5});
    cable(N.chest, 'cable-sh-' + s, s + ' SHOULDER CABLE', [[sx * 0.1, 0.58, 0.12], [sx * 0.25, 0.62, 0.15], [sx * 0.4, 0.76, 0.1], [sx * 0.5, 0.8, 0.07]], ['shoulder', 'shoulder' + s], {out: [sx, 0.2, 1], dist: 0.5});
    hexA(N['sh' + s], 'upper-arm-front-' + s, s + ' UPPER ARM PLATE', 0.17, 0.42, 0.04, [0, -0.31, 0.09], [0, 0, 0], {tags: T, col: G, trim: 'stripe'}, {tp: 0.7, bt: 0.8});
    hexA(N['sh' + s], 'upper-arm-outer-' + s, s + ' UPPER ARM SIDE', 0.14, 0.34, 0.04, [sx * 0.085, -0.3, 0], [0, sx * 90, 0], {tags: T, col: G, trim: 'edge'}, {tp: 0.8, bt: 0.8});
    hexA(N['el' + s], 'elbow-guard-' + s, s + ' ELBOW GUARD', 0.17, 0.16, 0.04, [0, 0.0, -0.1], [0, 180, 0], {tags: T, trim: 'block', cy: 0}, {c: 0.35, tp: 0.8, bt: 0.7});
    hexA(N['el' + s], 'forearm-outer-' + s, s + ' FOREARM ARMOR', 0.24, 0.56, 0.05, [sx * 0.105, -0.34, 0.01], [0, sx * 90, 0], {tags: T, trim: 'stripe'}, {c: 0.22, tp: 0.6, bt: 0.85});
    hexA(N['el' + s], 'forearm-top-' + s, s + ' FOREARM TOP', 0.2, 0.5, 0.045, [0, -0.32, 0.1], [0, 0, 0], {tags: T, trim: 'edge'}, {c: 0.25, tp: 0.7, bt: 0.9});
    hexA(N['el' + s], 'forearm-inner-' + s, s + ' FOREARM INNER', 0.16, 0.44, 0.04, [-sx * 0.085, -0.32, 0.01], [0, -sx * 90, 0], {tags: T, trim: 'block'}, {tp: 0.7, bt: 0.8});
  }
  // left hand: palm, four fingers (two phalanges), thumb
  {
    const T = ['armL', 'shield'];
    const palm = frame(N.wristL, 'hand-palm', 'CLAW PALM', T, {out: [0.3, -1, 0.2], dist: 0.4});
    solid(palm, new Merge().add(box(0.12, 0.13, 0.07, 0.015), {p: [0, -0.07, 0], c: G}).add(cyl(0.05, 0.05, 0.05, 10), {p: [0, 0, 0], r: [0, 0, Math.PI / 2], c: COL.steel}).add(box(0.04, 0.05, 0.075, 0.005), {p: [0, -0.07, 0], c: COL.orange}));
    for (let i = 0; i < 4; i++) {
      const x = -0.045 + i * 0.03;
      const f = frame(N.wristL, 'finger-' + (i + 1), 'CLAW FINGER ' + (i + 1), T, {out: [0.4 + 0.1 * i, -1, 0.5], dist: 0.35 + 0.04 * i});
      const a = new V3(x, -0.13, 0);
      const b = new V3(x, -0.21, 0.03);
      const c = new V3(x, -0.26, 0.09);
      const m = new Merge();
      for (const [p0, p1, r] of [[a, b, 0.012], [b, c, 0.01]]) {
        const sg = C.between(p0, p1);
        m.add(cyl(r, r * 0.8, sg.len, 6), {p: sg.p, q: sg.q, c: G});
      }
      for (const q of [a, b]) m.add(new THREE.SphereGeometry(0.013, 8, 6), {p: q.toArray(), c: COL.steel});
      m.add(cyl(0.01, 0.0, 0.05, 6), {p: [x, -0.29, 0.115], r: [Math.PI / 2 + 0.5, 0, 0], c: COL.ink});
      solid(f, m);
    }
    const th = frame(N.wristL, 'thumb', 'CLAW THUMB', T, {out: [-0.4, -0.6, 0.8], dist: 0.35});
    const a = new V3(0.06, -0.08, 0.02);
    const b = new V3(0.09, -0.15, 0.07);
    const sg = C.between(a, b);
    solid(th, new Merge().add(cyl(0.013, 0.01, sg.len, 6), {p: sg.p, q: sg.q, c: G}).add(cyl(0.01, 0, 0.05, 6), {p: [0.095, -0.17, 0.09], r: [Math.PI / 2 + 0.6, 0, 0], c: COL.ink}));
  }
  // right arm: fist, hilt and the plasma blade pointing down-forward
  {
    const T = ['armR', 'blade'];
    const f = frame(N.wristR, 'fist', 'HILT FIST', T, {out: [-0.3, -1, 0.3], dist: 0.4});
    solid(f, new Merge().add(box(0.14, 0.16, 0.1, 0.02), {p: [0, -0.08, 0.02], c: G}).add(box(0.2, 0.04, 0.12, 0.01), {p: [0, -0.18, 0.04], c: COL.orange}).add(cyl(0.05, 0.05, 0.05, 10), {r: [0, 0, Math.PI / 2], c: COL.steel}));
    const bp = mkPart(N.wristR, 'blade', 'PLASMA BLADE', 'armor', {tags: T, pos: [0, -0.2, 0.05], out: [-0.4, -0.6, 0.7], dist: 0.8, stage: 1});
    bp.keep = true;
    bp.group.rotation.x = 160 * D2R;
    const sh = (w, l) => poly([[0, 0], [w, 0.04], [w, l - 0.1], [0, l], [-w, l - 0.1], [-w, 0.04]]);
    const outer = ext(sh(0.032, 1.3), 0.012, 0.004).rotateY(Math.PI / 2);
    const inner = ext(sh(0.016, 1.2), 0.016, 0.003).rotateY(Math.PI / 2);
    addMesh(bp, outer, 'glow', {args: [COL.orange, 0.85], shadow: false});
    addMesh(bp, inner, 'glow', {args: ['#ffd68a', 0.95], shadow: false});
  }
  // ---------------------------------------------------------------- legs
  for (const [s, sx] of L2) {
    const T = ['leg' + s];
    const th = N['thigh' + s];
    const kn = N['knee' + s];
    const hk = N['hock' + s];
    const ft = N['foot' + s];
    bone(th, 'thigh-bone-' + s, s + ' THIGH BONE', [0, -0.1, 0], [0, -LEG.thigh + 0.1, 0], 0.055, 0.045, [...T, 'hip', 'knee'], {out: [0, 0, -1], dist: 0.35, rib: true});
    bone(kn, 'shin-bone-' + s, s + ' SHIN BONE', [0, -0.1, 0], [0, -LEG.shin + 0.08, 0], 0.045, 0.036, [...T, 'knee', 'foot'], {out: [0, 0, -1], dist: 0.35, rib: true});
    bone(hk, 'meta-bone-' + s, s + ' METATARSAL BONE', [0, -0.04, 0], [0, -LEG.meta + 0.04, 0], 0.034, 0.028, [...T, 'foot'], {out: [0, 0, -1], dist: 0.35});
    cable(th, 'cable-hip-' + s, s + ' HIP CABLE', [[-sx * 0.1, -0.02, 0.1], [-sx * 0.12, -0.08, 0.13], [-sx * 0.1, -0.12, 0.08], [-sx * 0.04, -0.1, 0.03]], [...T, 'hip'], {out: [-sx, 0.3, 0.5], dist: 0.5});
    cable(th, 'cable-knee-' + s, s + ' KNEE CABLE', [[-sx * 0.1, -0.14, 0.07], [-sx * 0.1, -0.4, 0.1], [-sx * 0.09, -0.64, 0.07], [-sx * 0.05, -LEG.thigh + 0.02, 0.03]], [...T, 'knee'], {out: [-sx, 0, 0.8], dist: 0.5});
    cable(th, 'hose-thigh-' + s, s + ' THIGH HOSE', [[sx * 0.11, -0.1, 0.08], [sx * 0.13, -0.3, 0.12], [sx * 0.11, -0.55, 0.1], [sx * 0.09, -0.76, 0.06]], [...T, 'knee'], {n: 3, r: 0.014, out: [sx, 0, 0.7], dist: 0.55});
    cable(kn, 'hose-shin-' + s, s + ' SHIN HOSE', [[sx * 0.09, -0.1, -0.08], [sx * 0.12, -0.3, -0.1], [sx * 0.11, -0.5, -0.09], [sx * 0.08, -0.72, -0.06]], [...T, 'foot'], {n: 3, r: 0.014, out: [sx, 0, -0.7], dist: 0.55});
    const A = [-sx * 0.12, 0, 0];
    // hydraulic actuators: cylinder from A (home) toward B, rod length follows the law of cosines
    const actuator = (id, name, parentA, parentB, a, b, tags, nodeB) => {
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
    actuator('act-knee-' + s, s + ' KNEE ACTUATOR', th, kn, [-sx * 0.12, -LEG.thigh + LEG.kA, 0], [-sx * 0.12, -LEG.kB, 0], [...T, 'knee'], kn);
    actuator('act-hock-' + s, s + ' HOCK ACTUATOR', kn, hk, [-sx * 0.12, -LEG.shin + LEG.hA, 0], [-sx * 0.12, -LEG.hB, 0], [...T, 'foot'], hk);
    actuator('act-arm-' + s, s + ' ARM PISTON', N['sh' + s], N['el' + s], [sx * 0.1, -ARM.upper + ARM.a, 0.0], [sx * 0.1, -ARM.b, 0], ['arm' + s, s === 'R' ? 'blade' : 'shield'], N['el' + s]);
    // armor (sized for the unit-length legs, stretched to the real segment lengths)
    const kt = LEG.thigh / 0.8;
    const ks = LEG.shin / 0.78;
    const km = LEG.meta / 0.62;
    const hx = (par, k, id, name, w, h, d, p, r, o, shape) => hexA(par, id, name, w, h * k, d, [p[0], p[1] * k, p[2]], r, o, shape);
    hx(th, kt, 'thigh-front-' + s, s + ' THIGH PLATE', 0.3, 0.62, 0.05, [0, -0.4, 0.15], [0, 0, 0], {tags: T, trim: 'stripe'}, {c: 0.25, tp: 0.7, bt: 0.5});
    hx(th, kt, 'thigh-outer-' + s, s + ' THIGH OUTER', 0.28, 0.6, 0.05, [sx * 0.14, -0.4, 0], [0, sx * 90, 0], {tags: T, trim: 'edge'}, {tp: 0.8, bt: 0.7});
    hx(th, kt, 'thigh-inner-' + s, s + ' THIGH INNER', 0.22, 0.5, 0.04, [-sx * 0.12, -0.4, 0], [0, -sx * 90, 0], {tags: T, trim: 'block'}, {tp: 0.8, bt: 0.7});
    hx(th, kt, 'thigh-rear-' + s, s + ' THIGH REAR', 0.2, 0.5, 0.04, [0, -0.4, -0.12], [0, 180, 0], {tags: T, col: G, trim: 'stripe'}, {tp: 0.8, bt: 0.8});
    hx(th, kt, 'thigh-cap-' + s, s + ' THIGH CAP', 0.22, 0.16, 0.045, [0, -0.1, 0.14], [-15, 0, 0], {tags: [...T, 'hip'], trim: 'edge'}, {c: 0.35, tp: 0.9, bt: 0.8});
    hexA(th, 'knee-guard-' + s, s + ' KNEE GUARD', 0.22, 0.24, 0.05, [0, -LEG.thigh - 0.02, 0.14], [10, 0, 0], {tags: [...T, 'knee'], trim: 'block'}, {c: 0.3, tp: 0.6, bt: 1});
    hx(kn, ks, 'shin-front-' + s, s + ' SHIN PLATE', 0.2, 0.4, 0.045, [0, -0.26, 0.11], [0, 0, 0], {tags: T, trim: 'stripe'}, {tp: 0.7, bt: 0.6});
    hx(kn, ks, 'shin-outer-' + s, s + ' SHIN OUTER', 0.22, 0.6, 0.045, [sx * 0.1, -0.4, 0], [0, sx * 90, 0], {tags: T, trim: 'edge'}, {tp: 0.8, bt: 0.5});
    hx(kn, ks, 'shin-inner-' + s, s + ' SHIN INNER', 0.16, 0.46, 0.04, [-sx * 0.1, -0.38, 0], [0, -sx * 90, 0], {tags: T, trim: 'block'}, {tp: 0.8, bt: 0.6});
    hx(kn, ks, 'calf-' + s, s + ' CALF PLATE', 0.2, 0.34, 0.045, [0, -0.3, -0.11], [0, 180, 0], {tags: T, col: G, trim: 'stripe'}, {tp: 0.8, bt: 0.8});
    hexA(kn, 'hock-guard-' + s, s + ' HOCK GUARD', 0.18, 0.2, 0.045, [0, -LEG.shin + 0.02, -0.1], [0, 180, 0], {tags: [...T, 'foot'], trim: 'block'}, {c: 0.3, tp: 1, bt: 0.8});
    hx(hk, km, 'meta-front-' + s, s + ' METATARSAL PLATE', 0.13, 0.45, 0.04, [0, -0.3, 0.075], [0, 0, 0], {tags: [...T, 'foot'], trim: 'stripe'}, {tp: 0.8, bt: 0.5});
    hx(hk, km, 'meta-side-' + s, s + ' METATARSAL SIDE', 0.12, 0.38, 0.035, [sx * 0.06, -0.28, 0], [0, sx * 90, 0], {tags: [...T, 'foot'], trim: 'edge'}, {tp: 0.8, bt: 0.6});
    hx(hk, km, 'spur-plate-' + s, s + ' SPUR PLATE', 0.1, 0.24, 0.035, [0, -0.2, -0.065], [0, 180, 0], {tags: [...T, 'foot'], col: G}, {tp: 0.8, bt: 0.5});
    hexA(ft, 'foot-top-' + s, s + ' FOOT COVER', 0.26, 0.22, 0.035, [0, -0.02, 0.14], [-90, 0, 0], {tags: [...T, 'foot'], trim: 'edge', cy: 0}, {c: 0.3, tp: 0.6, bt: 1});
    hexA(ft, 'heel-' + s, s + ' HEEL PLATE', 0.12, 0.12, 0.03, [0, -0.04, -0.07], [-90, 0, 0], {tags: [...T, 'foot'], col: G, cy: 0}, {tp: 0.8, bt: 1});
    // three claw toes and a rear spur, with ground-contact markers on the tips
    for (const [i, x] of [-0.11, 0, 0.11].entries()) {
      const t = frame(ft, `toe-${s}${i + 1}`, `${s} CLAW TOE ${i + 1}`, [...T, 'foot'], {out: [x * 6, -0.3, 1], dist: 0.4});
      const a = new V3(x * 0.4, -0.03, 0.04);
      const b = new V3(x * 1.3, -0.07, 0.3);
      const sg = C.between(a, b);
      solid(t, new Merge().add(cyl(0.032, 0.016, sg.len, 6), {p: sg.p, q: sg.q, c: G}).add(cyl(0.016, 0.0, 0.1, 6), {p: [x * 1.45, -0.095, 0.37], r: [Math.PI / 2 + 0.25, 0, 0], c: COL.ink}).add(new THREE.SphereGeometry(0.03, 8, 6), {p: a.toArray(), c: COL.steel}));
      const mk = new THREE.Object3D();
      mk.position.set(x * 1.45, -0.115, 0.4);
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
  // ---------------------------------------------------------------- shield on its drum
  {
    const T = ['shield'];
    const S = N.shield;
    S.rotation.order = 'YXZ';
    const O = {A: [0, 1.0], B: [0.39, 0.55], C: [0.39, -0.55], D: [0, -1.0], E: [-0.39, -0.55], F: [-0.39, 0.55]};
    const mk = (id, name, pts, o, z = 0) => armor(S, id, name, pts, 0.045, {p: [0, 0, z], r: [0, 0, 0]}, {tags: T, cy: 0.1, dist: 0.9 + 0.3 * C.hash(id), bolts: true, ...o});
    mk('shield-left', 'SHIELD LEFT PANEL', [O.F, [-0.39, -0.55], [-0.14, -0.34], [-0.14, 0.34], [0, 0.62], O.A].reverse(), {trim: 'stripe'});
    mk('shield-right', 'SHIELD RIGHT PANEL', [O.A, [0, 0.62], [0.14, 0.34], [0.14, -0.34], O.C, O.B], {trim: 'stripe'});
    mk('shield-bottom', 'SHIELD BOTTOM PANEL', [O.E, [-0.14, -0.34], [0.14, -0.34], O.C, O.D], {trim: 'edge'});
    mk('shield-core', 'SHIELD CORE PLATE', [[0, 0.62], [0.14, 0.34], [0.14, -0.34], [-0.14, -0.34], [-0.14, 0.34]], {col: G, trim: 'block'}, 0.012);
    const st = mkPart(S, 'shield-stripe', 'SHIELD ORANGE STRIPE', 'armor', {tags: T, pos: [0.27, 0.05, 0.03], out: [1, 0.2, 1], dist: 1.0, stage: 1});
    addMesh(st, ext(poly([[0, 0.5], [0.05, 0.5], [0.05, -0.2], [0, -0.3]]), 0.012, 0.003), 'glow', {args: [COL.orange, 0.35]});
    for (const [s, sx] of L2) {
      const r = frame(S, 'shield-rim-' + s, s + ' SHIELD RIM', T, {out: [sx, 0, -0.5], dist: 0.8});
      const a = new V3(sx * 0.39, 0.55, -0.02);
      const b = new V3(sx * 0.39, -0.55, -0.02);
      const sg = C.between(a, b);
      solid(r, new Merge().add(box(0.03, sg.len, 0.04, 0.005), {p: sg.p, c: G}).add(box(0.032, 0.12, 0.045, 0.005), {p: [sx * 0.39, 0.1, -0.02], c: COL.orange}));
    }
    const d = frame(S, 'shield-drum', 'SHIELD DRUM', T, {out: [0, 0.2, -1], dist: 0.55});
    solid(d, new Merge().add(cyl(0.17, 0.17, 0.2, 20), {p: [0, 0.7, -0.14], r: [Math.PI / 2, 0, 0], c: G}).add(cyl(0.12, 0.12, 0.04, 16), {p: [0, 0.7, -0.25], r: [Math.PI / 2, 0, 0], c: COL.steel}), 'metal', {edges: new THREE.CylinderGeometry(0.17, 0.17, 0.2, 20)});
    const dr = frame(S, 'shield-ring', 'DRUM ORANGE RING', T, {out: [0, 0.4, -1], dist: 0.75});
    const mr = new Merge().add(new THREE.TorusGeometry(0.175, 0.022, 8, 28), {p: [0, 0.7, -0.14], c: COL.orange});
    for (const a of ring(8, 0, (t) => t)) mr.add(cyl(0.012, 0.012, 0.02, 8), {p: [Math.cos(a) * 0.14, 0.7 + Math.sin(a) * 0.14, -0.05], r: [Math.PI / 2, 0, 0], c: COL.chrome});
    solid(dr, mr);
    // boom from the chest to the drum
    const bm = mkPart(N.chest, 'shield-boom', 'SHIELD BOOM', 'frame', {tags: T, out: [0.5, 0.3, -1], dist: 0.6, stage: 2});
    const a = new V3(0.42, 0.9, -0.2);
    const b = new V3(0.95, 1.04, -0.42);
    const sg = C.between(a, b);
    solid(bm, new Merge().add(cyl(0.05, 0.05, sg.len, 8), {p: sg.p, q: sg.q, c: G}).add(cyl(0.065, 0.065, 0.03, 10), {p: sg.p, q: sg.q, c: COL.steel}));
  }
}
