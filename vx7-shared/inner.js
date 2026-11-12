// Everything under the shell, built from code and hung on the measured joint nodes: the graphite frame (pelvis, spine,
// chest frame, limb bones), cable bundles, the knee / hock / elbow hydraulics, the chest reactor, and the parts the
// 3D shell does not carry — the shield on its boom and the plasma blade. The planetary drives are built in mech.js.
// Limb nodes run their local -Y down the limb (kin.js REST), so a limb part from y=0 to y=-LEN is bone-length exact.
import * as THREE from 'three';
import {ACT, ARM, LEG, LEN, REST} from './kin.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;

export function addInner(C) {
  const {COL, N, mkPart, addMesh, solid, Merge, box, cyl, poly, ext, annulus, ring, useMat, acts, feet, bone, cable, segs, armor, between, hash} = C;
  const G = COL.graphite;
  const L2 = [['L', 1], ['R', -1]];
  const frame = (parent, id, name, tags, o = {}) => mkPart(parent, id, name, 'frame', {tags, out: o.out || [0, 0, 0], dist: o.dist ?? 0.4, stage: 2, pos: o.pos});
  const W = REST.waist[1];

  // ---------------------------------------------------------------- pelvis, spine, chest frame
  {
    const p = frame(N.pelvis, 'pelvis-core', 'PELVIS CORE', ['hip'], {out: [0, -1, -0.3], dist: 0.5});
    solid(p, new Merge().add(box(0.36, 0.22, 0.26, 0.03), {p: [0, -0.02, 0], c: G}).add(box(0.14, 0.26, 0.3, 0.02), {p: [0, -0.06, 0], c: COL.dark}).add(box(0.4, 0.04, 0.22, 0.01), {p: [0, 0.08, 0], c: COL.steel}));
    const b = frame(N.pelvis, 'hip-beam', 'HIP CROSS-BEAM', ['hip'], {out: [0, -0.4, -1], dist: 0.5});
    const m = new Merge().add(cyl(0.045, 0.045, 0.62, 12), {p: [0, -0.03, 0], r: [0, 0, Math.PI / 2], c: G});
    for (const x of [-0.22, -0.08, 0.08, 0.22]) m.add(cyl(0.06, 0.06, 0.03, 14), {p: [x, -0.03, 0], r: [0, 0, Math.PI / 2], c: COL.steel});
    solid(b, m);
  }
  segs(N.pelvis, 'spine-low', 'SPINE RING', [0, 0.07, -0.04], 2, 0.08, 0.075, ['waist', 'spine']);
  segs(N.chest, 'spine-up', 'SPINE RING', [0, 0.06, -0.03], 4, 0.08, 0.07, ['waist', 'spine']);
  cable(N.pelvis, 'cable-waist', 'WAIST POWER CABLE', [[0.05, 0.0, 0.07], [0.07, 0.12, 0.06], [0.03, 0.26, 0.03], [0.02, 0.4, 0.0]], ['waist'], {n: 5, r: 0.012, out: [0.3, 0.2, 1], dist: 0.5});
  cable(N.pelvis, 'cable-waist-2', 'WAIST SIDE CABLE', [[-0.05, 0.0, 0.07], [-0.08, 0.14, 0.05], [-0.04, 0.27, 0.02], [-0.02, 0.4, -0.01]], ['waist'], {n: 3, r: 0.012, out: [-0.3, 0.2, 1], dist: 0.5});
  {
    const p = frame(N.chest, 'chest-frame', 'CHEST FRAME', ['torso'], {out: [0, 0.2, -1], dist: 0.6});
    const sh = poly([[-0.04, 0.12], [0.04, 0.12], [0.16, 0.36], [0.2, 0.47], [-0.2, 0.47], [-0.16, 0.36]]);
    const m = new Merge().add(ext(sh, 0.12, 0.01), {p: [0, 0, -0.1], c: G}).add(box(0.9, 0.03, 0.08, 0.008), {p: [0, 0.47, -0.1], c: COL.steel});
    for (const y of [0.22, 0.32, 0.42]) m.add(box(0.06 + y * 0.5, 0.01, 0.13, 0.003), {p: [0, y, -0.1], c: COL.dark});
    solid(p, m);
    const bk = frame(N.chest, 'back-frame', 'BACK FRAME', ['torso'], {out: [0, 0.2, -1], dist: 0.85});
    const mb = new Merge().add(box(0.24, 0.32, 0.03, 0.01), {p: [0, 0.32, -0.18], c: G});
    for (const y of [0.22, 0.32, 0.42]) mb.add(box(0.2, 0.01, 0.01, 0.003), {p: [0, y, -0.2], c: COL.orange});
    solid(bk, mb);
  }
  // ---------------------------------------------------------------- reactor: just behind the painted core in the chest
  {
    const T = ['reactor'];
    const c = [-0.015, 2.9 - W, 0.06];
    const h = mkPart(N.chest, 'reactor-housing', 'REACTOR HOUSING', 'reactor', {tags: T, pos: c, out: [0, 0, 1], dist: 0.7, stage: 2});
    const m = new Merge().add(annulus(0.16, 0.095, 0.09).rotateZ(Math.PI / 8), {c: G});
    for (const a of ring(8, 0, (t) => t)) m.add(cyl(0.01, 0.01, 0.014, 8), {p: [Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.05], r: [Math.PI / 2, 0, 0], c: COL.chrome});
    m.add(annulus(0.1, 0.088, 0.11), {c: COL.orange});
    solid(h, m);
    const v = mkPart(N.chest, 'reactor-vents', 'REACTOR VENT SLATS', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.002], out: [0, 0.3, 1], dist: 0.95, stage: 2});
    const mv = new Merge();
    for (const a of ring(24, 0, (t) => t)) mv.add(box(0.036, 0.009, 0.022, 0.003), {p: [Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0.06], r: [0, 0, a], c: Math.round((a / (2 * Math.PI)) * 24) % 2 ? COL.steel : COL.dark});
    solid(v, mv);
    const core = mkPart(N.chest, 'reactor-core', 'REACTOR CORE', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.012], out: [0, 0, 1], dist: 0.35, stage: 2});
    addMesh(core, new THREE.TorusGeometry(0.07, 0.024, 12, 28), 'glow', {args: [COL.orange, 0.9]});
    const gl = mkPart(N.chest, 'reactor-glow', 'REACTOR PLASMA', 'reactor', {tags: T, pos: [c[0], c[1], c[2] + 0.016], out: [0, 0, 1], dist: 0.15, stage: 2});
    addMesh(gl, new THREE.SphereGeometry(0.05, 18, 12), 'glow', {args: ['#ffc15a', 0.95], shadow: false});
    for (const [s, sx] of L2) {
      const p = mkPart(N.chest, 'coolant-' + s, s + ' COOLANT PIPE', 'reactor', {tags: T, out: [sx, 0.4, 0.2], dist: 0.55, stage: 2});
      const curve = new THREE.CatmullRomCurve3([new V3(sx * 0.14, c[1] - 0.04, 0.05), new V3(sx * 0.2, c[1] - 0.12, 0.0), new V3(sx * 0.3, c[1] - 0.05, -0.06), new V3(sx * 0.4, c[1] + 0.12, -0.08)]);
      const mm = new Merge().add(new THREE.TubeGeometry(curve, 20, 0.014, 8), {c: COL.orange});
      for (const t of [0.05, 0.95]) mm.add(cyl(0.024, 0.024, 0.03, 10), {p: curve.getPointAt(t).toArray(), q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), curve.getTangentAt(t)), c: COL.chrome});
      solid(p, mm);
    }
  }
  // ---------------------------------------------------------------- neck and head
  segs(N.chest, 'neck-ring', 'NECK RING', [0, REST.neck[1] - W - 0.1, 0.0], 2, 0.05, 0.05, ['head', 'neck']);
  cable(N.chest, 'cable-neck', 'NECK POWER CABLE', [[0.0, 0.36, 0.05], [0.03, 0.46, 0.05], [-0.01, 0.56, 0.03], [0, REST.neck[1] - W + 0.02, 0.02]], ['head', 'neck'], {n: 5, out: [0, 0.3, 1], dist: 0.55});
  {
    const k = frame(N.head, 'skull', 'SKULL FRAME', ['head'], {out: [0, 0.3, -1], dist: 0.4});
    solid(k, new Merge().add(box(0.12, 0.16, 0.16, 0.02), {p: [0, 0.14, 0], c: G}).add(cyl(0.04, 0.04, 0.05, 12), {p: [0, 0.03, 0], r: [0, 0, Math.PI / 2], c: COL.steel}).add(box(0.1, 0.02, 0.03, 0.004), {p: [0, 0.17, 0.08], c: COL.orange}));
  }
  // ---------------------------------------------------------------- arms: bones, elbow pistons, cables
  for (const [s, sx] of L2) {
    const T = ['arm' + s, s === 'R' ? 'blade' : 'shield'];
    const up = LEN['upper' + s];
    const fo = LEN['fore' + s];
    bone(N['sh' + s], 'upper-bone-' + s, s + ' UPPER ARM BONE', [0, -0.08, 0], [0, -up + 0.06, 0], 0.034, 0.028, T, {out: [sx * 0.3, 0, -0.5], dist: 0.35, rib: true});
    bone(N['el' + s], 'fore-bone-' + s, s + ' FOREARM BONE', [0, -0.06, 0], [0, -fo + 0.04, 0], 0.032, 0.026, T, {out: [sx * 0.3, 0, -0.5], dist: 0.35, rib: true});
    cable(N['sh' + s], 'cable-el-' + s, s + ' ELBOW CABLE', [[-sx * 0.03, -0.08, 0.05], [-sx * 0.03, -0.25, 0.06], [0, -0.4, 0.05], [0, -up + 0.02, 0.03]], T, {out: [0, 0, 1], dist: 0.5});
    cable(N.chest, 'cable-sh-' + s, s + ' SHOULDER CABLE', [[sx * 0.08, 0.3, 0.06], [sx * 0.2, 0.36, 0.05], [sx * 0.34, 0.44, 0.0], [sx * 0.48, 0.46, -0.06]], ['shoulder', 'shoulder' + s], {out: [sx, 0.2, 1], dist: 0.5});
  }
  // ---------------------------------------------------------------- legs: bones, hoses, the digitigrade feet's ground markers
  for (const [s, sx] of L2) {
    const T = ['leg' + s];
    bone(N['thigh' + s], 'thigh-bone-' + s, s + ' THIGH BONE', [0, -0.1, 0], [0, -LEN['thigh' + s] + 0.1, 0], 0.05, 0.04, [...T, 'hip', 'knee'], {out: [0, 0, -1], dist: 0.35, rib: true});
    bone(N['knee' + s], 'shin-bone-' + s, s + ' SHIN BONE', [0, -0.1, 0], [0, -LEN['shin' + s] + 0.08, 0], 0.04, 0.03, [...T, 'knee', 'foot'], {out: [0, 0, -1], dist: 0.35, rib: true});
    bone(N['hock' + s], 'meta-bone-' + s, s + ' METATARSAL BONE', [0, -0.04, 0], [0, -LEN['meta' + s] + 0.04, 0], 0.03, 0.024, [...T, 'foot'], {out: [0, 0, -1], dist: 0.35});
    cable(N['thigh' + s], 'cable-knee-' + s, s + ' KNEE CABLE', [[-sx * 0.07, -0.12, 0.06], [-sx * 0.08, -0.4, 0.07], [-sx * 0.07, -0.62, 0.05], [-sx * 0.04, -LEN['thigh' + s] + 0.03, 0.02]], [...T, 'knee'], {out: [-sx, 0, 0.8], dist: 0.5});
    cable(N['thigh' + s], 'hose-thigh-' + s, s + ' THIGH HOSE', [[sx * 0.08, -0.1, 0.05], [sx * 0.1, -0.34, 0.06], [sx * 0.09, -0.58, 0.05], [sx * 0.06, -LEN['thigh' + s] + 0.05, 0.03]], [...T, 'knee'], {n: 3, r: 0.013, out: [sx, 0, 0.7], dist: 0.55});
    cable(N['knee' + s], 'hose-shin-' + s, s + ' SHIN HOSE', [[sx * 0.07, -0.1, -0.05], [sx * 0.08, -0.35, -0.06], [sx * 0.08, -0.65, -0.05], [sx * 0.06, -LEN['shin' + s] + 0.06, -0.03]], [...T, 'foot'], {n: 3, r: 0.013, out: [sx, 0, -0.7], dist: 0.55});
    // claw tips and heel: what rests on the floor (the foot node keeps its rest attitude, toes forward)
    for (const q of [[sx * 0.03, -0.12, 0.3], [-sx * 0.06, -0.12, 0.26], [0, -0.12, -0.14]]) {
      const mk = new THREE.Object3D();
      mk.position.set(...q);
      N['foot' + s].add(mk);
      feet.push(mk);
    }
  }
  // ---------------------------------------------------------------- hydraulics: the cylinder sits on one link and aims at its
  // rod mount on the next; the rod length is the real distance between mounts every frame (mech.js setPose)
  const actuator = (id, name, parentA, a, b, tags, nodeB, sx) => {
    const p = mkPart(parentA, id, name, 'hydraulic', {tags, pos: a, out: [-sx * 0.8, 0, 0.5], dist: 0.45, stage: 2});
    const m = new Merge().add(cyl(ACT.bore * 0.68, ACT.bore * 0.68, 0.22, 14), {p: [0, 0.12, 0], c: G}).add(cyl(0.04, 0.04, 0.02, 14), {p: [0, 0.01, 0], c: COL.steel}).add(cyl(0.04, 0.04, 0.02, 14), {p: [0, 0.23, 0], c: COL.steel});
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
  for (const [s, sx] of L2) {
    const T = ['leg' + s];
    // knee: cylinder down the back of the thigh, rod to the back of the shin; hock: down the front of the shin
    actuator('act-knee-' + s, s + ' KNEE ACTUATOR', N['thigh' + s], [-sx * 0.06, -LEN['thigh' + s] + LEG.kA + 0.12, -0.09], [-sx * 0.06, -LEG.kB, -0.08], [...T, 'knee'], N['knee' + s], sx);
    actuator('act-hock-' + s, s + ' HOCK ACTUATOR', N['knee' + s], [-sx * 0.05, -LEN['shin' + s] + LEG.hA + 0.14, 0.07], [-sx * 0.05, -LEG.hB, 0.07], [...T, 'foot'], N['hock' + s], sx);
    actuator('act-arm-' + s, s + ' ARM PISTON', N['sh' + s], [sx * 0.06, -LEN['upper' + s] + ARM.a + 0.06, 0.04], [sx * 0.06, -ARM.b, 0.04], ['arm' + s, s === 'R' ? 'blade' : 'shield'], N['el' + s], sx);
  }

  // ---------------------------------------------------------------- shield: an elongated hexagon folded along its long axis,
  // white wings, a graphite spine, two orange stripes, on a rotary drum with an orange ring and a boom from the shoulder
  {
    const T = ['shield'];
    const S = N.shield;
    const mk = (id, name, pts, o, ry = 0, z = 0) => armor(S, id, name, pts, 0.04, {p: [0, 0, z], r: [0, ry, 0]}, {tags: T, cy: 0.1, dist: 0.9 + 0.3 * hash(id), ...o});
    const k = 0.9;
    const P = (pts) => pts.map(([x, y]) => [x * 0.8 * k, y * k]);
    mk('shield-left', 'SHIELD LEFT WING', P([[-0.07, 0.9], [-0.07, -0.9], [-0.39, -0.55], [-0.39, 0.55]]).reverse(), {trim: 'stripe'}, 9);
    mk('shield-right', 'SHIELD RIGHT WING', P([[0.07, 0.9], [0.39, 0.55], [0.39, -0.55], [0.07, -0.9]]), {trim: 'block'}, -9);
    mk('shield-top', 'SHIELD TOP CAP', P([[0, 1.0], [0.39, 0.55], [0.07, 0.9], [-0.07, 0.9], [-0.39, 0.55]]).reverse(), {trim: 'edge'}, 0, 0.004);
    mk('shield-bottom', 'SHIELD TIP', P([[0, -1.0], [-0.07, -0.9], [-0.39, -0.55], [-0.2, -0.8]]).reverse(), {trim: 'edge'}, 0, 0.004);
    mk('shield-spine', 'SHIELD GRAPHITE SPINE', P([[0, 1.0], [0.07, 0.9], [0.07, -0.9], [0, -1.0], [-0.07, -0.9], [-0.07, 0.9]]), {col: G, trim: 'block'}, 0, 0.03);
    for (const [s, sx] of L2) {
      const st = mkPart(S, 'shield-stripe-' + s, s + ' SHIELD ORANGE STRIPE', 'armor', {tags: T, pos: [sx * 0.15, 0.06, 0.036], out: [sx, 0.2, 1], dist: 1.0, stage: 1});
      st.group.rotation.y = -sx * 9 * D2R;
      addMesh(st, ext(poly([[-0.02, 0.45], [0.02, 0.45], [0.02, -0.27], [-0.02, -0.36]]), 0.012, 0.003), 'glow', {args: [COL.orange, 0.4]});
    }
    const drum = mkPart(S, 'shield-drum', 'SHIELD DRUM', 'frame', {tags: T, pos: [0, 0.5, -0.14], out: [0, 0.3, -1], dist: 0.6, stage: 2});
    const r = 0.17;
    const dm = new Merge().add(cyl(r, r, 0.1, 28), {r: [Math.PI / 2, 0, 0], c: G}).add(new THREE.TorusGeometry(r * 0.86, r * 0.07, 8, 32), {p: [0, 0, -0.05], c: COL.orange}).add(cyl(r * 0.5, r * 0.5, 0.05, 20), {p: [0, 0, -0.07], r: [Math.PI / 2, 0, 0], c: COL.dark});
    for (const a of ring(8, 0, (t) => t)) dm.add(cyl(r * 0.05, r * 0.05, 0.015, 8), {p: [Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, -0.055], r: [Math.PI / 2, 0, 0], c: COL.chrome});
    solid(drum, dm);
    // boom: from the left shoulder to the drum (built in the chest frame, at the shield's rest placement)
    const bm = mkPart(N.chest, 'shield-boom', 'SHIELD BOOM', 'frame', {tags: T, out: [0.5, 0.3, -1], dist: 0.6, stage: 2});
    const a = new V3(REST.shL[0] - 0.05, REST.shL[1] - W + 0.04, -0.16);
    const b = new V3(0.86, 2.62 - W + 0.5, -0.3);
    const sg = between(a, b);
    solid(bm, new Merge().add(cyl(0.045, 0.045, sg.len, 10), {p: sg.p, q: sg.q, c: G}).add(cyl(0.06, 0.06, 0.03, 12), {p: sg.p, q: sg.q, c: COL.steel}));
  }
  // ---------------------------------------------------------------- right hand: emitter housing and the plasma blade, down-forward
  {
    const T = ['armR', 'blade'];
    const BR = 168 * D2R;
    const em = mkPart(N.wristR, 'blade-emitter', 'BLADE EMITTER HOUSING', 'frame', {tags: T, pos: [0, -0.12, 0.05], out: [-0.3, -0.8, 0.5], dist: 0.55, stage: 2});
    em.group.rotation.x = BR;
    solid(em, new Merge().add(cyl(0.05, 0.05, 0.18, 14), {p: [0, 0.09, 0], c: G}).add(cyl(0.058, 0.058, 0.022, 14), {p: [0, 0.18, 0], c: COL.orange}).add(cyl(0.058, 0.058, 0.022, 14), {p: [0, 0.03, 0], c: COL.steel}));
    const bp = mkPart(N.wristR, 'blade', 'PLASMA BLADE', 'armor', {tags: T, pos: [0, -0.12, 0.05], out: [-0.4, -0.6, 0.7], dist: 0.9, stage: 1});
    bp.keep = true;
    bp.group.rotation.x = BR;
    const sh = (w, l, tip) => poly([[-w, 0], [w, 0], [w * 0.72, l - tip], [0, l], [-w * 0.72, l - tip]]);
    addMesh(bp, ext(sh(0.045, 1.25, 0.3), 0.03, 0.006).translate(0, 0.2, 0), 'glow', {args: [COL.orange, 0.85], shadow: false});
    addMesh(bp, ext(sh(0.026, 1.15, 0.28), 0.04, 0.004).translate(0, 0.22, 0), 'glow', {args: ['#ffd68a', 0.95], shadow: false});
  }
}
