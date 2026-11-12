// The page you drive. (first cut: stage + pose loop + test hooks)
import {warmComposer} from 'teardown-kit/warm.js';
import {createStage} from './stage.js';
import {readout} from './kin.js';

const W = 1600;
const H = 900;
const D2R = Math.PI / 180;
const VIEWS = {
  hero: {tx: 0, ty: 1.85, tz: 0, az: 20, el: 6, d: 8.2},
  front: {tx: 0, ty: 1.85, tz: 0, az: 0, el: 4, d: 8.2},
  side: {tx: 0, ty: 1.85, tz: 0, az: 90, el: 4, d: 8.2},
  back: {tx: 0, ty: 1.85, tz: 0, az: 180, el: 4, d: 8.2},
};

export function runLive() {
  const app = document.getElementById('app');
  Object.assign(app.style, {position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', transformOrigin: '0 0'});
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  document.body.style.cssText = 'margin:0;background:#d9dadd;overflow:hidden';
  const st = createStage({canvas});
  const mech = st.mech;
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - H * s) / 2}px) scale(${s})`;
    st.resize(W, H, Math.min(2, (devicePixelRatio || 1) * s));
  };
  fit();
  addEventListener('resize', fit);
  const S = {seq: 'STANCE', tau: 0, paused: false, k: 0, view: 'hero', T: 0};
  const cam = {...VIEWS.hero};
  const draw = (dt) => {
    S.T += dt;
    if (!S.paused) S.tau += dt;
    mech.setPose(S.seq, S.tau);
    mech.tick(dt);
    mech.applyExplode(S.k);
    for (const p of mech.parts) mech.style(p, 1, 0.55, 0, 0);
    const v = VIEWS[S.view];
    st.frame({...v, az: v.az * D2R, el: v.el * D2R});
  };
  let last = performance.now();
  const loop = (now) => {
    draw(Math.min(0.1, (now - last) / 1000));
    last = now;
    if (!window.SIM_SHOWN) window.SIM_SHOWN = true;
    requestAnimationFrame(loop);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(loop));
  window.LIVE = {
    parts: mech.parts.map((p) => ({id: p.id, name: p.name, kind: p.kind})),
    gearCount: () => mech.gearCount(),
    homeError: () => mech.homeError(),
    setExplode: (k) => (S.k = k),
    setSeq: (n, t) => ((S.seq = n), t !== undefined && ((S.tau = t), (S.paused = true))),
    setView: (n) => (S.view = n),
    takeOver() {},
    st, mech, S, readout,
  };
}
