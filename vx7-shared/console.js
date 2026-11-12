// The 1600 x 900 overlay: title, selected-drive and reactor panels, sequence / view / display / isolate buttons, the
// explode slider with its stage labels, callouts with leaders and the tour's pointer. update(s) redraws it from one state.
export const C = {ink: '#23262b', mute: '#8a8d93', faint: '#d4d6da', line: '#e3e4e7', panel: 'rgba(250,250,248,.93)', or: '#f08a24', green: '#2f9e6b'};
export const SEQS = ['STANCE', 'STRIDE', 'STRIKE'];
export const VIEWS = ['hero', 'front', 'side', 'back'];
export const VIEW_LABEL = {hero: 'HERO', front: 'FRONT', side: 'SIDE', back: 'BACK'};
export const DISPLAY = ['labels', 'xray', 'orbit', 'exploded'];
export const DISPLAY_LABEL = {labels: 'LABELS', xray: 'X-RAY ARMOR', orbit: 'ORBIT', exploded: 'EXPLODED'};
export const ISOLATES = ['HEAD', 'REACTOR', 'SHOULDER', 'BLADE ARM', 'HIP', 'KNEE', 'FOOT'];
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 12px rgba(40,44,52,.08)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.8px}
.ph i{display:block;width:3px;height:13px;background:${C.or}}
.pn{position:absolute;font:500 9.5px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.6px;color:${C.mute};text-transform:uppercase;white-space:nowrap;position:absolute}
.bt{position:absolute;height:23px;padding:0 10px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:4px;background:#fff;font:700 9.4px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink};white-space:nowrap;pointer-events:auto;cursor:pointer;box-sizing:border-box}
.bt:hover{filter:brightness(.96)}
.call{position:absolute;white-space:nowrap}
.call b{display:flex;align-items:center;gap:6px;font:700 9.6px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink}}
.call b i{display:block;width:6px;height:6px;background:${C.or}}
.call span{display:block;font:500 8px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.mute};margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.or};opacity:0;z-index:49}
.tip{position:absolute;z-index:40;padding:4px 8px;background:#23262b;color:#fff;font:600 9.5px 'JetBrains Mono',monospace;letter-spacing:1px;border-radius:3px;white-space:nowrap;display:none}
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
  const add = (h) => ui.appendChild(el(h));
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="ph" style="left:${x + 14}px;top:${y + 13}px"><i></i>${title}</div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 15}px">${n}</div>`);
  };
  const btn = {};
  const row = (keys, labels, x0, y, wmax, prefix, cols = 0) => {
    let x = x0;
    let yy = y;
    for (const k of keys) {
      const w = cols ? Math.floor((wmax - (cols - 1) * 6) / cols) : Math.round(labels[k].length * 7.1 + 22);
      if (x + w > x0 + wmax + 1) {
        x = x0;
        yy += 29;
      }
      btn[prefix + k] = add(`<div class="bt" style="left:${x}px;top:${yy}px;width:${w}px">${labels[k]}</div>`);
      x += w + 6;
    }
  };

  // header
  add(`<div style="position:absolute;left:0;top:0;width:160px;height:78px;background:${C.or}"></div>`);
  add(`<div class="mo" style="position:absolute;left:30px;top:28px;color:#fff;font-size:20px;font-weight:700;letter-spacing:5px">VX-7</div>`);
  add(`<div class="sm" style="left:182px;top:16px;letter-spacing:2.4px">HEAVY DUELLIST FRAME · BIPEDAL</div>`);
  add(`<div style="position:absolute;left:181px;top:30px;font-size:30px;font-weight:700;letter-spacing:-.6px;line-height:1">VX-7 DUELIST · TEARDOWN <span style="color:${C.or};font-weight:400">/</span></div>`);
  add(`<div class="mo" style="position:absolute;left:182px;top:68px;font-size:10.5px;letter-spacing:2.2px;color:#666b73">10 PLANETARY DRIVES · 49:1 · HYDRAULIC KNEES AND HOCKS · PLASMA BLADE</div>`);
  add(`<div class="mo" style="position:absolute;left:1352px;top:34px;color:${C.or};font-size:12px;letter-spacing:-1px">//////</div>`);
  add(`<div class="sm" style="left:1418px;top:30px;line-height:14px;letter-spacing:2.2px">PAINTED 3D SHELL<br>INSIDES BUILT FROM CODE<br>ALL MADE LOCALLY</div>`);

  // 01 selected drive
  panel(24, 92, 262, 318, 'SELECTED DRIVE', '01');
  const dName = add(`<div style="position:absolute;left:38px;top:122px;font-size:19px;font-weight:700;letter-spacing:-.3px"></div>`);
  const dSub = add(`<div class="sm" style="left:39px;top:148px"></div>`);
  const sch = add(`<svg style="position:absolute;left:38px;top:166px" width="234" height="96"></svg>`);
  const rows = ['JOINT ANGLE', 'JOINT SPEED', 'MOTOR SPEED', 'TORQUE OUT', 'MOTOR TORQUE'].map((n, i) => {
    const y = 270 + i * 20;
    add(`<div class="sm" style="left:38px;top:${y}px">${n}</div>`);
    return add(`<div class="mo" style="position:absolute;right:${1600 - 272}px;top:${y - 2}px;font-size:11px;font-weight:600"></div>`);
  });
  const dTeeth = add(`<div class="sm" style="left:38px;top:376px;letter-spacing:1.2px"></div>`);
  // 02 reactor
  panel(24, 424, 262, 112, 'REACTOR', '02');
  const kwV = add(`<div style="position:absolute;left:38px;top:450px;font-size:30px;font-weight:700"></div>`);
  add(`<div class="sm" style="left:152px;top:466px">KW OUTPUT</div>`);
  add(`<div style="position:absolute;left:38px;top:496px;width:234px;height:6px;background:#ececee;border-radius:3px"></div>`);
  const kwB = add(`<div style="position:absolute;left:38px;top:496px;height:6px;background:${C.or};border-radius:3px"></div>`);
  add(`<div class="sm" style="left:38px;top:510px">40 KW BASE + JOINT POWER</div>`);
  // 03 sequence
  panel(24, 550, 262, 82, 'SEQUENCE', '03');
  row(SEQS, Object.fromEntries(SEQS.map((s) => [s, s])), 38, 580, 234, 'seq-', 3);
  // 04 parts
  panel(24, 646, 262, 96, 'PARTS', '04');
  const outV = add(`<div style="position:absolute;left:38px;top:672px;font-size:22px;font-weight:700"></div>`);
  add(`<div class="sm" style="left:38px;top:702px">PARTS OUT / TOTAL</div>`);
  btn.reassemble = add(`<div class="bt" style="left:152px;top:676px;width:120px">REASSEMBLE ALL</div>`);
  // 05 views, 06 display, 07 isolate
  panel(1314, 92, 262, 84, 'VIEWS', '05');
  row(VIEWS, VIEW_LABEL, 1328, 122, 234, 'view-', 4);
  panel(1314, 190, 262, 112, 'DISPLAY', '06');
  row(DISPLAY, DISPLAY_LABEL, 1328, 220, 234, 'disp-', 2);
  panel(1314, 316, 262, 156, 'ISOLATE', '07');
  row(ISOLATES, Object.fromEntries(ISOLATES.map((s) => [s, s])), 1328, 346, 234, 'iso-', 2);
  // 08 explode
  panel(430, 772, 740, 96, 'EXPLODE', '08');
  const SL = {x: 460, w: 680};
  add(`<div style="position:absolute;left:${SL.x}px;top:828px;width:${SL.w}px;height:4px;background:#ececee;border-radius:2px"></div>`);
  const slF = add(`<div style="position:absolute;left:${SL.x}px;top:828px;height:4px;background:${C.or};border-radius:2px"></div>`);
  const slK = add(`<div style="position:absolute;top:821px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const stages = [['ARMOR', 0, 0.35], ['DRIVES', 0.35, 0.7], ['GEARS', 0.7, 1]].map(([n, a, b]) => {
    const x = SL.x + a * SL.w;
    add(`<div style="position:absolute;left:${x}px;top:822px;width:1px;height:16px;background:${C.faint}"></div>`);
    return add(`<div class="sm" style="left:${x + (b - a) * SL.w * 0.5 - 20}px;top:846px;letter-spacing:2px">${n}</div>`);
  });
  const slV = add(`<div class="mo" style="position:absolute;left:1086px;top:790px;font-size:12px;font-weight:700"></div>`);
  add(`<div class="sm" style="left:27px;top:882px;letter-spacing:2.2px">VX-7 TEARDOWN · MIT · BUILT WITH TEARDOWN BY ELVAROFFICIAL</div>`);
  add(`<div class="sm" style="right:28px;top:882px;letter-spacing:2.2px">DRAG ORBIT · WHEEL ZOOM · CLICK A PART TO PULL IT <span style="color:${C.or}">//////</span></div>`);

  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const tip = add('<div class="tip"></div>');
  const ring = add('<div class="ring"></div>');
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    const a = app.getBoundingClientRect();
    const sc = a.width / 1600;
    return [(r.left - a.left + r.width / 2) / sc, (r.top - a.top + r.height / 2) / sc];
  };
  const spots = () => Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const cache = new WeakMap();
  const set = (n, t) => {
    if (cache.get(n) !== t) {
      cache.set(n, t);
      n.textContent = t;
    }
  };
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(1)}px, ${(c.y - 2).toFixed(1)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String((c.ring ?? 0) * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - (c.ring ?? 0))).toFixed(3)})`;
  };
  const on = (k, v) => {
    const b = btn[k];
    if (!b) return;
    b.style.background = v ? C.or : '#fff';
    b.style.color = v ? '#fff' : C.ink;
    b.style.borderColor = v ? C.or : C.faint;
  };
  return {
    btn, spots, root: ui, SL, tip, pointer,
    update(s) {
      const d = s.drive;
      set(dName, d.def.name + ' DRIVE');
      set(dSub, `PLANETARY 2 STAGE · RATIO ${s.gear.total}:1`);
      const q = s.q;
      set(rows[0], `${q.deg.toFixed(1)}°`);
      set(rows[1], `${q.degps.toFixed(1)} °/s`);
      set(rows[2], `${Math.round(q.rpm)} rpm`);
      set(rows[3], `${Math.round(q.torque)} N·m`);
      set(rows[4], `${(q.motorTorque).toFixed(1)} N·m`);
      set(dTeeth, `SUN ${s.gear.Zs} · PLANET ${s.gear.Zp} · RING ${s.gear.Zr} · m ${(s.gear.mod * 1000 * d.def.s).toFixed(1)}`);
      // live gear schematic from the same angles the 3D gears use
      const k = s.kin;
      const R = (a, cx, cy) => `rotate(${(a % 360).toFixed(1)} ${cx} ${cy})`;
      let h = `<circle cx="48" cy="48" r="44" fill="none" stroke="${C.ink}" stroke-width="1.2"/><circle cx="48" cy="48" r="40" fill="none" stroke="${C.faint}" stroke-width="1" stroke-dasharray="2 3"/>`;
      h += `<g transform="${R(k.sun1, 48, 48)}"><circle cx="48" cy="48" r="9" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/><path d="M48 48V39" stroke="${C.or}" stroke-width="2"/></g>`;
      for (let i = 0; i < 3; i++) {
        const a = k.carrier1 + i * 120;
        const px = 48 + 24 * Math.sin((a * Math.PI) / 180);
        const py = 48 - 24 * Math.cos((a * Math.PI) / 180);
        h += `<g transform="${R(k.planet1 + a * 0, px, py)}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="13" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/><path d="M${px.toFixed(1)} ${py.toFixed(1)}v-11" stroke="${i ? C.mute : C.or}" stroke-width="1.6"/></g>`;
      }
      h += `<text x="104" y="16" font-size="8" letter-spacing="1" fill="${C.mute}" font-family="JetBrains Mono">SUN ${Math.round(k.sun1)}°</text><text x="104" y="34" font-size="8" letter-spacing="1" fill="${C.mute}" font-family="JetBrains Mono">CARRIER ${Math.round(k.carrier1 % 360)}°</text><text x="104" y="52" font-size="8" letter-spacing="1" fill="${C.mute}" font-family="JetBrains Mono">OUTPUT ${Math.round(k.carrier2)}°</text><text x="104" y="76" font-size="8" letter-spacing="1" fill="${C.or}" font-family="JetBrains Mono">STAGE 1 SHOWN</text>`;
      sch.innerHTML = h;
      set(kwV, `${s.kw.toFixed(1)}`);
      kwB.style.width = `${(Math.min(1, s.kw / 160) * 234).toFixed(1)}px`;
      set(outV, `${s.out} / ${s.total}`);
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
      pointer(s.cursor);
    },
  };
}
