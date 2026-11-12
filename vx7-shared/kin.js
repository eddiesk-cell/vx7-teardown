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

// ---- sequences
export const SEQ = {STANCE: {dur: 4}, STRIDE: {dur: 1.6}, STRIKE: {dur: 2.4}};
const kf = (t, k) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * sm((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
};
// the resting stance every sequence starts from (deg, forward-positive)
export const STANCE0 = {neck: 0, waist: 0, shL: 0, shR: 0, elL: 0, elR: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shield: 0, lean: 0};
export function pose(seq, tau) {
  const T = SEQ[seq].dur;
  const t = ((tau % T) + T) % T;
  const w = (2 * Math.PI * t) / T;
  const p = {...STANCE0};
  if (seq === 'STANCE') {
    const s = Math.sin(w);
    Object.assign(p, {waist: 2 * s, neck: -2 * s, shL: p.shL + 2 * s, shR: p.shR - 2 * s, hipL: p.hipL + 1.5 * s, hipR: p.hipR - 1.5 * s, kneeL: p.kneeL + 2 * (1 - Math.cos(w)), kneeR: p.kneeR + 2 * (1 - Math.cos(w)), shield: 2 * s});
  } else if (seq === 'STRIDE') {
    const ph = (x) => {
      const c = Math.cos(w + x);
      return [18 * Math.sin(w + x), 30 * Math.pow(Math.max(0, c), 1.5)];
    };
    const [hr, kr] = ph(0);
    const [hl, kl] = ph(Math.PI);
    Object.assign(p, {hipR: hr, kneeR: kr, hipL: hl, kneeL: kl, shL: -16 * Math.sin(w), shR: 16 * Math.sin(w), elL: 12, elR: 12, waist: 4 * Math.sin(w), neck: -3 * Math.sin(w), shield: 6 * Math.sin(w)});
  } else {
    const K = (a) => kf(t, a);
    Object.assign(p, {
      shR: K([[0, 0], [0.6, -45], [1.05, 100], [1.5, 90], [2.4, 0]]), elR: K([[0, 0], [0.6, 70], [1.05, 5], [1.5, 12], [2.4, 0]]),
      waist: K([[0, 0], [0.6, -8], [1.05, 14], [1.5, 10], [2.4, 0]]), neck: K([[0, 0], [1.05, 8], [2.4, 0]]),
      shL: K([[0, 0], [0.6, 18], [1.05, 34], [1.5, 32], [2.4, 0]]), elL: K([[0, 0], [0.6, 40], [1.05, 55], [1.5, 52], [2.4, 0]]),
      shield: K([[0, 0], [0.6, 15], [1.05, 30], [1.6, 25], [2.4, 0]]),
      hipR: K([[0, 0], [0.6, -6], [1.05, 18], [1.5, 16], [2.4, 0]]), kneeR: K([[0, 0], [0.6, 12], [1.05, 26], [1.5, 24], [2.4, 0]]),
      hipL: K([[0, 0], [0.6, -8], [1.05, -14], [1.5, -12], [2.4, 0]]), kneeL: K([[0, 0], [0.6, 10], [1.05, 16], [1.5, 14], [2.4, 0]]),
      lean: K([[0, 0], [0.6, -3], [1.05, 7], [1.5, 6], [2.4, 0]]),
    });
  }
  // the hock hydraulics hold the metatarsal at its rest angle: it cancels the lean, hip and knee above it
  for (const s of 'LR') p['hock' + s] = p.lean - p['hip' + s] + p['knee' + s];
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
