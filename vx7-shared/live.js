// The page you drive: the mech in real time, the console, orbit / zoom, click-to-pull, isolate, labels and the auto tour.
// Left alone it plays tour.js with a pointer; any click, drag, wheel or key hands control over, 25 s of quiet hands it back.
import * as THREE from 'three';
import {warmComposer} from 'teardown-kit/warm.js';
import {createConsole, DISPLAY, ISOLATES, SEQS, VIEWS} from './console.js';
import {ARM, BODY, DRIVES, GEAR, LEG, SEQ, STANCE0, driveKin, readout} from './kin.js';
import {createStage} from './stage.js';
import {cursorAt, TOUR, TOUR_DURATION} from './tour.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x) => (x = clamp(x)) * x * (3 - 2 * x);
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const VIEWS3 = {
  hero: {tx: 0, ty: 1.9, tz: 0, az: 18, el: 3, d: 8.7},
  front: {tx: 0, ty: 1.9, tz: 0, az: 0, el: 4, d: 11.6},
  side: {tx: 0, ty: 1.9, tz: 0, az: 90, el: 4, d: 11.6},
  back: {tx: 0, ty: 1.9, tz: 0, az: 180, el: 4, d: 11.6},
};
// isolate specs: which parts stay solid, where the camera flies, how close
const ISO = {
  HEAD: {sel: (p) => p.tags.includes('head'), focus: 'drive-neck', d: 2.6, armorSolid: true, drive: 'neck'},
  REACTOR: {sel: (p) => p.tags.includes('reactor'), focus: 'reactor-core', d: 2.4, drive: 'waist'},
  SHOULDER: {sel: (p) => p.tags.includes('shoulderL'), focus: 'drive-shL', d: 2.8, drive: 'shL'},
  'BLADE ARM': {sel: (p) => p.tags.includes('blade'), focus: 'drive-elR', d: 4.6, armorSolid: true, drive: 'elR'},
  HIP: {sel: (p) => p.tags.includes('hip') && !p.tags.includes('legR'), focus: 'drive-hipL', d: 3.4, drive: 'hipL'},
  KNEE: {sel: (p) => p.tags.includes('knee') && p.tags.includes('legL'), focus: 'drive-kneeL', d: 3.0, drive: 'kneeL'},
  FOOT: {sel: (p) => p.tags.includes('foot') && p.tags.includes('legL'), focus: 'toe-L2', d: 2.6, drive: 'kneeL'},
};
const LABELS = [
  ['reactor-core', 'REACTOR CORE', 'ORANGE TORUS · COOLANT LOOPS'], ['drive-neck', 'NECK DRIVE', '49:1 · 2 STAGES'], ['drive-shL', 'L SHOULDER DRIVE', 'SUN 12 · PLANET 30 · RING 72'],
  ['drive-elR', 'R ELBOW DRIVE', 'FRAMELESS BLDC + PLANETARY'], ['blade', 'PLASMA BLADE', '1.3 M · ORANGE'], ['visor', 'V VISOR', ''], ['shield-spine', 'SHIELD', 'ROTARY DRUM MOUNT'],
  ['drive-waist', 'WAIST DRIVE', 'SPINE RINGS ABOVE'], ['drive-hipL', 'L HIP DRIVE', '49:1'], ['drive-hipR', 'R HIP DRIVE', '49:1'], ['act-knee-R', 'KNEE ACTUATOR', 'BORE 50 · ROD 28 · STROKE 180 MM'],
  ['act-hock-L', 'HOCK ACTUATOR', 'BORE 50 · ROD 28 · STROKE 180 MM'], ['drive-kneeL', 'L KNEE DRUM', '49:1'],
];

export function runLive() {
  const style = document.createElement('style');
  style.textContent = `html,body{margin:0;background:#d9dadd;overflow:hidden}#app{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}#gl{touch-action:none;cursor:grab;position:absolute;left:0;top:0;width:${W}px;height:${H}px}#gl.drag{cursor:grabbing}.tourchip{position:absolute;left:1010px;top:22px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 11px;border:1px solid #e3e4e7;border-radius:4px;background:rgba(250,250,248,.95);color:#23262b;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#f08a24}.tourchip.on i{animation:blink 1.2s steps(2) infinite}@keyframes blink{50%{opacity:.15}}`;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage({canvas});
  const mech = st.mech;
  const ui = createConsole(app, mech.parts.length);
  const chip = document.createElement('div');
  chip.className = 'tourchip';
  ui.root.appendChild(chip);

  // ------------------------------------------------------------ quality tiers
  const TIERS = [{samples: 4, ao: true, shadow: 4096, pr: 2}, {samples: 2, ao: false, shadow: 2048, pr: 1.5}, {samples: 0, ao: false, shadow: 1024, pr: 1}];
  let tier = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700 ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);

  // ------------------------------------------------------------ state
  const S = {T: 0, seq: 'STANCE', tau: 0, paused: false, k: 0, kT: 0, exMode: 'ease', view: 'hero', iso: null, isoE: 0, sel: 'shL', hoverPart: null, hover: 0, snap: false};
  const disp = {labels: 0, xray: 0, orbit: 0, exploded: 0};
  const dispE = {labels: 0, xray: 0};
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEWS3.hero, az: VIEWS3.hero.az};
  const AP = {on: true, t0: 0, idx: 0};
  let lastInput = 0;
  let spots = {};
  const camTarget = () => {
    const v = {...VIEWS3[S.view]};
    v.az += off.az + (disp.orbit ? 14 * (S.T - (S.orbit0 ?? 0)) : 0);
    v.el = clamp(v.el + off.el, -20, 80);
    v.d *= off.k;
    if (S.k > 0.001 && !S.iso) {
      // frame every part inside the 3D viewport (the region between the side panels and above the slider)
      const {lo, hi} = mech.bounds();
      const az = v.az * D2R;
      const r = [Math.cos(az), -Math.sin(az)];
      const xs = [lo.x, hi.x].flatMap((x) => [lo.z, hi.z].map((z) => x * r[0] + z * r[1]));
      const bw = Math.max(...xs) - Math.min(...xs) + 0.7;
      const bh = hi.y - lo.y + 0.7;
      const dfit = Math.max(bh / 0.377, bw / 0.554) * 1.04;
      v.d = Math.max(v.d, dfit);
      v.ty += ((lo.y + hi.y) / 2 - v.ty) * sm(S.k * 3);
    }
    if (S.iso) {
      const f = ISO[S.iso];
      const p = mech.worldPos(f.focus);
      const e = sm(S.isoE);
      v.tx += (p.x - v.tx) * e;
      v.ty += (p.y - v.ty) * e;
      v.tz += (p.z - v.tz) * e;
      v.d += (f.d - v.d) * e;
    }
    return v;
  };

  // ------------------------------------------------------------ actions (buttons, hooks and the tour share these)
  const refresh = () => {
    mech.setPose(S.seq, S.tau);
    mech.applyExplode(S.k, extra);
  };
  const extra = (p) => {
    if (!S.iso || S.isoE <= 0 || !ISO[S.iso].sel(p)) return 0;
    return p.sub ? sm(S.isoE) : p.kind === 'drive' ? 0.45 * sm(S.isoE) : 0;
  };
  const A = {
    seq: (n, tau) => {
      S.seq = n;
      S.tau = tau ?? 0;
      S.paused = tau !== undefined;
      if (S.paused) refresh();
    },
    view: (n) => {
      S.view = n;
      off.az = off.el = 0;
      off.k = 1;
      S.orbit0 = S.T;
    },
    disp: (k, on = !disp[k]) => {
      if (k === 'exploded') {
        S.kT = on ? 1 : 0;
        S.exMode = 'ease';
        disp.exploded = on ? 1 : 0;
        return;
      }
      disp[k] = on ? 1 : 0;
      if (k === 'orbit') S.orbit0 = S.T;
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
  const resetTour = () => {
    A.reassemble(false);
    S.iso = null;
    disp.labels = disp.xray = disp.orbit = 0;
    A.seq('STANCE');
    A.view('hero');
  };
  const takeOver = () => {
    lastInput = S.T;
    AP.on = false;
  };
  const startTour = () => {
    resetTour();
    Object.assign(AP, {on: true, t0: S.T, idx: 0});
  };
  for (const [key, node] of Object.entries(ui.btn))
    node.addEventListener('click', () => {
      takeOver();
      press(key);
    });
  chip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = S.T;
    AP.on ? takeOver() : startTour();
  });
  addEventListener('pointerdown', (e) => e.target !== chip && takeOver());
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  // explode slider
  {
    const d = document.createElement('div');
    Object.assign(d.style, {position: 'absolute', left: `${ui.SL.x - 10}px`, top: '812px', width: `${ui.SL.w + 20}px`, height: '34px', pointerEvents: 'auto', cursor: 'ew-resize'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      S.k = S.kT = clamp((x - ui.SL.x) / ui.SL.w);
      S.exMode = 'snap';
      disp.exploded = S.k > 0.5 ? 1 : 0;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        S.exMode = 'ease';
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    takeOver();
    const k = e.key.toLowerCase();
    const v = {1: 'hero', 2: 'front', 3: 'side', 4: 'back'}[k];
    if (v) A.view(v);
    else if (k === 'e') A.disp('exploded');
    else if (k === 'x') A.disp('xray');
    else if (k === 'l') A.disp('labels');
    else if (k === 'r') A.reassemble(false);
    else if (k === ' ') S.paused = !S.paused;
    else return;
    e.preventDefault();
  });
  // orbit, wheel, hover and click-to-pull on the canvas
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;
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
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = [e.clientX, e.clientY];
    if (!drag) return;
    off.az -= ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -25, 60);
    drag.x = e.clientX;
    drag.y = e.clientY;
    lastInput = S.T;
  });
  const endDrag = (e) => {
    if (drag && e.type === 'pointerup' && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) {
      const p = pick(e.clientX, e.clientY);
      if (p) A.pull(p.id);
    }
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => (pointer = null));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    takeOver();
    off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.35, 2.2);
  }, {passive: false});

  // ------------------------------------------------------------ labels with leaders
  const callouts = () => {
    const want = [];
    if (dispE.labels > 0.5) for (const [id, name, sub] of LABELS) want.push([id, name, sub]);
    for (const p of mech.parts) if ((p.pullT > 0.5 && p.pull > 0.15) && want.length < 20) want.push([p.id, p.name, p.module ? '' : 'PULLED OUT']);
    const items = [];
    const v = new THREE.Vector3();
    for (const [id, name, sub] of want) {
      const p = mech.byId[id];
      if (!p || p.da < 0.3) continue;
      p.group.getWorldPosition(v);
      const a = st.project(v);
      if (!a || a[0] < 300 || a[0] > 1300 || a[1] < 100 || a[1] > 780) continue;
      items.push({name, sub, at: a, w: Math.max(name.length * 6.4, sub.length * 5.5) + 14});
    }
    for (const side of [-1, 1]) {
      const col = items.filter((i) => (i.at[0] < 800 ? -1 : 1) === side).sort((a, b) => a.at[1] - b.at[1]);
      let y = 110;
      for (const i of col) {
        y = Math.max(y, Math.min(i.at[1] - 12, 770));
        i.label = [side < 0 ? 306 : 1296 - i.w, y];
        y += 34;
      }
    }
    return items.filter((i) => i.label);
  };

  // ------------------------------------------------------------ the frame
  let last = performance.now();
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
  const draw = (dt, now) => {
    S.T += dt;
    const snap = S.snap;
    if (!S.paused) S.tau += dt;
    const e = (r) => (snap ? 1 : 1 - Math.exp(-dt / r));
    // tour
    if (AP.on) {
      const c = S.T - AP.t0;
      if (c > TOUR_DURATION) startTour();
      while (AP.idx < TOUR.length && TOUR[AP.idx].t <= c) press(TOUR[AP.idx++].key);
    } else if (S.T - lastInput > IDLE) startTour();
    // explode: eased toward its target, or driven by the slider
    if (S.exMode === 'ease') S.k += Math.sign(S.kT - S.k) * Math.min(Math.abs(S.kT - S.k), dt / 5.2);
    S.isoE += Math.sign((S.iso ? 1 : 0) - S.isoE) * Math.min(Math.abs((S.iso ? 1 : 0) - S.isoE), dt / 0.9);
    if (snap) S.isoE = S.iso ? 1 : 0;
    for (const k of ['labels', 'xray']) dispE[k] += (disp[k] - dispE[k]) * e(0.2);
    mech.tick(dt);
    // hover
    if (pointer && !drag) {
      const h = pick(pointer[0], pointer[1]);
      S.hoverPart = h;
    } else if (!pointer) S.hoverPart = null;
    refresh();
    const q = readout(S.seq, S.tau).drives;
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
    const k = snap ? 1 : 1 - Math.exp(-dt / (AP.on ? 0.3 : 0.4));
    cam.az += wrap(tg.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd']) cam[key] += (tg[key] - cam[key]) * k;
    S.snap = false;
    st.frame({...cam, az: cam.az * D2R, el: cam.el * D2R});
    // console
    const R = readout(S.seq, S.tau);
    const id = S.sel;
    const def = DRIVES.find((d) => d.id === id);
    const out = mech.parts.filter((p) => p.e > 0.5).length;
    const hp = S.hoverPart;
    let hover = null;
    if (hp && pointer) {
      const [x, y] = toStage(pointer[0], pointer[1]);
      hover = {x, y, name: hp.name};
    }
    let cursor = {x: -99, y: -99, press: false, ring: 0, ringX: 0, ringY: 0};
    if (AP.on) cursor = cursorAt(S.T - AP.t0, spots);
    ui.update({
      drive: {def}, q: R.drives[id], kin: driveKin(R.drives[id].deg), gear: GEAR, kw: R.kw, out, total: mech.parts.length, seq: S.seq, view: S.view,
      display: {...disp, labels: disp.labels, exploded: S.kT > 0.5}, iso: S.iso, k: S.k, callouts: callouts(), hover, cursor,
    });
    void q;
    if (chip.classList.contains('on') !== AP.on || !chip.firstChild) {
      chip.classList.toggle('on', AP.on);
      chip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (tier < TIERS.length - 1) {
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
    void now;
  };
  const loop = (now) => {
    draw(Math.min(0.1, Math.max(0, (now - last) / 1000)), now);
    last = now;
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(loop);
  };
  startTour();
  S.snap = true;
  // the chip's first state and the pointer's spots need the laid-out buttons
  spots = ui.spots();
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => {
    last = performance.now();
    requestAnimationFrame(loop);
  });

  // ------------------------------------------------------------ test hooks
  window.LIVE = {
    parts: mech.parts.map((p) => ({id: p.id, name: p.name, kind: p.kind})),
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
      if (key !== 'exploded') {
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
    setView(n) {
      A.view(n);
      S.snap = true;
    },
    cam(tx, ty, tz, az, el, d) {
      VIEWS3.custom = {tx, ty, tz, az, el, d};
      S.view = 'custom';
      off.az = off.el = 0;
      off.k = 1;
      S.snap = true;
    },
    height() {
      const b = new THREE.Box3();
      for (const p of mech.parts) if (p.kind !== 'armor' || p.id !== 'blade') b.expandByObject(p.group);
      return {min: b.min.toArray(), max: b.max.toArray(), pelvis: mech.N.pelvis.position.y};
    },
    floor(on) {
      st.setFloor(on);
    },
    K: {LEG, ARM, BODY, STANCE0, V: VIEWS3},
    renderNow() {
      S.snap = true;
      draw(0.0001, 0);
    },
    showUI(on) {
      ui.root.style.display = on ? '' : 'none';
    },
    takeOver,
    startTour,
    st, mech, S, readout, SEQ, VIEWS, ISOLATES, SEQS, DISPLAY,
    get tier() {
      return tier;
    },
  };
}
