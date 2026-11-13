// Hands and feet, built from code in place of the mould's mittens: a talon hand on the left, a gauntlet fist closed round
// the blade emitter on the right, and on each foot three toes and a rear spur that stand on their talon tips (the tips sit
// on the floor markers in inner.js, y = -0.12 in the foot's frame). Every finger joint and plate is a part of its own:
// white plates come off with the armor, the joints and talons with the frame.
import * as THREE from 'three';

const V3 = THREE.Vector3;

export function claws(C) {
  const {N, COL, mkPart, addMesh, solid, Merge, box, cyl, between} = C;
  const added = [];
  const UP = new V3(0, 1, 0);
  const sphere = (r) => new THREE.SphereGeometry(r, 10, 8);
  // a hand or foot is drawn at a working size and scaled up to the body in one group on its joint
  const sub = (n, f) => {
    const g = new THREE.Group();
    g.scale.setScalar(f);
    n.add(g);
    return g;
  };
  // a chain of segments from root along d0, each turned further about axis k by its bend (degrees); returns the joints
  // and, per segment, its direction and the side facing away from the bend
  const chain = (root, d0, k, lens, bends, back0) => {
    const pts = [root.clone()];
    const dirs = [];
    const backs = [];
    let ang = 0;
    lens.forEach((l, i) => {
      ang += bends[i];
      const q = new THREE.Quaternion().setFromAxisAngle(k, (ang * Math.PI) / 180);
      dirs.push(d0.clone().applyQuaternion(q));
      backs.push(back0.clone().applyQuaternion(q));
      pts.push(pts[i].clone().addScaledVector(dirs[i], l));
    });
    return {pts, dirs, backs};
  };
  const part = (node, id, name, kind, tags, out, dist) => {
    const p = mkPart(node, id, name, kind, {tags, out: out.toArray(), dist, stage: kind === 'armor' ? 1 : 2});
    added.push(p);
    return p;
  };
  // one segment: a rounded bar from a to b with a steel knuckle at a; a talon instead ends in a point with an orange ring
  const bar = (m, a, b, w, d, c = COL.graphite) => {
    const s = between(a, b);
    m.add(box(w, s.len, d, 0.008), {p: s.p, q: s.q, c});
    return m;
  };
  const segment = (node, id, name, tags, a, b, w, d, {talon = false, out}) => {
    const p = part(node, id, name, 'frame', tags, out ?? b.clone().sub(a).normalize(), 0.18);
    const m = new Merge().add(sphere(Math.max(w, d) * 0.55), {p: a.toArray(), c: COL.steel});
    if (talon) {
      const s = between(a, b);
      m.add(cyl(w * 0.5, 0.0015, s.len, 10), {p: s.p, q: s.q, c: COL.ink});
      m.add(new THREE.TorusGeometry(w * 0.5, 0.004, 6, 14), {p: a.clone().lerp(b, 0.12).toArray(), q: s.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2)), c: COL.orange});
    } else bar(m, a, b, w, d);
    solid(p, m);
    return p;
  };
  // a white plate over a segment, on its back
  const plate = (node, id, name, tags, a, b, back, w, t, off) => {
    const p = part(node, id, name, 'armor', tags, back, 0.32);
    const s = between(a.clone().addScaledVector(back, off), b.clone().addScaledVector(back, off));
    // the plate's thin side faces `back`: turn the bar about its length so its local z (depth) lines up with back
    const z = new V3(0, 0, 1).applyQuaternion(s.q);
    const dir = b.clone().sub(a).normalize();
    const want = back.clone().addScaledVector(dir, -back.dot(dir)).normalize();
    const twist = new THREE.Quaternion().setFromUnitVectors(z, want);
    const m = new Merge().add(box(w, s.len * 0.92, t, 0.004), {p: s.p, q: twist.multiply(s.q), c: COL.white});
    addMesh(p, m.build(), 'armor');
    return p;
  };

  // ---------------------------------------------------------------- left: the claw hand (node -y runs down the hand,
  // +x is outward, the palm faces in)
  {
    const node = sub(N.wristL, 1.4);
    const T = ['armL', 'shield'];
    const core = part(node, 'hand-palm-L', 'L PALM BLOCK', 'frame', T, new V3(-0.3, -1, 0.2), 0.25);
    solid(core, new Merge().add(box(0.06, 0.15, 0.12, 0.012), {p: [0, -0.085, 0]}).add(cyl(0.035, 0.035, 0.11, 12), {p: [0, -0.012, 0], r: [Math.PI / 2, 0, 0], c: COL.steel}));
    const bp = part(node, 'hand-back-L', 'L CLAW HAND BACK PLATE', 'armor', T, new V3(1, -0.2, 0), 0.35);
    addMesh(bp, new Merge().add(box(0.016, 0.13, 0.115, 0.006), {p: [0.037, -0.088, 0], c: COL.white}).add(box(0.018, 0.04, 0.012, 0.003), {p: [0.039, -0.06, 0.035], c: COL.orange}).build(), 'armor');
    const K = new V3(0, 0, 1); // fingers curl about z, toward the palm (-x)
    ['INDEX', 'MIDDLE', 'RING', 'SMALL'].forEach((f, i) => {
      const z = 0.045 - i * 0.03;
      const d0 = new V3(0, -1, z * 1.2).normalize();
      const c = chain(new V3(0, -0.16, z), d0, K, [0.075, 0.058, 0.062], [-8, -22, -30], new V3(1, 0, 0));
      const n = `L ${f} FINGER`;
      segment(node, `claw-L-${i + 1}-1`, `${n} · PROXIMAL`, T, c.pts[0], c.pts[1], 0.03, 0.026, {});
      plate(node, `claw-L-${i + 1}-plate`, `${n} · KNUCKLE PLATE`, T, c.pts[0], c.pts[1], c.backs[0], 0.032, 0.008, 0.017);
      segment(node, `claw-L-${i + 1}-2`, `${n} · MIDDLE`, T, c.pts[1], c.pts[2], 0.027, 0.024, {});
      segment(node, `claw-L-${i + 1}-3`, `${n} · TALON`, T, c.pts[2], c.pts[3], 0.024, 0.024, {talon: true});
    });
    // the thumb: forward of the fingers, opposed, curling in toward the palm
    const tc = chain(new V3(-0.012, -0.08, 0.06), new V3(0, -0.8, 0.6), new V3(0, 0.6, 0.8), [0.06, 0.055], [-20, -35], new V3(1, 0, 0));
    segment(node, 'claw-L-thumb-1', 'L THUMB · PROXIMAL', T, tc.pts[0], tc.pts[1], 0.032, 0.028, {});
    segment(node, 'claw-L-thumb-2', 'L THUMB · TALON', T, tc.pts[1], tc.pts[2], 0.026, 0.026, {talon: true});
  }

  // ---------------------------------------------------------------- right: the gauntlet, closed round the blade emitter
  // (the emitter runs from (0,-0.12,0.05) along its axis a; fingers wrap round a from the back of the hand, outward -x)
  {
    const node = N.wristR;
    const T = ['armR', 'blade'];
    const E0 = new V3(0, -0.12, 0.05);
    const A = new V3(0, Math.cos((168 * Math.PI) / 180), Math.sin((168 * Math.PI) / 180));
    const e1 = new V3(1, 0, 0);
    const e2 = new V3().crossVectors(e1, A).negate();
    const RR = 0.09;
    const around = (s, deg) => E0.clone().addScaledVector(A, s).addScaledVector(e1, RR * Math.cos((deg * Math.PI) / 180)).addScaledVector(e2, RR * Math.sin((deg * Math.PI) / 180));
    const core = part(node, 'hand-palm-R', 'R PALM BLOCK', 'frame', T, new V3(-1, -0.4, 0), 0.25);
    const qa = new THREE.Quaternion().setFromUnitVectors(UP, A);
    solid(core, new Merge().add(box(0.12, 0.2, 0.15, 0.014), {p: [-0.045, -0.085, 0.03]}).add(box(0.036, 0.22, 0.13, 0.008), {p: E0.clone().addScaledVector(A, 0.09).addScaledVector(e1, -0.088).toArray(), q: qa}));
    const bp = part(node, 'hand-back-R', 'R GAUNTLET BACK PLATE', 'armor', T, new V3(-1, 0, 0.2), 0.35);
    addMesh(bp, new Merge().add(box(0.018, 0.28, 0.15, 0.006), {p: E0.clone().addScaledVector(A, 0.05).addScaledVector(e1, -0.115).toArray(), q: qa, c: COL.white}).add(box(0.02, 0.07, 0.016, 0.003), {p: E0.clone().addScaledVector(A, -0.02).addScaledVector(e1, -0.117).addScaledVector(e2, 0.05).toArray(), q: qa, c: COL.orange}).build(), 'armor');
    ['INDEX', 'MIDDLE', 'RING', 'SMALL'].forEach((f, i) => {
      const s = 0.03 + i * 0.046;
      const P = [175, 115, 50, -10].map((d) => around(s, d));
      const n = `R ${f} FINGER`;
      ['PROXIMAL', 'MIDDLE', 'TIP'].forEach((k, j) => segment(node, `claw-R-${i + 1}-${j + 1}`, `${n} · ${k}`, T, P[j], P[j + 1], 0.04, 0.044, {out: P[j + 1].clone().sub(E0).setComponent(1, -0.3).normalize()}));
      plate(node, `claw-R-${i + 1}-plate`, `${n} · KNUCKLE PLATE`, T, P[0], P[1], P[0].clone().add(P[1]).multiplyScalar(0.5).sub(E0.clone().addScaledVector(A, s)).normalize(), 0.044, 0.009, 0.025);
    });
    const P = [10, 70, 130].map((d) => around(-0.012, d));
    segment(node, 'claw-R-thumb-1', 'R THUMB · PROXIMAL', T, P[0], P[1], 0.044, 0.04, {out: new V3(1, 0.2, 0.5)});
    segment(node, 'claw-R-thumb-2', 'R THUMB · TIP', T, P[1], P[2], 0.04, 0.04, {out: new V3(0.4, 0.2, 1)});
  }

  // ---------------------------------------------------------------- feet: the node keeps its rest attitude to the ground
  // (+z forward, +y up); toes reach forward and down onto their talon tips at y = -0.12, the spur back onto the heel
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const F = 1.5;
    const node = sub(N['foot' + s], F);
    const T = ['leg' + s, 'foot'];
    const core = part(node, `foot-base-${s}`, `${s} TARSAL BLOCK`, 'frame', T, new V3(sx * 0.5, -0.3, 0.3), 0.25);
    solid(core, new Merge().add(box(0.12, 0.08, 0.16, 0.014), {p: [0, -0.03, 0.03]}).add(cyl(0.045, 0.045, 0.13, 14), {p: [0, 0, 0], r: [0, 0, Math.PI / 2], c: COL.steel}).add(cyl(0.025, 0.025, 0.135, 10), {p: [0, 0, 0], r: [0, 0, Math.PI / 2], c: COL.orange}));
    const gp = part(node, `foot-guard-${s}`, `${s} ANKLE GUARD`, 'armor', T, new V3(0, 1, 0.6), 0.4);
    addMesh(gp, new Merge().add(box(0.13, 0.026, 0.16, 0.008), {p: [0, 0.022, 0.07], r: [0.22, 0, 0], c: COL.white}).add(box(0.03, 0.028, 0.05, 0.004), {p: [sx * 0.035, 0.024, 0.11], r: [0.22, 0, 0], c: COL.orange}).build(), 'armor');
    // three toes: outer, middle, inner, splayed; bends chosen so each talon tip lands on y = -0.12
    [['OUTER', 24, 0.045], ['MIDDLE', 0, 0], ['INNER', -20, -0.045]].forEach(([name, yaw, x], i) => {
      const ps = (sx * yaw * Math.PI) / 180;
      const d0 = new V3(Math.sin(ps), 0, Math.cos(ps));
      const k = new V3().crossVectors(UP, d0).normalize();
      const L = i === 1 ? [0.1, 0.075, 0.07] : [0.085, 0.065, 0.065];
      const c = chain(new V3(sx * x, 0, 0.09), d0, k, L, [8, 14, 33], UP);
      const drop = -0.12 / F - c.pts[3].y;
      for (const p of c.pts) p.y += drop;
      const n = `${s} ${name} TOE`;
      segment(node, `toe-${s}-${i + 1}-1`, `${n} · PROXIMAL`, T, c.pts[0], c.pts[1], 0.044, 0.038, {out: d0});
      plate(node, `toe-${s}-${i + 1}-plate`, `${n} · PLATE`, T, c.pts[0], c.pts[1], c.backs[0], 0.05, 0.01, 0.024);
      segment(node, `toe-${s}-${i + 1}-2`, `${n} · MIDDLE`, T, c.pts[1], c.pts[2], 0.038, 0.034, {out: d0});
      segment(node, `toe-${s}-${i + 1}-3`, `${n} · TALON`, T, c.pts[2], c.pts[3], 0.036, 0.036, {talon: true, out: d0});
    });
    const c = chain(new V3(0, 0, -0.04), new V3(0, 0, -1), new V3().crossVectors(UP, new V3(0, 0, -1)), [0.06, 0.065], [25, 35], UP);
    const drop = -0.12 / F - c.pts[2].y;
    for (const p of c.pts) p.y += drop;
    segment(node, `spur-${s}-1`, `${s} HEEL SPUR`, T, c.pts[0], c.pts[1], 0.042, 0.038, {out: new V3(0, -0.2, -1)});
    segment(node, `spur-${s}-2`, `${s} HEEL SPUR · TALON`, T, c.pts[1], c.pts[2], 0.034, 0.034, {talon: true, out: new V3(0, -0.2, -1)});
  }
  return added;
}
