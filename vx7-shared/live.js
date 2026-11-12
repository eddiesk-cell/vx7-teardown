// The page you drive, laid out as a product page: he walks on a treadmill floor while the camera slowly turns; drag to
// turn, wheel or pinch to zoom, right-drag / shift-drag / two fingers to pan, a move button makes him move (JUMP, ROLL
// and FIGHT play once, then he goes back to the last walk / run / idle), click a part to pull it out.
// The same code is the film: runLive({film}) plays a script of events on a fixed clock, as window.SIM.render(t).
import * as THREE from 'three';
import {warmComposer} from 'teardown-kit/warm.js';
import {createConsole, DISPLAY, ISOLATES, SEQ_KEY, SEQS, VIEWS} from './console.js';
import {ARM, BODY, DRIVES, GEAR, LEG, SEQ, STANCE0, driveKin, readout} from './kin.js';
import {createStage} from './stage.js';

const W = 1600;
const H = 900;
const D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x) => (x = clamp(x)) * x * (3 - 2 * x);
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const TURN = 9; // turntable, degrees a second
const BLEND = 0.4; // seconds to blend from one move into the next
const ONE_SHOT = new Set(['JUMP', 'ROLL', 'SLASH', 'BLOCK', 'SHOOT', 'FIGHT']);
// the drive the telemetry follows for each move
const SEL = {STANCE: 'waist', STRIDE: 'hipR', RUN: 'kneeR', JUMP: 'kneeL', ROLL: 'hipL', SLASH: 'shR', BLOCK: 'waist', SHOOT: 'elL', FIGHT: 'shR'};
const VIEWS3 = {
  hero: {tx: 0, ty: 1.62, tz: 0, az: 18, el: 3, d: 10.6},
  front: {tx: 0, ty: 1.6, tz: 0, az: 0, el: 4, d: 11.6},
  side: {tx: 0, ty: 1.6, tz: 0, az: 90, el: 4, d: 11.6},
  back: {tx: 0, ty: 1.6, tz: 0, az: 180, el: 4, d: 11.6},
  // film cameras
  open: {tx: 0, ty: 1.7, tz: 0, az: 30, el: 5, d: 10.6},
  walk: {tx: 0, ty: 1.65, tz: 0, az: 48, el: 3, d: 11.2},
  run: {tx: 0, ty: 1.6, tz: 0, az: -78, el: 2, d: 11.8},
  run2: {tx: 0, ty: 1.6, tz: 0, az: 40, el: 6, d: 11.5},
  jump: {tx: 0, ty: 2.0, tz: 0, az: 28, el: 6, d: 13.2},
  roll: {tx: 0, ty: 1.4, tz: 0, az: -66, el: 6, d: 11.5},
  fight: {tx: 0, ty: 1.7, tz: 0.2, az: 20, el: 2, d: 10.2},
  fight2: {tx: 0, ty: 1.7, tz: 0.2, az: -32, el: 5, d: 10.2},
  shoot: {tx: 0, ty: 2.2, tz: 1.9, az: -72, el: 4, d: 11.5}, // from his right: the bolts cross the frame
};
// isolate specs: which parts stay solid, where the camera flies, how close
const ISO = {
  HEAD: {sel: (p) => p.tags.includes('head'), focus: 'drive-neck', d: 2.6, armorSolid: true, drive: 'neck'},
  REACTOR: {sel: (p) => p.tags.includes('reactor'), focus: 'reactor-core', d: 2.4, drive: 'waist'},
  SHOULDER: {sel: (p) => p.tags.includes('shoulderR'), focus: 'drive-shR', d: 3.6, drive: 'shR'},
  'BLADE ARM': {sel: (p) => p.tags.includes('blade'), focus: 'drive-elR', d: 4.6, armorSolid: true, drive: 'elR'},
  HIP: {sel: (p) => p.tags.includes('hip') && !p.tags.includes('legR'), focus: 'drive-hipL', d: 3.4, drive: 'hipL'},
  KNEE: {sel: (p) => p.tags.includes('knee') && p.tags.includes('legL'), focus: 'drive-kneeL', d: 3.0, drive: 'kneeL'},
  FOOT: {sel: (p) => p.tags.includes('foot') && p.tags.includes('legL'), focus: 'act-hock-L', d: 2.6, drive: 'kneeL'},
};
const LABELS = [
  ['reactor-core', 'REACTOR CORE', 'ORANGE TORUS · COOLANT LOOPS'], ['drive-neck', 'NECK DRIVE', '49:1 · 2 STAGES'], ['drive-shR', 'R SHOULDER DRIVE', 'SUN 12 · PLANET 30 · RING 72'],
  ['drive-elR', 'R ELBOW DRIVE', 'FRAMELESS BLDC + PLANETARY'], ['blade', 'PLASMA BLADE', '1.3 M · ORANGE'], ['shell-head-00', 'HELMET', 'PAINTED SHELL · CLICK TO PULL'], ['shield-spine', 'SHIELD', 'ROTARY DRUM MOUNT'],
  ['drive-waist', 'WAIST DRIVE', 'SPINE RINGS ABOVE'], ['drive-hipL', 'L HIP DRIVE', '49:1'], ['drive-hipR', 'R HIP DRIVE', '49:1'], ['act-knee-R', 'KNEE ACTUATOR', 'BORE 50 · ROD 28 · STROKE 180 MM'],
  ['act-hock-L', 'HOCK ACTUATOR', 'BORE 50 · ROD 28 · STROKE 180 MM'], ['drive-kneeL', 'L KNEE DRUM', '49:1'],
];

export function runLive({film = null} = {}) {
  const style = document.createElement('style');
  style.textContent = `html,body{margin:0;background:#d9dadd;overflow:hidden}#app{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}#gl{touch-action:none;cursor:grab;position:absolute;left:0;top:0;width:${W}px;height:${H}px}#gl.drag{cursor:grabbing}`;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage({canvas});
  const mech = st.mech;
  const ui = createConsole(app, mech.parts.length);

  // ------------------------------------------------------------ quality tiers
  const TIERS = [{samples: 4, ao: true, shadow: 4096, pr: 2}, {samples: 2, ao: false, shadow: 2048, pr: 1.5}, {samples: 0, ao: false, shadow: 1024, pr: 1}];
  let tier = !film && (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700) ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    void pr;
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);

  // ------------------------------------------------------------ state
  const S0 = () => ({T: 0, seq: 'STRIDE', loop: 'STRIDE', tau: 0, paused: false, k: 0, kT: 0, exMode: 'ease', exRate: 5.2, view: 'hero', iso: null, isoE: 0, sel: SEL.STRIDE, hoverPart: null, snap: true, mix: null, floor0: 0, floorNow: 0, P: null, cap: null, orbit0: 0});
  const S = S0();
  const disp = {labels: 0, xray: 0, orbit: film ? 0 : 1, exploded: 0};
  const dispE = {labels: 0, xray: 0};
  const off = {az: 0, el: 0, k: 1, px: 0, py: 0};
  const cam = {...VIEWS3.hero};
  const camTarget = () => {
    const v = {...VIEWS3[S.view]};
    v.az += off.az + (disp.orbit ? TURN * (S.T - S.orbit0) : 0);
    v.el = clamp(v.el + off.el, -20, 80);
    v.d *= off.k;
    // pan: along the camera's right and up
    const az = v.az * D2R;
    v.tx += off.px * Math.cos(az);
    v.tz -= off.px * Math.sin(az);
    v.ty += off.py;
    // follow him up in a jump
    const air = S.P ? S.P.air : 0;
    v.ty += 0.85 * air;
    v.d *= 1 + 0.15 * air;
    v.lift = air;
    if (S.k > 0.001 && !S.iso) {
      // frame every part inside the 3D viewport (the region between the side panels and above the move bar)
      const {lo, hi} = mech.bounds();
      const r = [Math.cos(az), -Math.sin(az)];
      const xs = [lo.x, hi.x].flatMap((x) => [lo.z, hi.z].map((z) => x * r[0] + z * r[1]));
      const bw = Math.max(...xs) - Math.min(...xs) + 0.7;
      const bh = hi.y - lo.y + 0.7;
      const dfit = Math.max(bh / 0.377, bw / 0.554) * 1.04;
      v.d = Math.max(v.d, dfit * Math.min(1, off.k));
      v.ty += ((lo.y + hi.y) / 2 - v.ty) * sm(S.k * 3);
    }
    if (S.iso) {
      const f = ISO[S.iso];
      const p = mech.worldPos(f.focus);
      const e = sm(S.isoE);
      v.tx += (p.x - v.tx) * e;
      v.ty += (p.y - v.ty) * e;
      v.tz += (p.z - v.tz) * e;
      v.d += (f.d * off.k - v.d) * e;
    }
    return v;
  };

  // ------------------------------------------------------------ actions (buttons, keys, the film and the hooks share these)
  const extra = (p) => {
    if (!S.iso || S.isoE <= 0 || !ISO[S.iso].sel(p)) return 0;
    return p.sub ? sm(S.isoE) : p.kind === 'drive' ? 0.45 * sm(S.isoE) : 0;
  };
  const refresh = () => {
    const mix = S.mix && {P: S.mix.P, u: (S.T - S.mix.t0) / BLEND};
    S.P = mech.setPose(S.seq, S.tau, mix);
    if (S.iso) mech.trail.visible = false; // a close-up on a part: the blade's trail would sweep across the lens
    S.floorNow = S.floor0 + S.P.travel;
    st.setTravel(S.floorNow);
    mech.applyExplode(S.k, extra);
  };
  const stopTurn = () => {
    if (!disp.orbit) return;
    off.az += TURN * (S.T - S.orbit0);
    disp.orbit = 0;
  };
  const A = {
    seq: (n, tau) => {
      S.mix = S.P && tau === undefined ? {P: {...S.P}, t0: S.T} : null;
      S.floor0 = S.floorNow;
      S.seq = n;
      S.tau = tau ?? 0;
      S.paused = tau !== undefined;
      if (!ONE_SHOT.has(n)) S.loop = n;
      if (!S.iso) S.sel = SEL[n];
      if (S.paused) refresh();
    },
    view: (n) => {
      S.view = n;
      Object.assign(off, {az: 0, el: 0, k: 1, px: 0, py: 0});
      S.orbit0 = S.T;
    },
    disp: (k, on = !disp[k]) => {
      if (k === 'exploded') {
        S.kT = on ? 1 : 0;
        S.exMode = 'ease';
        disp.exploded = on ? 1 : 0;
        return;
      }
      if (k === 'orbit') {
        if (on && !disp.orbit) S.orbit0 = S.T;
        if (!on) stopTurn();
      }
      disp[k] = on ? 1 : 0;
    },
    isolate: (n) => {
      S.iso = S.iso === n ? null : n;
      if (S.iso) S.sel = ISO[S.iso].drive;
    },
    pull: (id, snap = false) => {
      const p = mech.byId[id];
      if (!p) return;
      const t = p.module || p;
      t.pullT = t.pullT > 0.5 ? 0 : 1;
      if (snap) {
        t.raw = t.pullT;
        t.pull = t.pullT;
      }
      if (p.kind === 'drive') S.sel = id.split('-')[1];
    },
    reassemble: (snap) => {
      for (const p of mech.parts) {
        p.pullT = 0;
        if (snap) p.raw = p.pull = 0;
      }
      S.kT = 0;
      S.iso = null;
      disp.exploded = 0;
      if (snap) S.k = S.isoE = 0;
    },
  };
  const press = (key) => {
    const [g, v] = [key.split('-')[0], key.slice(key.indexOf('-') + 1)];
    if (key === 'reassemble') A.reassemble(false);
    else if (g === 'seq') A.seq(v);
    else if (g === 'view') A.view(v);
    else if (g === 'disp') A.disp(v);
    else if (g === 'iso') A.isolate(v);
  };
  for (const [key, node] of Object.entries(ui.btn)) node.addEventListener('click', () => press(key));
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  // explode slider
  {
    const d = document.createElement('div');
    Object.assign(d.style, {position: 'absolute', left: `${ui.SL.x - 10}px`, top: `${ui.SL.y - 14}px`, width: `${ui.SL.w + 20}px`, height: '32px', pointerEvents: 'auto', cursor: 'ew-resize'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      S.k = S.kT = clamp((x - ui.SL.x) / ui.SL.w);
      S.exMode = 'snap';
      disp.exploded = S.k > 0.5 ? 1 : 0;
    };
    d.addEventListener('pointerdown', (e) => {
      d.setPointerCapture(e.pointerId);
      const up = () => {
        d.removeEventListener('pointermove', move);
        d.removeEventListener('pointerup', up);
        S.exMode = 'ease';
      };
      d.addEventListener('pointermove', move);
      d.addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key === ' ' ? 'SPACE' : e.key.toUpperCase();
    const v = {1: 'hero', 2: 'front', 3: 'side', 4: 'back'}[k];
    const m = SEQS.find((q) => SEQ_KEY[q] === k);
    if (m) A.seq(m);
    else if (v) A.view(v);
    else if (k === 'E') A.disp('exploded');
    else if (k === 'X') A.disp('xray');
    else if (k === 'C') A.reassemble(false);
    else return;
    e.preventDefault();
  });
  // turn, zoom, pan (mouse and touch) and click-to-pull on the canvas
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ptrs = new Map();
  let drag = null;
  let pinch = null;
  let pointer = null;
  const pick = (cx, cy) => {
    const [x, y] = toStage(cx, cy);
    ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
    ray.setFromCamera(ndc, st.camera);
    for (const h of ray.intersectObjects(mech.pickables, false)) {
      const p = h.object.userData.part;
      if (p && p.da > 0.3 && h.object.visible) return p;
    }
    return null;
  };
  const two = () => {
    const [a, b] = [...ptrs.values()];
    return {d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]};
  };
  const panBy = (dx, dy) => {
    const k = (0.56 * cam.d) / H / scale;
    off.px = clamp(off.px - dx * k, -4, 4);
    off.py = clamp(off.py + dy * k, -1.5, 3);
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
    stopTurn();
    if (ptrs.size === 1) drag = {x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.button > 0 || e.shiftKey};
    else {
      pinch = two();
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = [e.clientX, e.clientY];
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size >= 2) {
      const n = two();
      off.k = clamp((off.k * pinch.d) / Math.max(1, n.d), 0.3, 2.4);
      panBy(n.m[0] - pinch.m[0], n.m[1] - pinch.m[1]);
      pinch = n;
    } else if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.pan) panBy(dx, dy);
      else {
        off.az -= (dx / scale) * 0.3;
        off.el = clamp(off.el + (dy / scale) * 0.2, -25, 60);
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  const endDrag = (e) => {
    if (drag && e.type === 'pointerup' && ptrs.size === 1 && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) {
      const p = pick(e.clientX, e.clientY);
      if (p) A.pull(p.id);
    }
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) {
      drag = null;
      canvas.classList.remove('drag');
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => (pointer = null));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopTurn();
    off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.3, 2.4);
  }, {passive: false});

  // ------------------------------------------------------------ labels with leaders
  const callouts = () => {
    const want = [];
    if (dispE.labels > 0.5) for (const [id, name, sub] of LABELS) want.push([id, name, sub]);
    for (const p of mech.parts) if (p.pullT > 0.5 && p.pull > 0.15 && want.length < 20) want.push([p.id, p.name, p.module ? '' : 'PULLED OUT']);
    const items = [];
    const v = new THREE.Vector3();
    for (const [id, name, sub] of want) {
      const p = mech.byId[id];
      if (!p || p.da < 0.3) continue;
      p.group.getWorldPosition(v);
      const a = st.project(v);
      if (!a || a[0] < 330 || a[0] > 1270 || a[1] < 130 || a[1] > 760) continue;
      items.push({name, sub, at: a, w: Math.max(name.length * 6.4, sub.length * 5.5) + 14});
    }
    for (const side of [-1, 1]) {
      const col = items.filter((i) => (i.at[0] < 800 ? -1 : 1) === side).sort((a, b) => a.at[1] - b.at[1]);
      let y = 150;
      for (const i of col) {
        y = Math.max(y, Math.min(i.at[1] - 12, 740));
        i.label = [side < 0 ? 336 : 1264 - i.w, y];
        y += 34;
      }
    }
    return items.filter((i) => i.label);
  };

  // ------------------------------------------------------------ the film's script
  let FI = 0;
  const filmEvent = (ev) => {
    if (ev.seq) A.seq(ev.seq);
    if (ev.view) A.view(ev.view);
    if ('orbit' in ev) A.disp('orbit', ev.orbit);
    if ('xray' in ev) A.disp('xray', ev.xray);
    if ('labels' in ev) A.disp('labels', ev.labels);
    if ('k' in ev) Object.assign(S, {kT: ev.k, exMode: 'ease', exRate: ev.rate ?? 5.2});
    if ('iso' in ev) {
      S.iso = ev.iso;
      if (ev.iso) S.sel = ISO[ev.iso].drive;
    }
    if ('cap' in ev) S.cap = ev.cap && {title: ev.cap[0].replace('{parts}', mech.parts.length), sub: ev.cap[1], t0: ev.t, dur: ev.dur ?? 3.6};
  };

  // ------------------------------------------------------------ the frame
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const tgtA = (p) => {
    const iso = S.iso && S.isoE > 0 ? ISO[S.iso] : null;
    if (iso) {
      const inG = iso.sel(p);
      if (inG && (p.kind !== 'armor' || iso.armorSolid || p.keep)) return [1, 0.5];
      return [inG ? 0.14 : 0.05, inG ? 0.8 : 0.12];
    }
    if (p.kind === 'armor' && !p.keep && dispE.xray > 0.01) return [1 - 0.87 * dispE.xray, 0.5 + 0.35 * dispE.xray];
    return [1, 0.5];
  };
  const draw = (dt, show = true) => {
    S.T += dt;
    if (film) while (FI < film.events.length && film.events[FI].t <= S.T + 1e-6) filmEvent(film.events[FI++]);
    const snap = S.snap;
    if (!S.paused) S.tau += dt;
    // a one-shot move hands back to the last looping one when it ends
    if (ONE_SHOT.has(S.seq) && !S.paused && S.tau >= SEQ[S.seq].dur) A.seq(S.loop);
    const e = (r) => (snap ? 1 : 1 - Math.exp(-dt / r));
    if (S.exMode === 'ease') S.k += Math.sign(S.kT - S.k) * Math.min(Math.abs(S.kT - S.k), dt / S.exRate);
    S.isoE += Math.sign((S.iso ? 1 : 0) - S.isoE) * Math.min(Math.abs((S.iso ? 1 : 0) - S.isoE), dt / 0.9);
    if (snap) S.isoE = S.iso ? 1 : 0;
    for (const k of ['labels', 'xray']) dispE[k] += (disp[k] - dispE[k]) * e(0.2);
    mech.tick(dt);
    S.hoverPart = show && pointer && !drag && !film ? pick(pointer[0], pointer[1]) : null;
    refresh();
    for (const p of mech.parts) {
      const [ta, te] = tgtA(p);
      p.da = p.da === undefined || snap ? ta : p.da + (ta - p.da) * e(0.18);
      p.de = p.de === undefined || snap ? te : p.de + (te - p.de) * e(0.18);
      const tgt = p === S.hoverPart || (S.hoverPart && p.module && p.module === S.hoverPart.module) ? 1 : 0;
      p.hv = (p.hv ?? 0) + (tgt - (p.hv ?? 0)) * e(0.1);
      const pulled = (p.module || p).pullT > 0.5;
      mech.style(p, Math.max(0, Math.min(1, p.da)), Math.min(1, p.de), Math.max(p.hv, pulled ? 0.5 : 0), pulled ? 1 : 0);
    }
    // camera
    const tg = camTarget();
    const k = snap ? 1 : 1 - Math.exp(-dt / (film ? 0.7 : 0.35));
    cam.az += wrap(tg.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'lift']) cam[key] = (cam[key] ?? tg[key]) + (tg[key] - (cam[key] ?? tg[key])) * k;
    S.snap = false;
    if (!show) return;
    st.frame({...cam, az: cam.az * D2R, el: cam.el * D2R});
    // console
    const R = readout(S.seq, S.tau);
    const def = DRIVES.find((d) => d.id === S.sel);
    let hover = null;
    if (S.hoverPart && pointer) {
      const [x, y] = toStage(pointer[0], pointer[1]);
      hover = {x, y, name: S.hoverPart.name};
    }
    const c = S.cap;
    const cap = c && {title: c.title, sub: c.sub, a: sm((S.T - c.t0) / 0.45) * (1 - sm((S.T - c.t0 - c.dur) / 0.45))};
    ui.update({
      drive: {def}, q: R.drives[S.sel], kin: driveKin(R.drives[S.sel].deg), gear: GEAR, kw: R.kw, out: mech.parts.filter((p) => p.e > 0.5).length, total: mech.parts.length, seq: S.seq, view: S.view,
      display: {...disp, exploded: S.kT > 0.5}, iso: S.iso, k: S.k, callouts: callouts(), hover, cap,
    });
    if (!film && tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.8) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.6 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.026 ? perf.slow + 1 : 0;
          perf.sum = perf.n = 0;
          if (perf.slow >= 3) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }
  };
  const reset = () => {
    Object.assign(S, S0());
    Object.assign(disp, {labels: 0, xray: 0, orbit: 0, exploded: 0});
    Object.assign(dispE, {labels: 0, xray: 0});
    Object.assign(off, {az: 0, el: 0, k: 1, px: 0, py: 0});
    for (const p of mech.parts) {
      p.pullT = p.raw = p.pull = p.hv = 0;
      p.da = p.de = undefined;
    }
    FI = 0;
    mech.resetFx();
  };
  const ready = st.mech.ready.then(() => warmComposer(st.renderer, st.composer, st.scene, st.camera));
  if (film) {
    // capture contract: render(t) steps the same frame logic on a 1/60 s clock from wherever it last was
    window.SIM = {
      duration: film.duration, fps: 60, ready: false,
      render(t) {
        if (t < S.T - 1e-6 || !S.P) {
          reset();
          draw(0, false);
        }
        while (t - S.T > 1 / 60 + 1e-9) draw(1 / 60, false);
        draw(Math.max(0, t - S.T), true);
        return {};
      },
    };
    ready.then(() => {
      window.SIM.render(0);
      window.SIM.ready = true;
      window.SIM_SHOWN = true;
    });
  } else {
    let last = performance.now();
    const loop = (now) => {
      draw(Math.min(0.1, Math.max(0, (now - last) / 1000)));
      last = now;
      if (!window.SIM_SHOWN) {
        window.SIM_SHOWN = true;
        dispatchEvent(new Event('simframe'));
      }
      requestAnimationFrame(loop);
    };
    ready.then(() => {
      last = performance.now();
      requestAnimationFrame(loop);
    });
  }

  // ------------------------------------------------------------ test hooks
  window.LIVE = {
    get parts() {
      return mech.parts.map((p) => ({id: p.id, name: p.name, kind: p.kind}));
    },
    gearCount: () => mech.gearCount(),
    homeError: () => mech.homeError(),
    setExplode(k) {
      S.k = S.kT = k;
      S.exMode = 'snap';
      disp.exploded = k > 0.5 ? 1 : 0;
      refresh();
    },
    setDisplay(key, on) {
      A.disp(key, !!on);
      if (key !== 'exploded' && key !== 'orbit') {
        dispE[key] = on ? 1 : 0;
        S.snap = true;
      }
    },
    isolate(n) {
      S.iso = n;
      if (n) S.sel = ISO[n].drive;
      S.snap = true;
    },
    pull(id) {
      A.pull(id, true);
      refresh();
    },
    reassemble() {
      A.reassemble(true);
      refresh();
    },
    setSeq(n, tau) {
      A.seq(n, tau);
    },
    press,
    setView(n) {
      A.view(n);
      S.snap = true;
    },
    cam(tx, ty, tz, az, el, d) {
      VIEWS3.custom = {tx, ty, tz, az, el, d};
      S.view = 'custom';
      Object.assign(off, {az: 0, el: 0, k: 1, px: 0, py: 0});
      S.snap = true;
    },
    pan(px, py, k = 1) {
      Object.assign(off, {px, py, k});
      S.snap = true;
    },
    height() {
      const b = new THREE.Box3();
      for (const p of mech.parts) if (p.id !== 'blade') b.expandByObject(p.group);
      return {min: b.min.toArray(), max: b.max.toArray(), pelvis: mech.N.pelvis.position.y};
    },
    floor(on) {
      st.setFloor(on);
    },
    K: {LEG, ARM, BODY, STANCE0, V: VIEWS3},
    renderNow() {
      S.snap = true;
      draw(0.0001);
    },
    showUI(on) {
      ui.root.style.display = on ? '' : 'none';
    },
    takeOver: stopTurn,
    st, mech, S, off, readout, SEQ, VIEWS, ISOLATES, SEQS, DISPLAY,
    get tier() {
      return tier;
    },
  };
}
