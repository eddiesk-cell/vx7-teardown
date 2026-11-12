// Hill-climbs the pose parameters (stance angles, leg and arm abduction, hero azimuth) against the reference silhouette:
// IoU of the render's mask and the reference's mask, both scaled to the same bounding-box height and centred on it.
// Prints the best values; they are then written into kin.js. Pose only: widths and lengths are changed by hand.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHROMIUM_ARGS, playwright} from '../../teardown/paths.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await playwright().chromium.launch({executablePath: process.env.CHROMIUM, args: CHROMIUM_ARGS});
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  await page.goto('file://' + path.join(ROOT, 'teardown-out/dist/vx7-live.html'));
  await page.waitForFunction(() => window.SIM_SHOWN);
  const ref = fs.readFileSync(path.join(ROOT, 'ref/vx7-reference.png')).toString('base64');
  await page.evaluate(async (refB64) => {
    LIVE.takeOver();
    LIVE.setSeq('STANCE', 0.9);
    LIVE.showUI(false);
    LIVE.floor(false);
    const img = await new Promise((r) => Object.assign(new Image(), {src: 'data:image/png;base64,' + refB64, onload() { r(this); }}));
    const maskOf = (src, w, h) => {
      const cv = Object.assign(document.createElement('canvas'), {width: w, height: h});
      const g = cv.getContext('2d', {willReadFrequently: true});
      g.drawImage(src, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h);
      const px = (x, y) => [0, 1, 2].map((k) => d.data[(y * w + x) * 4 + k]);
      const edge = [];
      for (let i = 0; i < w; i += 4) edge.push(px(i, 2));
      for (let i = 0; i < h; i += 4) edge.push(px(2, i), px(w - 3, i));
      const med = [0, 1, 2].map((k) => edge.map((e) => e[k]).sort((p, q) => p - q)[edge.length >> 1]);
      const m = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = Math.hypot(...px(x, y).map((v, k) => v - med[k])) > 38 ? 1 : 0;
      return {m, w, h};
    };
    const bbox = ({m, w, h}) => {
      let x0 = w, x1 = 0, y0 = h, y1 = 0;
      const col = new Uint16Array(w);
      for (let y = 0; y < h; y++) {
        let n = 0;
        for (let x = 0; x < w; x++) if (m[y * w + x]) (n++, col[x]++);
        if (n > 3) (y0 = Math.min(y0, y), y1 = Math.max(y1, y));
      }
      for (let x = 0; x < w; x++) if (col[x] > 3) (x0 = Math.min(x0, x), x1 = Math.max(x1, x));
      return {y0, h: y1 - y0 + 1, cx: (x0 + x1) / 2};
    };
    const G = 300;
    const W = 450;
    const samp = (M, b) => {
      const o = new Uint8Array(W * G);
      for (let y = 0; y < G; y++) for (let x = 0; x < W; x++) {
        const sx = Math.round(b.cx + (x - W / 2) * (b.h / G));
        const sy = Math.round(b.y0 + y * (b.h / G));
        o[y * W + x] = sx >= 0 && sx < M.w && sy >= 0 && sy < M.h ? M.m[sy * M.w + sx] : 0;
      }
      return o;
    };
    const rm = maskOf(img, 1024, 1024);
    const A = samp(rm, bbox(rm));
    window.IOU = () => {
      LIVE.renderNow();
      const gm = maskOf(LIVE.st.renderer.domElement, 1600, 900);
      const B = samp(gm, bbox(gm));
      let i = 0;
      let u = 0;
      for (let k = 0; k < A.length; k++) (i += A[k] & B[k], u += A[k] | B[k]);
      return i / u;
    };
  }, ref);
  // [object path in LIVE.K, key, step, lo, hi]
  const P = [
    ['LEG', 'abdL', 3, -2, 20], ['LEG', 'abdR', 3, 10, 32], ['LEG', 'thighLean', 3, 15, 55], ['LEG', 'kneeBend', 4, 40, 100], ['LEG', 'hockBend', 4, 30, 80],
    ['ARM', 'abdL', 3, 10, 30], ['ARM', 'abdR', 3, 22, 38],
    ['STANCE0', 'shL', 4, -6, 24], ['STANCE0', 'shR', 4, -6, 20], ['STANCE0', 'elL', 4, 5, 40], ['STANCE0', 'elR', 4, 0, 25],
    ['STANCE0', 'hipL', 3, -25, 25], ['STANCE0', 'hipR', 3, -25, 40], ['STANCE0', 'kneeL', 3, -5, 45], ['STANCE0', 'kneeR', 3, -5, 45], ['STANCE0', 'lean', 2, -5, 25],
    ['V', 'hero.az', 3, 0, 40], ['V', 'hero.el', 1.5, -5, 15],
  ];
  // optional: only fit the named parameters, e.g. node tools/fit.mjs LEG.abdR V.hero.az
  const only = process.argv.slice(2);
  if (only.length) P.splice(0, P.length, ...P.filter(([o, k]) => only.includes(`${o}.${k}`)));
  const get = (o, k) => page.evaluate(([o, k]) => { const [a, b] = k.split('.'); const t = LIVE.K[o]; return b ? t[a][b] : t[a]; }, [o, k]);
  const set = (o, k, v) => page.evaluate(([o, k, v]) => { const [a, b] = k.split('.'); const t = LIVE.K[o]; if (b) t[a][b] = v; else t[a] = v; }, [o, k, v]);
  const iou = () => page.evaluate(() => IOU());
  let best = await iou();
  console.log('start', best.toFixed(3));
  for (let round = 0; round < 4; round++) {
    let moved = false;
    for (const [o, k, step, lo, hi] of P) {
      const v0 = await get(o, k);
      for (const dir of [1, -1]) {
        for (let n = 0; n < 6; n++) {
          const v = Math.min(hi, Math.max(lo, (await get(o, k)) + dir * step));
          await set(o, k, v);
          const s = await iou();
          if (s > best + 1e-4) {
            best = s;
            moved = true;
          } else {
            await set(o, k, v - dir * step < lo || v - dir * step > hi ? v : v - dir * step);
            break;
          }
        }
        if ((await get(o, k)) !== v0) break;
      }
    }
    console.log('round', round, best.toFixed(3));
    if (!moved) break;
  }
  const out = {};
  for (const [o, k] of P) out[`${o}.${k}`] = await get(o, k);
  console.log(JSON.stringify(out));
  fs.writeFileSync(path.join(ROOT, 'teardown-out/fit.json'), JSON.stringify({iou: best, ...out}, null, 1));
} finally {
  await browser.close();
}
