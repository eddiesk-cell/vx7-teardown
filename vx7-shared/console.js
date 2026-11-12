// The 1600 x 900 overlay, laid out as a product page: name and tagline, the spec sheet and live telemetry on the left,
// "look inside" (x-ray, explode, isolate, views) on the right, the move bar under the mech, callouts with leaders and,
// in the film, a caption. update(s) redraws it from one state.
export const C = {ink: '#1f2226', mute: '#80848b', faint: '#d2d4d8', line: 'rgba(255,255,255,.7)', panel: 'rgba(250,250,249,.82)', or: '#f08a24'};
export const MOVES = ['STANCE', 'STRIDE', 'RUN', 'JUMP', 'ROLL'];
export const ACTIONS = ['SLASH', 'BLOCK', 'SHOOT', 'FIGHT'];
export const SEQS = [...MOVES, ...ACTIONS];
// the keyboard, like a game: one key per move
export const SEQ_KEY = {STANCE: 'I', STRIDE: 'W', RUN: 'R', JUMP: 'SPACE', ROLL: 'Q', SLASH: 'J', BLOCK: 'K', SHOOT: 'L', FIGHT: 'F'};
const SEQ_NAME = {STANCE: 'IDLE', STRIDE: 'WALK', RUN: 'RUN', JUMP: 'JUMP', ROLL: 'ROLL', SLASH: 'SLASH', BLOCK: 'BLOCK', SHOOT: 'SHOOT', FIGHT: 'COMBO'};
const SEQ_LABEL = Object.fromEntries(SEQS.map((k) => [k, `${SEQ_NAME[k]}<i>${SEQ_KEY[k] === 'SPACE' ? '␣' : SEQ_KEY[k]}</i>`]));
export const VIEWS = ['front', 'side', 'back', 'hero'];
export const VIEW_LABEL = {front: 'FRONT', side: 'SIDE', back: 'BACK', hero: '3/4'};
export const DISPLAY = ['xray', 'labels', 'orbit', 'exploded'];
export const DISPLAY_LABEL = {xray: 'X-RAY ARMOR', labels: 'LABELS', orbit: 'TURNTABLE', exploded: 'EXPLODE ALL'};
export const ISOLATES = ['HEAD', 'REACTOR', 'SHOULDER', 'BLADE ARM', 'HIP', 'KNEE', 'FOOT'];
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:14px;box-shadow:0 6px 28px rgba(40,44,52,.08);backdrop-filter:blur(10px)}
.ph{position:absolute;font:700 10px 'JetBrains Mono',monospace;letter-spacing:2px;color:${C.mute}}
.sm{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:${C.mute};text-transform:uppercase;white-space:nowrap;position:absolute}
.kv{position:absolute;left:0;right:0;display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(0,0,0,.06);padding-top:7px}
.kv span{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:${C.mute}}
.kv b{font-size:12.5px;font-weight:600;letter-spacing:-.1px}
.bt{position:absolute;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:15px;background:rgba(255,255,255,.9);font:600 9.6px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink};white-space:nowrap;pointer-events:auto;cursor:pointer;box-sizing:border-box}
.bt:hover{border-color:${C.or}}
.mv{height:42px;border-radius:21px;font-size:11px;letter-spacing:1.8px;box-shadow:0 4px 16px rgba(40,44,52,.08)}
.mv i{font-style:normal;font-size:8px;letter-spacing:0;margin-left:7px;padding:1px 4px;border:1px solid currentColor;border-radius:3px;opacity:.5}
.call{position:absolute;white-space:nowrap}
.call b{display:flex;align-items:center;gap:6px;font:700 9.6px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink}}
.call b i{display:block;width:6px;height:6px;border-radius:50%;background:${C.or}}
.call span{display:block;font:500 8px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.mute};margin-top:2px}
.tip{position:absolute;z-index:40;padding:5px 9px;background:${C.ink};color:#fff;font:600 9.5px 'JetBrains Mono',monospace;letter-spacing:1px;border-radius:6px;white-space:nowrap;display:none}
.vxcap{position:absolute;left:800px;top:30px;transform:translateX(-50%);text-align:center;white-space:nowrap}
.vxcap b{display:block;font-size:32px;font-weight:700;letter-spacing:-.8px;line-height:1}
.vxcap span{display:block;margin-top:8px;font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:2.4px;color:${C.or}}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

export function createConsole(app, total) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el('<div class="ui"></div>');
  app.appendChild(ui);
  const add = (h, to = ui) => to.appendChild(el(h));
  const panel = (x, y, w, h, title) => {
    const p = add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="ph" style="left:${x + 18}px;top:${y + 16}px">${title}</div>`);
    return p;
  };
  const btn = {};
  // a row of buttons in equal columns, wrapping every `cols`
  const grid = (keys, labels, x0, y0, w, prefix, cols, h = 28, cls = 'bt') => {
    const bw = (w - (cols - 1) * 7) / cols;
    keys.forEach((k, i) => {
      btn[prefix + k] = add(`<div class="${cls}" style="left:${x0 + (i % cols) * (bw + 7)}px;top:${y0 + Math.floor(i / cols) * (h + 7)}px;width:${bw}px">${labels[k]}</div>`);
    });
  };

  // ---- name, tagline, provenance
  add(`<div class="mo" style="position:absolute;left:44px;top:34px;font-size:10px;font-weight:700;letter-spacing:2.6px;color:${C.or}">VX-7 · HEAVY DUELLIST FRAME</div>`);
  add(`<div style="position:absolute;left:42px;top:50px;font-size:40px;font-weight:700;letter-spacing:-1.2px;line-height:1">VX-7 Duelist</div>`);
  add(`<div style="position:absolute;left:44px;top:98px;font-size:13.5px;color:#5d6168;letter-spacing:-.1px">A 3.6 m bipedal duellist. Ten planetary drives. One plasma blade.</div>`);
  add(`<div class="sm" style="right:44px;top:38px;text-align:right;line-height:15px;letter-spacing:2px">PAINTED 3D SHELL<br>INSIDES BUILT FROM CODE<br>ALL MADE LOCALLY</div>`);

  // ---- specifications
  panel(40, 140, 272, 244, 'SPECIFICATIONS');
  const specs = add(`<div style="position:absolute;left:58px;top:178px;width:236px"></div>`);
  const kv = (k, v, y) => add(`<div class="kv" style="top:${y}px"><span>${k}</span><b>${v}</b></div>`, specs);
  [['HEIGHT', '3.6 m'], ['DRIVES', '10 × planetary 49:1'], ['GEAR SET', 'sun 12 · planet 30 · ring 72'], ['HYDRAULICS', '6 × Ø50 · 180 mm'], ['REACTOR', '40 kW base'], ['BLADE', '1.3 m plasma'], ['PARTS', `${total}`]].forEach(([k, v], i) => kv(k, v, i * 28));
  const partsV = specs.lastElementChild.querySelector('b');

  // ---- live telemetry: the selected drive's gears and numbers, and the reactor
  panel(40, 398, 272, 350, 'LIVE TELEMETRY');
  const dName = add(`<div style="position:absolute;left:58px;top:430px;font-size:18px;font-weight:700;letter-spacing:-.3px"></div>`);
  const dSub = add(`<div class="sm" style="left:58px;top:455px"></div>`);
  const sch = add(`<svg style="position:absolute;left:58px;top:474px" width="236" height="96"></svg>`);
  const rows = ['JOINT ANGLE', 'MOTOR SPEED', 'TORQUE OUT'].map((n, i) => {
    const r = add(`<div class="kv" style="left:58px;right:auto;width:236px;top:${580 + i * 24}px"><span>${n}</span><b class="mo" style="font-size:11.5px"></b></div>`);
    return r.querySelector('b');
  });
  const kwV = add(`<div style="position:absolute;left:58px;top:660px;font-size:28px;font-weight:700;letter-spacing:-.5px"></div>`);
  add(`<div class="sm" style="left:168px;top:674px">KW · REACTOR</div>`);
  add(`<div style="position:absolute;left:58px;top:702px;width:236px;height:5px;background:rgba(0,0,0,.07);border-radius:3px"></div>`);
  const kwB = add(`<div style="position:absolute;left:58px;top:702px;height:5px;background:${C.or};border-radius:3px"></div>`);
  add(`<div class="sm" style="left:58px;top:716px">40 KW BASE + JOINT POWER</div>`);

  // ---- look inside
  panel(1288, 140, 272, 466, 'LOOK INSIDE');
  grid(DISPLAY, DISPLAY_LABEL, 1306, 180, 236, 'disp-', 2);
  add(`<div class="sm" style="left:1306px;top:262px">EXPLODE</div>`);
  const SL = {x: 1306, y: 288, w: 236};
  add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y}px;width:${SL.w}px;height:4px;background:rgba(0,0,0,.08);border-radius:2px"></div>`);
  const slF = add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y}px;height:4px;background:${C.or};border-radius:2px"></div>`);
  const slK = add(`<div style="position:absolute;top:${SL.y - 7}px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,.15)"></div>`);
  const slV = add(`<div class="mo" style="position:absolute;right:58px;top:258px;font-size:11px;font-weight:700"></div>`);
  const stages = [['ARMOR', 0, 0.35], ['DRIVES', 0.35, 0.7], ['GEARS', 0.7, 1]].map(([n, a, b]) => {
    const x = SL.x + a * SL.w;
    if (a) add(`<div style="position:absolute;left:${x}px;top:${SL.y - 5}px;width:1px;height:14px;background:${C.faint}"></div>`);
    return add(`<div class="sm" style="left:${x + (b - a) * SL.w * 0.5 - 18}px;top:${SL.y + 14}px;letter-spacing:1.6px">${n}</div>`);
  });
  btn.reassemble = add(`<div class="bt" style="left:1306px;top:326px;width:236px">REASSEMBLE ALL</div>`);
  add(`<div class="sm" style="left:1306px;top:370px">ISOLATE A SYSTEM</div>`);
  grid(ISOLATES, Object.fromEntries(ISOLATES.map((s) => [s, s])), 1306, 388, 236, 'iso-', 2);
  add(`<div class="sm" style="left:1306px;top:538px">VIEW</div>`);
  grid(VIEWS, VIEW_LABEL, 1306, 556, 236, 'view-', 4);

  // ---- the move bar under the mech
  add(`<div class="sm" style="left:360px;top:768px;letter-spacing:2.6px">MOVE</div>`);
  grid(MOVES, SEQ_LABEL, 358, 786, 478, 'seq-', 5, 42, 'bt mv');
  add(`<div class="sm" style="left:864px;top:768px;letter-spacing:2.6px;color:${C.or}">FIGHT</div>`);
  grid(ACTIONS, SEQ_LABEL, 862, 786, 381, 'seq-', 4, 42, 'bt mv');
  add(`<div class="sm" style="left:800px;top:846px;transform:translateX(-50%);letter-spacing:1.8px">KEYS ON EACH BUTTON · DRAG TO TURN · SCROLL OR PINCH TO ZOOM · RIGHT-DRAG OR SHIFT-DRAG TO PAN · CLICK A PART TO PULL IT OUT</div>`);
  add(`<div class="sm" style="left:44px;top:874px;letter-spacing:2px">VX-7 · MIT · BUILT WITH TEARDOWN BY ELVAROFFICIAL</div>`);

  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const tip = add('<div class="tip"></div>');
  const cap = add('<div class="vxcap" style="opacity:0"><b></b><span></span></div>');
  const cache = new WeakMap();
  const set = (n, t) => {
    if (cache.get(n) !== t) {
      cache.set(n, t);
      n.textContent = t;
    }
  };
  const on = (k, v) => {
    const b = btn[k];
    if (!b) return;
    b.style.background = v ? C.or : '';
    b.style.color = v ? '#fff' : '';
    b.style.borderColor = v ? C.or : '';
  };
  return {
    btn, root: ui, SL, tip,
    update(s) {
      const d = s.drive;
      set(dName, d.def.name + ' DRIVE');
      set(dSub, `2-STAGE PLANETARY · ${s.gear.total}:1`);
      const q = s.q;
      set(rows[0], `${q.deg.toFixed(1)}°`);
      set(rows[1], `${Math.round(q.rpm)} rpm`);
      set(rows[2], `${Math.round(q.torque)} N·m`);
      // live gear schematic from the same angles the 3D gears use
      const k = s.kin;
      const R = (a, cx, cy) => `rotate(${(a % 360).toFixed(1)} ${cx} ${cy})`;
      let h = `<circle cx="48" cy="48" r="44" fill="none" stroke="${C.ink}" stroke-width="1.2"/><circle cx="48" cy="48" r="40" fill="none" stroke="${C.faint}" stroke-width="1" stroke-dasharray="2 3"/>`;
      h += `<g transform="${R(k.sun1, 48, 48)}"><circle cx="48" cy="48" r="9" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/><path d="M48 48V39" stroke="${C.or}" stroke-width="2"/></g>`;
      for (let i = 0; i < 3; i++) {
        const a = k.carrier1 + i * 120;
        const px = 48 + 24 * Math.sin((a * Math.PI) / 180);
        const py = 48 - 24 * Math.cos((a * Math.PI) / 180);
        h += `<g transform="${R(k.planet1, px, py)}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="13" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/><path d="M${px.toFixed(1)} ${py.toFixed(1)}v-11" stroke="${i ? C.mute : C.or}" stroke-width="1.6"/></g>`;
      }
      const tx = (y, t, c = C.mute) => `<text x="108" y="${y}" font-size="8" letter-spacing="1" fill="${c}" font-family="JetBrains Mono">${t}</text>`;
      h += tx(18, `SUN ${Math.round(k.sun1 % 360)}°`) + tx(36, `CARRIER ${Math.round(k.carrier1 % 360)}°`) + tx(54, `OUTPUT ${Math.round(k.carrier2)}°`) + tx(80, 'STAGE 1 SHOWN', C.or);
      sch.innerHTML = h;
      set(kwV, `${s.kw.toFixed(1)}`);
      kwB.style.width = `${(Math.min(1, s.kw / 160) * 236).toFixed(1)}px`;
      set(partsV, s.out ? `${s.out} out of ${s.total}` : `${s.total}`);
      for (const q2 of SEQS) on('seq-' + q2, s.seq === q2);
      for (const v of VIEWS) on('view-' + v, s.view === v);
      for (const v of DISPLAY) on('disp-' + v, !!s.display[v]);
      for (const v of ISOLATES) on('iso-' + v, s.iso === v);
      slF.style.width = `${(s.k * SL.w).toFixed(1)}px`;
      slK.style.left = `${(SL.x + s.k * SL.w).toFixed(1)}px`;
      set(slV, `${Math.round(s.k * 100)}%`);
      stages.forEach((n, i) => (n.style.color = s.k > [0, 0.35, 0.7][i] ? C.or : C.mute));
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const ex = lx > ax ? lx - 6 : lx + c.w + 6;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${(ly + 6).toFixed(1)}" fill="none" stroke="${C.or}" stroke-width=".9"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.4" fill="${C.or}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 1).toFixed(1)}px"><b><i></i>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      if (s.hover) {
        tip.style.display = 'block';
        tip.style.left = `${s.hover.x + 14}px`;
        tip.style.top = `${s.hover.y + 14}px`;
        set(tip, s.hover.name);
      } else tip.style.display = 'none';
      cap.style.opacity = s.cap ? s.cap.a.toFixed(3) : '0';
      if (s.cap) {
        set(cap.firstChild, s.cap.title);
        set(cap.lastChild, s.cap.sub);
      }
    },
  };
}
