// The armor, built in code. tools/shell/split.py measures the painted shell made from the reference (Hunyuan3D shape
// + paint, local) into a mould: for each body segment, its radius and paint colour round the bone on a 1 cm x 2.5 deg
// grid. Here every plate is generated from that mould: a curved panel of its own, cut on straight panel lines (bands
// across the bone, sectors round it), meeting its neighbours on a hairline seam, with a soft rim, a dark edge for its
// thickness and light lines where the design has orange. The head gets a lit visor and fins. Each plate rides its
// joint node, lifts off its surface on EXPLODE and pulls out on a click.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import MOLD from './assets/vx7-mold.json';
import {claws} from './claws.js';

const V3 = THREE.Vector3;
const GAP = 0; // m: plates meet edge to edge; a seam only shows once one comes off
const THICK = 0.022; // m: plate thickness (deep enough to stand over the sunken mechanics beside it)
const CHAMFER = 0; // m: no rim, so the assembled armor reads as one smooth shell
const LIFT = 0.01; // m: the shell sits this far out from the mould, so no inner part pokes through it
const MLIFT = -0.006; // m: exposed mechanics sit this far in, under the armor's edge
const RIB = 0.004; // m: depth of the ribs on an exposed actuator sleeve
const SMOOTH = 4; // blur passes over the mould (each about 1 cm along the bone and 2.5 degrees round it)
const DARK = [0.09, 0.095, 0.105];
const FIN = {white: [0.86, 0.865, 0.85], steel: [0.5, 0.52, 0.55], graphite: [0.17, 0.18, 0.2], orange: [0.95, 0.47, 0.12]};

// segment -> joint node, isolate tags, name, plate layout (bands along the bone, sectors round it), explode bias
function segments(N) {
  const S = {
    pelvis: {node: N.pelvis, tags: ['hip'], name: 'PELVIS', bands: 2, secs: 6, out: [0, -0.3, 1]},
    torso: {node: N.chest, tags: ['torso'], name: 'CHEST', bands: 5, secs: 8, out: [0, 0.25, 1]},
    head: {node: N.head, tags: ['head'], name: 'HELMET', bands: 3, secs: 6, out: [0, 1, 0.3]},
  };
  for (const s of ['L', 'R']) {
    const arm = ['arm' + s, s === 'R' ? 'blade' : 'shield'];
    const leg = ['leg' + s];
    Object.assign(S, {
      ['upper' + s]: {node: N['sh' + s], tags: [...arm, 'shoulder', 'shoulder' + s], name: s + ' SHOULDER', bands: 4, secs: 6},
      ['fore' + s]: {node: N['el' + s], tags: arm, name: s + ' FOREARM', bands: 4, secs: 6},
      ['thigh' + s]: {node: N['thigh' + s], tags: [...leg, 'hip'], name: s + ' THIGH', bands: 5, secs: 6},
      ['shin' + s]: {node: N['knee' + s], tags: [...leg, 'knee'], name: s + ' SHIN', bands: 5, secs: 6},
      ['meta' + s]: {node: N['hock' + s], tags: [...leg, 'foot'], name: s + ' ANKLE', bands: 3, secs: 4},
    });
  }
  return S;
}

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
// the mould, made whole: rows the shell barely covers (past a joint cut) are dropped, and every hole left inside (an
// arm opening, a ray that missed) is filled from its nearest measured neighbours round the bone, then along it, so
// each plate is a complete panel with straight edges
function fillMould(g) {
  const {nt, nth, r, c} = g;
  const cover = (i) => r.subarray(i * nth, (i + 1) * nth).reduce((n, v) => n + (v > 0), 0) / nth;
  let lo = 0;
  let hi = nt - 1;
  while (lo < hi && cover(lo) < 0.6) lo++;
  while (hi > lo && cover(hi) < 0.6) hi--;
  const n2 = hi - lo + 1;
  const R2 = new Uint16Array(n2 * nth);
  const C2 = new Uint8Array(n2 * nth * 3);
  for (let i = 0; i < n2; i++) {
    for (let j = 0; j < nth; j++) {
      R2[i * nth + j] = r[(i + lo) * nth + j];
      for (let k = 0; k < 3; k++) C2[(i * nth + j) * 3 + k] = c[((i + lo) * nth + j) * 3 + k];
    }
  }
  const take = (dst, src) => {
    R2[dst] = R2[src];
    for (let k = 0; k < 3; k++) C2[dst * 3 + k] = C2[src * 3 + k];
  };
  // round the bone: each empty sample takes the nearer measured one in its row (blending the two radii)
  for (let i = 0; i < n2; i++) {
    const row = R2.slice(i * nth, (i + 1) * nth);
    if (!row.some((v) => v)) continue;
    for (let j = 0; j < nth; j++) {
      if (row[j]) continue;
      let a = 1;
      let b = 1;
      while (!row[(j - a + nth) % nth]) a++;
      while (!row[(j + b) % nth]) b++;
      const ja = (j - a + nth) % nth;
      const jb = (j + b) % nth;
      take(i * nth + j, i * nth + (a <= b ? ja : jb));
      R2[i * nth + j] = Math.round((row[ja] * b + row[jb] * a) / (a + b));
    }
  }
  // along the bone: an empty row takes the nearest full one
  for (let i = 0; i < n2; i++) {
    if (R2[i * nth]) continue;
    let d = 1;
    while (!(i - d >= 0 && R2[(i - d) * nth]) && !(i + d < n2 && R2[(i + d) * nth])) d++;
    const src = i - d >= 0 && R2[(i - d) * nth] ? i - d : i + d;
    for (let j = 0; j < nth; j++) take(i * nth + j, src * nth + j);
  }
  return {...g, t0: g.t0 + lo * g.dt, nt: n2, r: R2, c: C2};
}
// the mould, smoothed: a sample more than 2 cm off the median of its neighbours (a ray that grazed an edge) takes the median
function smoothR(r, nt, nth) {
  const out = r.slice();
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < nth; j++) {
      if (!r[i * nth + j]) continue;
      const nb = [];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const ii = i + di;
        const v = ii >= 0 && ii < nt ? r[ii * nth + ((j + dj + nth) % nth)] : 0;
        if (v) nb.push(v);
      }
      nb.sort((x, y) => x - y);
      const med = nb[nb.length >> 1];
      if (Math.abs(r[i * nth + j] - med) > 20) out[i * nth + j] = med;
    }
  }
  // then blurred (over the samples that hit, so holes stay holes): the mould keeps the big form of the shell and drops
  // its embossed relief, which on a clean plate reads like the insides showing through
  const w = [1, 4, 6, 4, 1];
  let cur = Float32Array.from(out);
  for (let pass = 0; pass < SMOOTH; pass++) {
    const nxt = new Float32Array(cur.length);
    for (let i = 0; i < nt; i++) {
      for (let j = 0; j < nth; j++) {
        if (!out[i * nth + j]) continue;
        let sum = 0;
        let wt = 0;
        for (let d = -2; d <= 2; d++) {
          const a1 = cur[i * nth + ((j + d + nth) % nth)];
          if (a1) (sum += w[d + 2] * a1), (wt += w[d + 2]);
          const ii = i + d;
          const a2 = ii >= 0 && ii < nt ? cur[ii * nth + j] : 0;
          if (a2) (sum += w[d + 2] * a2), (wt += w[d + 2]);
        }
        nxt[i * nth + j] = sum / wt;
      }
    }
    cur = nxt;
  }
  return Uint16Array.from(cur, (x) => Math.round(x));
}
// a material per plate (so each can ghost on its own); a back face reads as the dark inside of a hollow plate
// Drawn on each plate from its own coordinates (pl: metres along the bone and round it, and the plate's size; mk: kind
// and a seed): an armor plate gets an engraved groove round its edge, an inset line and one detail of its own (a vent,
// a dark hatch, an orange tab, a split line, hazard chevrons or a stencil mark); an exposed sleeve is graphite with
// seams round it and, on some, an orange cable.
const DETAIL = `
varying vec4 vPl;
varying vec2 vMk;
float box(vec2 p, vec2 c, vec2 h, vec2 fw) { vec2 q = h - abs(p - c); return clamp(min(q.x / fw.x, q.y / fw.y) + 0.5, 0.0, 1.0); }
float ln(float x, float w, float fw) { return 1.0 - smoothstep(w, w + fw, abs(x)); }
void plateDetail(inout vec3 c) {
  vec2 p = vPl.xy;
  vec2 hw = vPl.zw;
  vec2 fw = max(fwidth(p), vec2(1e-5));
  float d = min(min(p.x, hw.x - p.x), min(p.y, hw.y - p.y));
  float f = max(fwidth(d), 1e-5);
  vec3 dark = vec3(0.07, 0.075, 0.085);
  vec3 orange = vec3(0.93, 0.45, 0.1);
  if (vMk.x > 0.5) {
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    c = vec3(0.075, 0.08, 0.09) * (0.8 + 0.5 * l);
    float y = p.y - hw.y * 0.5;
    if (vMk.y < 0.4) c = mix(c, orange * 0.8, ln(y, 0.005, fw.y)); // a cable
    else if (vMk.y < 0.8) for (int i = -1; i <= 1; i += 2) { // two piston rods: bright steel with a dark core line
      float r = y - float(i) * min(0.02, hw.y * 0.25);
      c = mix(c, vec3(0.55, 0.57, 0.6) * (1.0 - 0.6 * ln(r, 0.0012, fw.y)), ln(r, 0.0045, fw.y));
    }
    c *= 1.0 - 0.7 * ln(d, 0.002, f);
    return;
  }
  // the design's dark smears on a plate become a light grey second tone: the dark parts are the open mechanics now
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(c, vec3(0.5, 0.51, 0.53) + 0.4 * c, (1.0 - smoothstep(0.15, 0.45, l)) * (1.0 - smoothstep(0.1, 0.3, sat)));
  float k = vMk.y;
  bool big = min(hw.x, hw.y) > 0.09;
  if (big && k < 0.2) {
    vec2 vc = vec2(hw.x * 0.6, hw.y * 0.5);
    float v = box(p, vc, vec2(0.024, 0.03), fw);
    float slat = smoothstep(0.35, 0.65, abs(fract(p.x / 0.008) - 0.5) * 2.0);
    c = mix(c, mix(dark, vec3(0.32, 0.33, 0.35), slat), v);
  } else if (big && k < 0.4) {
    vec2 hc = vec2(0.06, hw.y - 0.07);
    c = mix(c, vec3(0.16, 0.165, 0.18), box(p, hc, vec2(0.026, 0.035), fw));
    c = mix(c, orange, box(p, hc + vec2(-0.012, 0.018), vec2(0.004, 0.008), fw));
  } else if (k < 0.55) {
    c = mix(c, orange, box(p, vec2(0.05, 0.045), vec2(0.016, 0.006), fw));
  } else if (k < 0.75) {
    c *= 1.0 - 0.75 * ln(p.x - hw.x * 0.5, 0.0012, fw.x) * step(0.03, d);
  } else if (big && k < 0.88) {
    float b = box(p, vec2(hw.x - 0.05, hw.y * 0.5), vec2(0.009, min(0.05, hw.y * 0.25)), fw);
    c = mix(c, step(0.5, fract((p.x + p.y) / 0.016)) > 0.5 ? orange : dark, b);
  } else if (big) {
    for (int i = 0; i < 4; i++) c = mix(c, dark, box(p, vec2(0.05, 0.04 + 0.009 * float(i)), vec2(0.007 - 0.002 * float(i % 2), 0.0028), fw));
  }
  if (big) c *= 1.0 - 0.6 * ln(d - 0.022, 0.0009, f);
  c *= 1.0 - 0.8 * ln(d, 0.0025, f);
}`;
const plateMat = (map = null) => {
  const m = new THREE.MeshStandardMaterial({map, vertexColors: true, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.55, side: THREE.DoubleSide, shadowSide: THREE.BackSide, transparent: true});
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nattribute vec4 pl;\nattribute vec2 mk;\nvarying float vGlow;\nvarying vec4 vPl;\nvarying vec2 vMk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvPl = pl;\nvMk = mk;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;' + DETAIL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.09, 0.095, 0.105);\n\telse if (vPl.z > 0.0) plateDetail(diffuseColor.rgb);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix(roughnessFactor, 0.34, vMk.x);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix(metalnessFactor, 0.65, vMk.x);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.8;');
  };
  m.customProgramCacheKey = () => (map ? 'vx7-plate-paint' : 'vx7-plate');
  return m;
};

// one plate: rows i0..i1 along the bone, columns j0..j1 round it (wrapping), from the mould grid g
function plateGeo(g, i0, i1, j0, j1, look, {hole = null} = {}) {
  const lift = look.mech ? MLIFT : LIFT;
  const {a, u, f, l, t0, dt, nt, nth, r} = g;
  const nr = i1 - i0 + 1;
  const nc = j1 - j0 + 1;
  const P = (t, th, rad) => [a[0] + t * u[0] + rad * (Math.cos(th) * f[0] + Math.sin(th) * l[0]), a[1] + t * u[1] + rad * (Math.cos(th) * f[1] + Math.sin(th) * l[1]), a[2] + t * u[2] + rad * (Math.cos(th) * f[2] + Math.sin(th) * l[2])];
  // radius at a fractional sample (bilinear), so a hole's edge can be tested between samples
  const R = (i, j) => {
    const i_ = Math.floor(i);
    const j_ = Math.floor(j);
    const fi = i - i_;
    const fj = j - j_;
    const at_ = (ii, jj) => r[Math.min(ii, nt - 1) * nth + (((jj % nth) + nth) % nth)] / 1000;
    return fi || fj ? at_(i_, j_) * (1 - fi) * (1 - fj) + at_(i_ + 1, j_) * fi * (1 - fj) + at_(i_, j_ + 1) * (1 - fi) * fj + at_(i_ + 1, j_ + 1) * fi * fj : at_(i_, j_);
  };
  const ok = (i, j) => R(i, j) > 0;
  // the window is a round hole seen from the front: distance across, not in depth, and only on the front of the chest
  const outside = (i, j) => {
    if (!hole) return true;
    const x = P(t0 + i * dt, (j * 2 * Math.PI) / nth, R(i, j));
    return x[2] < hole.c.z || Math.hypot(x[0] - hole.c.x, x[1] - hole.c.y) > hole.r;
  };
  const quad = (qi, qj) => ok(i0 + qi, j0 + qj) && ok(i0 + qi + 1, j0 + qj) && ok(i0 + qi, j0 + qj + 1) && ok(i0 + qi + 1, j0 + qj + 1) && outside(i0 + qi + 0.5, j0 + qj + 0.5);
  const pos = [];
  const col = [];
  const glow = [];
  const uvs = [];
  const pl = [];
  const idx = [];
  const H = (i1 - i0) * dt;
  const dth = (2 * Math.PI) / nth;
  // where a point (height t, angle th) falls in the paint atlas
  const T = g.tex;
  const UV = (t, th) => [(T.x + ((th - T.th0) / (T.th1 - T.th0)) * T.w) / g.AW, (T.y + (t - g.T0) / T.pxt + 0.5) / g.AH];
  // outer surface: border rows and columns step in by half the groove and drop by the chamfer
  const vid = new Int32Array(nr * nc).fill(-1);
  const outerAt = []; // [vertex, row, column] of the outer surface, for its normals
  let finish;
  let trim;
  const seed = look.seed ?? 0;
  const at = (qi, qj) => {
    const k = qi * nc + qj;
    if (vid[k] >= 0) return vid[k];
    const i = i0 + qi;
    const j = j0 + qj;
    const rad = R(i, j);
    const edge = qi === 0 || qj === 0 || qi === nr - 1 || qj === nc - 1;
    const t = t0 + i * dt + (qi === 0 ? GAP / 2 : qi === nr - 1 ? -GAP / 2 : 0);
    const th = (j * 2 * Math.PI) / nth + (qj === 0 ? GAP / 2 / rad : qj === nc - 1 ? -GAP / 2 / rad : 0);
    // an exposed sleeve is ribbed: two rows in every three sit a little deeper (counted on the mould, so ribs line up),
    // except along a smooth spine down its middle where its cable or piston rods run
    const a_ = rad * qj * dth;
    const w_ = rad * (nc - 1) * dth;
    const spine = (look.seed ?? 0) < 0.8 && Math.abs(a_ - w_ / 2) < 0.028;
    pos.push(...P(t, th, rad + lift - (edge ? CHAMFER : 0) - (look.mech && i % 3 && !spine ? RIB : 0)));
    pl.push(qi * dt, a_, H, w_);
    const lit = trim && !look.mech && qi === 2 && qj > 1 && qj < nc - 2; // a light line just inside the plate's top edge
    col.push(...(lit ? FIN.orange : finish));
    glow.push(lit ? 1 : 0);
    uvs.push(...UV(t, th));
    vid[k] = pos.length / 3 - 1;
    outerAt.push([vid[k], i, j]);
    return vid[k];
  };
  const on = [];
  for (let qi = 0; qi < nr - 1; qi++) for (let qj = 0; qj < nc - 1; qj++) if (quad(qi, qj)) on.push([qi, qj]);
  if (on.length < 6) return null;
  finish = [1, 1, 1]; // the paint shows as it is
  trim = look.trim;
  const has = new Set(on.map(([qi, qj]) => qi * nc + qj));
  for (const [qi, qj] of on) {
    const A = at(qi, qj);
    const B = at(qi + 1, qj);
    const C = at(qi + 1, qj + 1);
    const D = at(qi, qj + 1);
    idx.push(A, C, B, A, D, C); // wound so the outside is the front face (the AO pass draws front faces only)
  }
  // the dark edge: a wall down THICK from every open side of the panel
  const wall = (p, q) => {
    const n0 = pos.length / 3;
    for (const v of [p, q]) {
      const x = new V3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      const tt = x.clone().sub(new V3(...a)).dot(new V3(...u));
      const ax = new V3(...a).addScaledVector(new V3(...u), tt);
      const inward = ax.sub(x).normalize().multiplyScalar(THICK);
      pos.push(x.x, x.y, x.z, x.x + inward.x, x.y + inward.y, x.z + inward.z);
      col.push(...DARK, ...DARK);
      glow.push(0, 0);
      uvs.push(uvs[v * 2], uvs[v * 2 + 1], uvs[v * 2], uvs[v * 2 + 1]);
      pl.push(0, 0, 0, 0, 0, 0, 0, 0);
    }
    idx.push(n0, n0 + 3, n0 + 1, n0, n0 + 2, n0 + 3);
  };
  for (const [qi, qj] of on) {
    if (!has.has((qi - 1) * nc + qj)) wall(at(qi, qj + 1), at(qi, qj));
    if (!has.has((qi + 1) * nc + qj)) wall(at(qi + 1, qj), at(qi + 1, qj + 1));
    if (qj === 0 || !has.has(qi * nc + qj - 1)) wall(at(qi, qj), at(qi + 1, qj));
    if (qj === nc - 2 || !has.has(qi * nc + qj + 1)) wall(at(qi + 1, qj + 1), at(qi, qj + 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('pl', new THREE.Float32BufferAttribute(pl, 4));
  geo.setAttribute('mk', new THREE.Float32BufferAttribute(Array.from({length: pos.length / 3}, () => [look.mech ? 1 : 0, seed]).flat(), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (look.mech) return geo; // ribs keep their own normals, so they catch the light
  // the outer surface takes its normal from the whole mould, not from this plate alone, so two plates that meet
  // shade the same on both sides of the seam and the assembled armor shows no line
  const nrm = geo.attributes.normal;
  const cross = new V3();
  for (const [v, i, j] of outerAt) {
    const th = (j * 2 * Math.PI) / nth;
    const ip = Math.min(i + 1, nt - 1);
    const im = Math.max(i - 1, 0);
    const dT = new V3(...P(t0 + ip * dt, th, R(ip, j))).sub(new V3(...P(t0 + im * dt, th, R(im, j))));
    const dTh = new V3(...P(t0 + i * dt, th + (2 * Math.PI) / nth, R(i, j + 1))).sub(new V3(...P(t0 + i * dt, th - (2 * Math.PI) / nth, R(i, j - 1))));
    cross.crossVectors(dTh, dT).normalize();
    const out = new V3(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
    if (cross.dot(out) < 0) cross.negate();
    nrm.setXYZ(v, cross.x, cross.y, cross.z);
  }
  return geo;
}

// armor or exposed mechanics, as in the design: white plates over the front and outer faces, and the joints, the faces
// toward the body, the waist, the neck and every place the design paints dark left open as ribbed actuator sleeves.
// Plus a light line along the outer side of each limb.
const DARKPAINT = [45, 95]; // mean paint brightness (0-255) under which a plate is left open: on a front or outer face, elsewhere
function lookOf(id, bi, bands, face, lum) {
  const base = id.replace(/[LR]$/, '');
  const sx = id.endsWith('R') ? -1 : 1;
  const inward = sx * face.x < -0.45;
  const outward = sx * face.x > 0.45;
  const dark = lum < DARKPAINT[face.z > 0.3 || outward ? 0 : 1];
  if (['upper', 'fore', 'thigh', 'shin', 'meta'].includes(base)) {
    const collar = (bi === 0 && base !== 'upper') || bi === bands - 1; // the shoulder end stays a pauldron
    return {mech: collar || inward || (face.z < -0.3 && dark), trim: !collar && outward && bi === 1}; // fronts and outer faces stay white
  }
  if (base === 'torso') return {mech: bi === 0 || bi === bands - 1 || (face.z < 0.2 && dark), trim: face.z > 0.2 && bi === 1};
  if (base === 'pelvis') return {mech: face.z < 0.3, trim: false};
  if (base === 'head') return {mech: bi === 0, trim: false};
  return {mech: true, trim: false};
}
// a plate's name from the way it faces
const SIDE = (n, id) => {
  const sx = id.endsWith('R') ? -1 : 1;
  const o = [['FRONT', [0, 0, 1]], ['REAR', [0, 0, -1]], ['TOP', [0, 1, 0]], ['UNDERSIDE', [0, -1, 0]], [/[LR]$/.test(id) ? 'OUTER' : 'LEFT', [sx, 0, 0]], [/[LR]$/.test(id) ? 'INNER' : 'RIGHT', [-sx, 0, 0]]];
  return o.reduce((b, x) => (n.x * x[1][0] + n.y * x[1][1] + n.z * x[1][2] > n.x * b[1][0] + n.y * b[1][1] + n.z * b[1][2] ? x : b))[0];
};

export function loadShell(C) {
  // the paint atlas decodes first; every plate then wears it
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = 'data:image/jpeg;base64,' + MOLD.atlas.jpg;
  }).then((img) => {
    const tex = new THREE.Texture(img);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return build(C, tex);
  });
}

function build(C, tex) {
  const {N, mkPart, pickables} = C;
  const meta = segments(N);
  // the chest plates leave a round window over the reactor, so its glow shows through the armor
  const core = C.byId['reactor-core'];
  core.group.updateWorldMatrix(true, false);
  const reactor = {c: core.group.getWorldPosition(new V3()), r: 0.1};
  const added = [];
  const v = new V3();
  let k = 0;
  for (const seg of MOLD.segments) {
    if (/^(hand|foot)/.test(seg.id)) continue; // hands and feet are built as claws (claws.js)
    const s = meta[seg.id];
    const g = fillMould({...seg, T0: seg.t0, AW: MOLD.atlas.w, AH: MOLD.atlas.h, r: new Uint16Array(bytes(seg.r).buffer), c: bytes(seg.c)});
    g.r = smoothR(g.r, g.nt, g.nth);
    const L = (i, j) => {
      const ci = (i * g.nth + j) * 3;
      return 0.3 * g.c[ci] + 0.59 * g.c[ci + 1] + 0.11 * g.c[ci + 2];
    };
    const inv = s.node.matrixWorld.clone().invert();
    const q = s.node.getWorldQuaternion(new THREE.Quaternion()).invert();
    // panel lines sit evenly, each nudged within 30% of a plate to the darkest row or column of paint: a painted seam
    const snap = (centre, span, n, mean) => {
      let best = centre;
      let bl = Infinity;
      for (let d = -Math.floor(span * 0.3); d <= Math.floor(span * 0.3); d++) {
        const v2 = mean(Math.round(centre + d), n) + Math.abs(d) * 0.4;
        if (v2 < bl) [bl, best] = [v2, Math.round(centre + d)];
      }
      return best;
    };
    const rowLum = (i) => {
      let t = 0;
      let m = 0;
      for (let j = 0; j < g.nth; j++) if (g.r[i * g.nth + j]) (t += L(i, j)), m++;
      return m ? t / m : 255;
    };
    const colLum = (j) => {
      const jj = ((j % g.nth) + g.nth) % g.nth;
      let t = 0;
      let m = 0;
      for (let i = 0; i < g.nt; i++) if (g.r[i * g.nth + jj]) (t += L(i, jj)), m++;
      return m ? t / m : 255;
    };
    const rb = [0, ...Array.from({length: s.bands - 1}, (_, b) => snap(((b + 1) * (g.nt - 1)) / s.bands, (g.nt - 1) / s.bands, g.nt, rowLum)), g.nt - 1];
    const cb = Array.from({length: s.secs + 1}, (_, k2) => (k2 === s.secs ? null : snap((k2 * g.nth) / s.secs - g.nth / s.secs / 2, g.nth / s.secs, g.nth, colLum)));
    cb[s.secs] = cb[0] + g.nth;
    const rows = (b) => rb[b];
    const cols = (k2) => cb[k2];
    for (let bi = 0; bi < s.bands; bi++) {
      for (let si = 0; si < s.secs; si++) {
        const th = (((cols(si) + cols(si + 1)) / 2) * 2 * Math.PI) / g.nth;
        const face = new V3(...g.f).multiplyScalar(Math.cos(th)).addScaledVector(new V3(...g.l), Math.sin(th));
        let lum = 0;
        let n = 0;
        for (let i = rows(bi); i <= rows(bi + 1); i++) for (let j = cols(si); j <= cols(si + 1); j++) if (g.r[i * g.nth + (j % g.nth)]) (lum += L(i, j % g.nth)), n++;
        const look = {...lookOf(seg.id, bi, s.bands, face, n ? lum / n : 255), seed: ((k * 7919 + 13) % 101) / 101};
        const geo = plateGeo(g, rows(bi), rows(bi + 1), cols(si), cols(si + 1), look, {hole: seg.id === 'torso' ? reactor : null});
        if (!geo) continue;
        // world rest positions -> the joint node's frame
        geo.applyMatrix4(inv);
        geo.computeBoundingSphere();
        const nrm = geo.attributes.normal;
        const lift = new V3();
        for (let i = 0; i < nrm.count; i++) lift.add(v.fromBufferAttribute(nrm, i));
        lift.applyQuaternion(q.clone().invert()).normalize();
        const cen = geo.boundingSphere.center.clone().applyMatrix4(s.node.matrixWorld);
        const away = new V3(...(s.out || [cen.x * 2.5, Math.max(-0.1, (cen.y - 2.2) * 0.4), 0.35])).normalize();
        const side = SIDE(lift, seg.id);
        const dir = lift.clone().add(away.multiplyScalar(0.6)).normalize();
        dir.y = Math.max(dir.y, -0.15); // never into the floor
        const band = s.bands > 1 ? ` ${bi + 1}` : '';
        const p = mkPart(s.node, `shell-${seg.id}-${bi + 1}-${si + 1}`, `${s.name} ${side} ${look.mech ? 'ACTUATOR SLEEVE' : 'PLATE'}${band}`, 'armor', {tags: s.tags, out: dir.applyQuaternion(q).toArray(), dist: 0.38 + 0.2 * ((k++ * 7919) % 97) / 97, stage: 1});
        const m = plateMat(tex);
        p.mats.push({m, base: 1, e0: 0});
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.part = p;
        p.group.add(mesh);
        pickables.push(mesh);
        added.push(p);
      }
    }
  }
  // while every plate of a joint sits at rest, they are drawn as one merged piece (one draw call instead of dozens);
  // the page switches back to the separate plates the moment one moves, ghosts, is hovered or pulled (live.js)
  const byNode = new Map();
  for (const p of added) (byNode.get(p.parent) || byNode.set(p.parent, []).get(p.parent)).push(p);
  for (const [node, plates] of byNode) {
    const geos = plates.map((p) => p.group.children[0].geometry);
    const mesh = new THREE.Mesh(mergeGeometries(geos), plateMat(tex));
    mesh.castShadow = mesh.receiveShadow = true;
    node.add(mesh);
    const proxy = {mesh, plates};
    for (const p of plates) p.proxy = proxy;
  }
  // domed caps where the mould stops short of a closed end: the crown of the helmet and the tops of the shoulders
  for (const [id, end, name] of [['head', 1, 'HELMET CROWN'], ['upperL', 0, 'L SHOULDER CAP'], ['upperR', 0, 'R SHOULDER CAP']]) {
    const seg = MOLD.segments.find((x) => x.id === id);
    const g = fillMould({...seg, r: new Uint16Array(bytes(seg.r).buffer), c: bytes(seg.c)});
    g.r = smoothR(g.r, g.nt, g.nth);
    const [A, U, F, L] = [g.a, g.u, g.f, g.l].map((x) => new V3(...x));
    const row = end ? g.nt - 1 : 0;
    const t = g.t0 + row * g.dt;
    const sgn = end ? 1 : -1; // the dome rises past the row, away from the body of the segment
    let mean = 0;
    for (let j = 0; j < g.nth; j++) mean += g.r[row * g.nth + j] / 1000 / g.nth;
    const s = meta[id];
    const inv = s.node.matrixWorld.clone().invert();
    const K = 6;
    const pos = [];
    const idx = [];
    for (let k = 0; k <= K; k++) {
      const ph = (k / K) * (Math.PI / 2);
      for (let j = 0; j < g.nth; j += 2) {
        const th = (j * 2 * Math.PI) / g.nth;
        const rad = (g.r[row * g.nth + j] / 1000 + LIFT) * Math.cos(ph);
        const d = F.clone().multiplyScalar(Math.cos(th)).addScaledVector(L, Math.sin(th));
        pos.push(...A.clone().addScaledVector(U, t + sgn * 0.45 * mean * Math.sin(ph)).addScaledVector(d, rad).applyMatrix4(inv).toArray());
      }
    }
    const nr = g.nth / 2;
    for (let k = 0; k < K; k++) for (let j = 0; j < nr; j++) {
      const a0 = k * nr + j;
      const b0 = k * nr + ((j + 1) % nr);
      if (end) idx.push(a0, b0, b0 + nr, a0, b0 + nr, a0 + nr);
      else idx.push(a0, b0 + nr, b0, a0, a0 + nr, b0 + nr);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({length: pos.length / 3}, () => FIN.white).flat(), 3)); // white like the design's crown and pauldrons
    cg.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
    cg.setIndex(idx);
    cg.computeVertexNormals();
    const p = mkPart(s.node, `shell-${id}-cap`, `${s.name} ${name}`, 'armor', {tags: s.tags, out: U.clone().multiplyScalar(sgn).applyQuaternion(s.node.getWorldQuaternion(new THREE.Quaternion()).invert()).toArray(), dist: 0.45, stage: 1});
    const m = plateMat();
    p.mats.push({m, base: 1, e0: 0});
    const mesh = new THREE.Mesh(cg, m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.part = p;
    p.group.add(mesh);
    pickables.push(mesh);
    added.push(p);
  }
  // the head: a glowing V visor across the face and two swept fins, parts of their own on the helmet's surface
  {
    const seg = MOLD.segments.find((x) => x.id === 'head');
    const g = fillMould({...seg, r: new Uint16Array(bytes(seg.r).buffer), c: bytes(seg.c)});
    g.r = smoothR(g.r, g.nt, g.nth);
    const [A, U, F, L] = [g.a, g.u, g.f, g.l].map((x) => new V3(...x));
    const H = (g.nt - 1) * g.dt;
    // the surface point at height t (m above the mould's first row) and angle th (deg, 0 = the face), lifted by off
    const at = (t, th, off = 0) => {
      const fi = Math.min(g.nt - 1.001, Math.max(0, t / g.dt));
      const fj = ((((th / 360) * g.nth) % g.nth) + g.nth) % g.nth;
      const i0 = Math.floor(fi);
      const j0 = Math.floor(fj);
      const R = (i, j) => g.r[i * g.nth + (j % g.nth)] / 1000;
      const rad = (R(i0, j0) * (1 - (fi - i0)) + R(i0 + 1, j0) * (fi - i0)) * (1 - (fj - j0)) + (R(i0, j0 + 1) * (1 - (fi - i0)) + R(i0 + 1, j0 + 1) * (fi - i0)) * (fj - j0);
      const d = F.clone().multiplyScalar(Math.cos((th * Math.PI) / 180)).addScaledVector(L, Math.sin((th * Math.PI) / 180));
      return A.clone().addScaledVector(U, g.t0 + t).addScaledVector(d, rad + LIFT + off); // on the plates, not under them
    };
    const inv = N.head.matrixWorld.clone().invert();
    // visor: a V of light, low at the centre and rising to the temples, thinning as it goes
    const vis = mkPart(N.head, 'visor', 'VISOR · OPTICS', 'armor', {tags: ['head'], out: [0, 0.1, 1], dist: 0.5, stage: 1});
    const pts = [];
    const ix = [];
    const W = 18;
    for (let k = 0; k <= W; k++) {
      const th = -44 + (88 * k) / W;
      const w = Math.abs(th) / 44;
      const tc = H * 0.42 + 0.032 * w;
      const hh = 0.012 * (1 - 0.5 * w);
      for (const [tt, off] of [[tc - hh, 0.002], [tc, 0.006], [tc + hh, 0.002]]) pts.push(...at(tt, th, off).applyMatrix4(inv).toArray());
      if (k) for (let r2 = 0; r2 < 2; r2++) {
        const a0 = (k - 1) * 3 + r2;
        const b0 = k * 3 + r2;
        ix.push(a0, a0 + 1, b0 + 1, a0, b0 + 1, b0);
      }
    }
    const vg = new THREE.BufferGeometry();
    vg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    vg.setIndex(ix);
    vg.computeVertexNormals();
    C.addMesh(vis, vg, 'glow', {args: ['#ffb347', 1.6], shadow: false}).material.side = THREE.DoubleSide;
    added.push(vis);
    // fins: thin swept blades on either side of the crown, white with a lit leading edge
    for (const sd of [-1, 1]) {
      const fin = mkPart(N.head, `fin-${sd < 0 ? 'R' : 'L'}`, `${sd < 0 ? 'R' : 'L'} HELMET FIN`, 'armor', {tags: ['head'], out: [sd, 0.6, -0.2], dist: 0.55, stage: 1});
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.07, 0), new THREE.Vector2(0.03, 0.17), new THREE.Vector2(0.006, 0.15)]);
      const fg = new THREE.ExtrudeGeometry(shape, {depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1});
      fg.translate(-0.035, 0, -0.004);
      const base = at(H * 0.62, sd * 68, -0.004).applyMatrix4(inv);
      const m = new C.Merge().add(fg, {c: C.COL.white});
      const mesh = C.addMesh(fin, m.build(), 'armor');
      mesh.rotation.set(-0.35, sd * 1.25, sd * 0.32, 'YXZ');
      mesh.position.copy(base);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.16, 0.004), C.useMat(fin, 'glow', '#ffb347', 1.4));
      edge.position.set(-0.02, 0.08, 0);
      edge.rotation.z = -0.2;
      edge.userData.part = fin;
      mesh.add(edge);
      added.push(fin);
    }
  }
  // a bezel round the reactor window, on the chest surface in front of the core: a part of its own
  {
    const g = MOLD.segments.find((x) => x.id === 'torso');
    const rr = fillMould({...g, r: new Uint16Array(bytes(g.r).buffer), c: bytes(g.c)});
    const row = Math.round((reactor.c.y - rr.a[1] - rr.t0) / rr.dt);
    const z = rr.a[2] + rr.r[row * rr.nth] / 1000 - 0.012;
    const b = mkPart(N.chest, 'reactor-bezel', 'REACTOR WINDOW BEZEL', 'armor', {tags: ['torso', 'reactor'], pos: N.chest.worldToLocal(new V3(reactor.c.x, reactor.c.y, z)).toArray(), out: [0, 0.2, 1], dist: 0.9, stage: 1});
    const bg = new THREE.TorusGeometry(reactor.r + 0.006, 0.014, 10, 48).toNonIndexed();
    const n = bg.attributes.position.count;
    bg.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({length: n}, () => FIN.graphite).flat(), 3));
    bg.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    const m = plateMat();
    b.mats.push({m, base: 1, e0: 0});
    const mesh = new THREE.Mesh(bg, m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.part = b;
    b.group.add(mesh);
    pickables.push(mesh);
    added.push(b);
  }
  added.push(...claws(C));
  return added;
}
