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
  {id: 'neck', name: 'NECK', s: 0.45, J: 1.2, M: 35},
  {id: 'waist', name: 'WAIST', s: 0.8, J: 18, M: 420},
  {id: 'shL', name: 'L SHOULDER', s: 1, J: 9, M: 260},
  {id: 'shR', name: 'R SHOULDER', s: 1, J: 11, M: 300},
  {id: 'elL', name: 'L ELBOW', s: 0.7, J: 2.6, M: 70},
  {id: 'elR', name: 'R ELBOW', s: 0.7, J: 3.4, M: 90},
  {id: 'hipL', name: 'L HIP', s: 1, J: 26, M: 640},
  {id: 'hipR', name: 'R HIP', s: 1, J: 26, M: 640},
  {id: 'kneeL', name: 'L KNEE', s: 0.9, J: 12, M: 380},
  {id: 'kneeR', name: 'R KNEE', s: 0.9, J: 12, M: 380},
];
export const BASE_KW = 40;

// ---- hydraulic linear actuators: bore 50, rod 28, stroke 180 mm. Length by the law of cosines on the two mount points.
export const ACT = {bore: 0.05, rod: 0.028, stroke: 0.18};
export const actLen = (a, b, gamma) => Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(gamma));
// leg: lengths, neutral bends (deg). Forward-positive angles throughout.
export const BODY = {hipX: 0.34, waistY: 0.34, shX: 0.47, shY: 0.92, neckY: 1.04};
export const LEG = {thigh: 0.8, shin: 0.82, meta: 0.52, kneeBend: 78, hockBend: 56, thighLean: 36, metaWorld: 14, abd: 20, kA: 0.26, kB: 0.26, hA: 0.22, hB: 0.22};
export const ARM = {upper: 0.66, fore: 0.64, a: 0.2, b: 0.2};

// ---- sequences
export const SEQ = {STANCE: {dur: 4}, STRIDE: {dur: 1.6}, STRIKE: {dur: 2.4}};
const kf = (t, k) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * sm((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
};
export function pose(seq, tau) {
  const T = SEQ[seq].dur;
  const t = ((tau % T) + T) % T;
  const w = (2 * Math.PI * t) / T;
  const p = {neck: 0, waist: 0, shL: -4, shR: 4, elL: 18, elR: 26, hipL: -6, hipR: 14, kneeL: 14, kneeR: 6, shield: 0, lean: 7};
  if (seq === 'STANCE') {
    const s = Math.sin(w);
    Object.assign(p, {waist: 2 * s, neck: -2 * s, shL: p.shL + 2 * s, shR: p.shR - 2 * s, hipL: p.hipL + 1.5 * s, hipR: p.hipR - 1.5 * s, kneeL: p.kneeL + 2 * (1 - Math.cos(w)), kneeR: p.kneeR + 2 * (1 - Math.cos(w)), shield: 2 * s});
  } else if (seq === 'STRIDE') {
    const ph = (x) => {
      const c = Math.cos(w + x);
      return [26 * Math.sin(w + x), 6 + 42 * Math.pow(Math.max(0, c), 1.5)];
    };
    const [hr, kr] = ph(0);
    const [hl, kl] = ph(Math.PI);
    Object.assign(p, {hipR: hr, kneeR: kr, hipL: hl, kneeL: kl, shL: -22 * Math.sin(w) - 4, shR: 22 * Math.sin(w) + 6, elL: 22, elR: 34, waist: 4 * Math.sin(w), neck: -3 * Math.sin(w), shield: 6 * Math.sin(w)});
  } else {
    const K = (a) => kf(t, a);
    Object.assign(p, {
      shR: K([[0, 8], [0.6, -50], [1.05, 105], [1.5, 95], [2.4, 8]]), elR: K([[0, 35], [0.6, 85], [1.05, 12], [1.5, 20], [2.4, 35]]),
      waist: K([[0, 0], [0.6, -8], [1.05, 16], [1.5, 12], [2.4, 0]]), neck: K([[0, 0], [1.05, 8], [2.4, 0]]),
      shL: K([[0, -6], [0.6, 20], [1.05, 40], [1.5, 38], [2.4, -6]]), elL: K([[0, 15], [0.6, 60], [1.05, 75], [1.5, 72], [2.4, 15]]),
      shield: K([[0, 0], [0.6, 15], [1.05, 30], [1.6, 25], [2.4, 0]]),
      hipR: K([[0, 14], [0.6, 8], [1.05, 34], [1.5, 30], [2.4, 14]]), kneeR: K([[0, 6], [0.6, 20], [1.05, 40], [1.5, 38], [2.4, 6]]),
      hipL: K([[0, -6], [0.6, -14], [1.05, -24], [1.5, -20], [2.4, -6]]), kneeL: K([[0, 14], [0.6, 25], [1.05, 32], [1.5, 30], [2.4, 14]]),
      lean: K([[0, 7], [0.6, 4], [1.05, 14], [1.5, 12], [2.4, 7]]),
    });
  }
  // hock (ankle) hydraulics keep the foot flat: metatarsal world angle = LEG.metaWorld
  for (const s of 'LR') p['hock' + s] = LEG.metaWorld + p.lean - (LEG.thighLean + p['hip' + s] - LEG.kneeBend - p['knee' + s]) - LEG.hockBend;
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
