// VX-7 kinematics and numbers. No three.js here: every pose, gear angle, actuator length and readout is a function of
// (sequence, tau), so the panels can never disagree with the motion.
export const D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x) => (x = clamp(x)) * x * (3 - 2 * x);

// ---- planetary drive: sun 12T, 3 planets 30T, ring 72T (fixed), module 4 mm, two stages
export const GEAR = {Zs: 12, Zp: 30, Zr: 72, mod: 0.004, stage: 1 + 72 / 12, planets: 3};
GEAR.total = GEAR.stage ** 2; // 49
GEAR.pitchD = GEAR.Zr * GEAR.mod; // 0.288 m ring pitch diameter
// pin radius = sun pitch r + planet pitch r (module units)
GEAR.pinR = (GEAR.Zs + GEAR.Zp) / 2;
// angles (any unit) of every rotating member for output (carrier 2) angle th; planet = spin about its own pin, relative to its carrier
export const driveKin = (th) => ({
  carrier2: th, sun2: GEAR.stage * th, carrier1: GEAR.stage * th, sun1: GEAR.total * th,
  planet2: -(GEAR.Zs / GEAR.Zp) * (GEAR.stage * th - th), planet1: -(GEAR.Zs / GEAR.Zp) * (GEAR.total * th - GEAR.stage * th),
});

// id, name, drive scale (module size scales down on small joints), J kg m2 (reflected load inertia), M static gravity moment N m
export const DRIVES = [
  {id: 'neck', name: 'NECK', s: 0.35, J: 1.2, M: 35},
  {id: 'waist', name: 'WAIST', s: 0.5, J: 18, M: 420},
  {id: 'shL', name: 'L SHOULDER', s: 0.72, J: 9, M: 260},
  {id: 'shR', name: 'R SHOULDER', s: 0.72, J: 11, M: 300},
  {id: 'elL', name: 'L ELBOW', s: 0.5, J: 2.6, M: 70},
  {id: 'elR', name: 'R ELBOW', s: 0.5, J: 3.4, M: 90},
  {id: 'hipL', name: 'L HIP', s: 0.7, J: 26, M: 640},
  {id: 'hipR', name: 'R HIP', s: 0.7, J: 26, M: 640},
  {id: 'kneeL', name: 'L KNEE', s: 0.62, J: 12, M: 380},
  {id: 'kneeR', name: 'R KNEE', s: 0.62, J: 12, M: 380},
];
export const BASE_KW = 40;

// ---- hydraulic linear actuators: bore 50, rod 28, stroke 180 mm. Length by the law of cosines on the two mount points.
export const ACT = {bore: 0.05, rod: 0.028, stroke: 0.18};
export const actLen = (a, b, gamma) => Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(gamma));
// ---- the rest pose: joint centres (metres, mech frame: +y up, +z forward, +x its left), measured on the 3D shell
// (front picture for x,y; mesh cross-sections for z — tools/shell/joints.py). Every pose angle below is a delta from it.
export const REST = {
  pelvis: [0, 2.344, 0], waist: [0, 2.578, -0.054], neck: [0, 3.21, -0.017],
  hipL: [0.348, 2.318, 0.017], hipR: [-0.348, 2.311, -0.011], kneeL: [0.354, 1.512, 0.067], kneeR: [-0.405, 1.512, 0.068],
  hockL: [0.432, 0.579, -0.129], hockR: [-0.499, 0.579, -0.131], footL: [0.455, 0.13, 0.023], footR: [-0.533, 0.13, 0.022],
  shL: [0.523, 3.051, -0.1], shR: [-0.506, 3.037, -0.095], elL: [0.557, 2.528, -0.104], elR: [-0.658, 2.561, -0.116],
  wrL: [0.692, 1.945, -0.058], wrR: [-0.86, 1.928, -0.079], handL: [0.675, 1.638, -0.021], handR: [-0.911, 1.762, -0.073],
};
const dist = (a, b) => Math.hypot(...REST[a].map((v, i) => v - REST[b][i]));
export const LEN = {};
for (const s of 'LR') Object.assign(LEN, {['thigh' + s]: dist('hip' + s, 'knee' + s), ['shin' + s]: dist('knee' + s, 'hock' + s), ['meta' + s]: dist('hock' + s, 'foot' + s), ['upper' + s]: dist('sh' + s, 'el' + s), ['fore' + s]: dist('el' + s, 'wr' + s)});
export const BODY = {waistY: REST.waist[1] - REST.pelvis[1], neckY: REST.neck[1] - REST.waist[1]};
// hydraulic mount offsets along the limb (m): knee and hock cylinders, elbow piston
// rest bend at a joint: 180 minus the angle between its two limb segments (deg)
const bend = (a, j, b) => {
  const u = REST[a].map((v, i) => v - REST[j][i]);
  const w = REST[b].map((v, i) => v - REST[j][i]);
  return 180 - (Math.acos(u.reduce((t, v, i) => t + v * w[i], 0) / (Math.hypot(...u) * Math.hypot(...w))) * 180) / Math.PI;
};
export const LEG = {kA: 0.3, kB: 0.3, hA: 0.26, hB: 0.26, kneeBend: bend('hipL', 'kneeL', 'hockL'), hockBend: bend('kneeL', 'hockL', 'footL')};
export const ARM = {a: 0.22, b: 0.22};

// ---- sequences: each a function of (seq, tau). Channels are degrees (forward-positive) unless noted; ab* / ha* abduct
// the shoulder / hip outward, twist turns the torso to its left, pitch somersaults the whole body, air (m) lifts it,
// dz (m) steps it forward, travel (m) is how far the floor has rolled back under it, blade (0..1) is the plasma length.
export const SEQ = {STANCE: {dur: 4}, STRIDE: {dur: 1.6}, RUN: {dur: 0.76}, JUMP: {dur: 3.4}, ROLL: {dur: 2.8}, SLASH: {dur: 1.7}, BLOCK: {dur: 1.8}, SHOOT: {dur: 2.0}, FIGHT: {dur: 5.6}};
export const STANCE0 = {trail: 0, neck: 0, waist: 0, twist: 0, shL: 0, shR: 0, abL: 0, abR: 0, elL: 0, elR: 0, hipL: 0, hipR: 0, haL: 0, haR: 0, kneeL: 0, kneeR: 0, toeL: 0, toeR: 0, shield: 0, shieldZ: 0, lean: 0, pitch: 0, air: 0, dz: 0, travel: 0, blade: 1};
const both = (o) => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (k.endsWith('_') ? [[k.slice(0, -1) + 'L', v], [k.slice(0, -1) + 'R', v]] : [[k, v]])));
// key poses: [time, channels]; a channel a key leaves out is at its stance value; neighbours blend with smoothstep
const keyed = (keys, t) => {
  let i = 1;
  while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [t0, a] = keys[i - 1];
  const [t1, b] = keys[i];
  const u = sm((t - t0) / (t1 - t0));
  const p = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) p[k] = (a[k] ?? STANCE0[k]) + ((b[k] ?? STANCE0[k]) - (a[k] ?? STANCE0[k])) * u;
  return p;
};
const CROUCH = both({hip_: 46, knee_: 88, sh_: -30, el_: 30, ab_: 14, lean: 16, waist: 10, neck: -10, shield: 10});
const GUARD = both({hip_: 14, knee_: 26, lean: 5, neck: -3, shL: 35, elL: 60, abL: 12, shR: 30, elR: 60, abR: 18, shield: 28});
const BLOCKP = {...both({hip_: 20, knee_: 36}), twist: -50, shield: -35, shieldZ: 0.2, lean: -2, waist: 4, neck: 4, shR: -15, elR: 75, abR: 25, shL: 30, elL: 80};
const AIM = {shL: 88, elL: 0, abL: 2, twist: 6, lean: 2, neck: -2, shield: 60, hipL: 10, kneeL: 18, hipR: 16, kneeR: 24, shR: 18, elR: 55, abR: 14};
// laser shots (s into SHOOT) and the moment a blow lands on the shield (s into BLOCK)
export const SHOTS = [0.5, 0.72, 0.94, 1.16, 1.38];
export const BLOCK_HIT = 0.66;
const TUCK = both({hip_: 112, knee_: 138, sh_: 35, el_: 115, ab_: 4, lean: 10, waist: 38, neck: 30, shield: 30, blade: 0});
const KEYS = {
  JUMP: [
    [0, {}], [0.6, CROUCH],
    [0.95, both({hip_: -4, knee_: 4, sh_: 70, el_: 25, ab_: 20, toe_: -25, lean: 4, neck: -6, shield: 20})], // takeoff
    [1.4, both({hip_: 72, knee_: 115, sh_: 40, el_: 90, ab_: 10, lean: 8, waist: 14, neck: 8, shield: 25})], // tuck at the top
    [1.9, both({hip_: 24, knee_: 26, sh_: 30, el_: 40, ab_: 35, toe_: -8, lean: 6, shield: 15})], [2.05, both({hip_: 24, knee_: 26, sh_: 30, el_: 40, ab_: 35, lean: 6, shield: 15})], // reach, touch down
    [2.32, {...CROUCH, ...both({knee_: 96, sh_: 10, ab_: 30})}], [2.9, both({hip_: 6, knee_: 10})], [3.4, {}],
  ],
  ROLL: [
    [0, {}], [0.5, both({hip_: 60, knee_: 84, sh_: 55, el_: 60, ab_: 10, lean: 24, waist: 22, neck: 14, shield: 20, blade: 0.2})],
    [0.72, TUCK], [1.45, TUCK],
    [1.75, both({hip_: 70, knee_: 100, sh_: 30, el_: 60, ab_: 20, lean: 18, waist: 16, neck: 6, shield: 15, blade: 0})],
    [2.3, both({hip_: 12, knee_: 20, lean: 4})], [2.8, {}],
  ],
  SLASH: [
    [0, GUARD], [0.42, {...GUARD, twist: -38, shR: -25, abR: 70, elR: 45, hipL: 22, kneeL: 30, hipR: 8, kneeR: 22}],
    [0.66, {...GUARD, twist: 42, shR: 85, abR: 82, elR: 6, lean: 10, hipL: 30, kneeL: 42, hipR: 2, kneeR: 18, shield: 20}],
    [1.0, {...GUARD, twist: 48, shR: 100, abR: 72, elR: 14, lean: 9, hipL: 28, kneeL: 40, hipR: 4, kneeR: 20, shield: 20}], [1.7, {}],
  ],
  BLOCK: [
    [0, {}], [0.25, BLOCKP], [BLOCK_HIT, BLOCKP], [BLOCK_HIT + 0.1, {...BLOCKP, lean: -7, dz: -0.22, ...both({hip_: 26, knee_: 46})}], [1.35, BLOCKP], [1.8, {}],
  ],
  SHOOT: [[0, {}], [0.35, AIM], [1.55, AIM], [2.0, {}]],
  FIGHT: [
    [0, GUARD],
    [0.5, {...GUARD, twist: -38, shR: -25, abR: 70, elR: 45, hipL: 22, kneeL: 30, hipR: 8, kneeR: 22}], // wind up
    [0.78, {...GUARD, twist: 42, shR: 85, abR: 82, elR: 6, lean: 10, hipL: 30, kneeL: 42, hipR: 2, kneeR: 18, shield: 20}], // flat slash
    [1.15, {...GUARD, twist: 48, shR: 100, abR: 72, elR: 14, lean: 9, hipL: 28, kneeL: 40, hipR: 4, kneeR: 20, shield: 20}],
    [1.7, GUARD],
    [2.15, {...GUARD, shR: 150, abR: 22, elR: 70, twist: -8, lean: -4, waist: -6, neck: -8}], // blade overhead
    [2.45, {...GUARD, shR: 60, abR: 10, elR: 2, twist: 8, lean: 18, waist: 16, hipR: 42, kneeR: 52, hipL: -18, kneeL: 22, dz: 0.45, neck: 4}], // chop on a lunge
    [2.85, {...GUARD, shR: 55, abR: 10, elR: 6, twist: 6, lean: 16, waist: 14, hipR: 40, kneeR: 50, hipL: -16, kneeL: 22, dz: 0.45, neck: 4}],
    [3.4, GUARD],
    [3.75, {...GUARD, twist: 30, shield: 60, shL: 20, elL: 70, hipR: 20, kneeR: 30}], // shield back
    [4.0, {...GUARD, twist: -55, shield: -30, shieldZ: 0.25, shL: 55, elL: 30, lean: 12, hipL: 36, kneeL: 46, hipR: -6, kneeR: 20, dz: 0.4}], // shield bash: the torso drives it
    [4.4, {...GUARD, twist: -50, shield: -26, shieldZ: 0.2, shL: 50, elL: 34, lean: 10, hipL: 34, kneeL: 44, hipR: -4, kneeR: 20, dz: 0.4}],
    [5.0, GUARD], [5.6, GUARD],
  ],
};
// jump flight: takeoff and touchdown (s into the cycle), and the take-off speed that lands it on time
export const FLY = {a: 0.95, b: 2.05, g: 9.81, dist: 2.8};
const ROLL_R = 1.0;
export function pose(seq, tau) {
  const T = SEQ[seq].dur;
  const t = ((tau % T) + T) % T;
  const n = Math.floor(tau / T);
  const w = (2 * Math.PI * t) / T;
  const p = {...STANCE0};
  if (seq === 'STANCE') {
    const s = Math.sin(w);
    Object.assign(p, {waist: 2 * s, neck: -2 * s, shL: 2 * s, shR: -2 * s, hipL: 1.5 * s, hipR: -1.5 * s, kneeL: 2 * (1 - Math.cos(w)), kneeR: 2 * (1 - Math.cos(w)), shield: 2 * s});
  } else if (seq === 'STRIDE') {
    const ph = (x) => [18 * Math.sin(w + x), 30 * Math.pow(Math.max(0, Math.cos(w + x)), 1.5)];
    [p.hipR, p.kneeR] = ph(0);
    [p.hipL, p.kneeL] = ph(Math.PI);
    Object.assign(p, {shL: -16 * Math.sin(w), shR: 16 * Math.sin(w), elL: 12, elR: 12, waist: 4 * Math.sin(w), neck: -3 * Math.sin(w), shield: 6 * Math.sin(w), travel: 1.7 * tau});
  } else if (seq === 'RUN') {
    // swing (hip coming forward) folds the knee; arms pump against the legs; a short float at each foot change
    const ph = (x) => [12 + 34 * Math.sin(w + x), 12 + 80 * Math.pow(Math.max(0, Math.cos(w + x)), 1.3)]; // hips biased by the lean: legs swing about vertical
    [p.hipR, p.kneeR] = ph(0);
    [p.hipL, p.kneeL] = ph(Math.PI);
    Object.assign(p, {lean: 12, neck: -8, waist: 4, twist: -10 * Math.sin(w), shL: 38 * Math.sin(w), shR: -38 * Math.sin(w), elL: 80, elR: 80, abL: 12, abR: 12, shield: 12, air: 0.08 * Math.max(0, -Math.cos(2 * w)) ** 2, travel: 6.5 * tau});
  } else {
    Object.assign(p, keyed(KEYS[seq], t));
    if (seq === 'JUMP') {
      const s = clamp(t - FLY.a, 0, FLY.b - FLY.a);
      const v0 = (FLY.g * (FLY.b - FLY.a)) / 2;
      p.air = v0 * s - 0.5 * FLY.g * s * s;
      if (t > FLY.a && t < FLY.b) p.fly = [FLY.a, FLY.b, (t - FLY.a) / (FLY.b - FLY.a)];
      p.travel = (n + s / (FLY.b - FLY.a)) * FLY.dist;
    } else if (seq === 'SHOOT') {
      // each shot kicks the forearm up and the body back, then it settles
      const r = SHOTS.reduce((a, ti) => a + (t >= ti ? Math.exp(-(t - ti) / 0.07) : 0), 0);
      p.elL += 5 * r;
      p.shL += 2 * r;
      p.lean -= 1.2 * r;
      p.shots = SHOTS.map((ti) => t - ti);
    } else if (seq === 'BLOCK') {
      p.spark = t >= BLOCK_HIT ? Math.exp(-(t - BLOCK_HIT) / 0.14) : 0;
    } else if (seq === 'ROLL') {
      const r = sm((t - 0.55) / 1.05);
      p.pitch = 360 * r;
      const per = 0.3 + 2 * Math.PI * ROLL_R + 0.3;
      p.travel = n * per + 0.3 * sm(t / 0.55) + 2 * Math.PI * ROLL_R * r + 0.3 * sm((t - 1.6) / 0.6);
    }
  }
  if (seq === 'SLASH' || seq === 'FIGHT') p.trail = 1; // the blade leaves a trail in a fight, not when he runs
  // the hock hydraulics hold the metatarsal at its rest angle to the body: they cancel the lean, hip and knee above it
  for (const s of 'LR') p['hock' + s] = p.lean - p['hip' + s] + p['knee' + s] + p['toe' + s];
  return p;
}
// actuator lengths and strokes from a pose
export function actuators(p) {
  const out = {};
  for (const s of 'LR') {
    out['knee' + s] = actLen(LEG.kA, LEG.kB, (180 - LEG.kneeBend - p['knee' + s]) * D2R);
    out['hock' + s] = actLen(LEG.hA, LEG.hB, (180 - LEG.hockBend - p['hock' + s]) * D2R);
    out['arm' + s] = actLen(ARM.a, ARM.b, (180 - p['el' + s]) * D2R);
  }
  return out;
}
// per-drive readouts: joint angle, deg/s, motor rpm, torque (first-order load: inertia + gravity), and total power
export function readout(seq, tau) {
  const dt = 1 / 120;
  const a = pose(seq, tau);
  const b = pose(seq, tau - dt);
  const c = pose(seq, tau + dt);
  const drives = {};
  let kw = BASE_KW;
  for (const d of DRIVES) {
    const w = (c[d.id] - b[d.id]) / (2 * dt); // deg/s
    const al = ((c[d.id] - 2 * a[d.id] + b[d.id]) / (dt * dt)) * D2R;
    const tq = d.J * al + d.M * Math.sin((a[d.id] + 10) * D2R);
    drives[d.id] = {deg: a[d.id], degps: w, rpm: (Math.abs(w) / 6) * GEAR.total, torque: tq, motorTorque: tq / GEAR.total};
    kw += Math.abs(tq * w * D2R) / 1000;
  }
  return {drives, kw, pose: a, act: actuators(a)};
}
