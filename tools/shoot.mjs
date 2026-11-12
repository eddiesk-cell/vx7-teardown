// Review stills: loads the built page on the real GPU, drives the LIVE hooks and writes review/*.png.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHROMIUM_ARGS, playwright} from '../../teardown/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'review');
const PAGE = process.env.PAGE || path.join(ROOT, 'teardown-out/dist/vx7-live.html');
const only = process.argv.slice(2);
fs.mkdirSync(OUT, {recursive: true});
const {chromium} = playwright();
const browser = await chromium.launch({executablePath: process.env.CHROMIUM, args: CHROMIUM_ARGS});
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  await page.goto('file://' + PAGE);
  await page.waitForFunction(() => window.SIM_SHOWN, null, {timeout: 60000});
  const run = (fn, arg) => page.evaluate(fn, arg);
  await run(() => LIVE.takeOver());
  const shot = async (name, setup, wait = 1200) => {
    if (only.length && !only.includes(name.slice(0, 2))) return;
    await run(() => LIVE.takeOver());
    await run(setup);
    await page.waitForTimeout(wait);
    await page.screenshot({path: path.join(OUT, name + '.png')});
    console.log('wrote', name);
  };
  await run(() => {
    window.RESET = () => {
      LIVE.isolate(null);
      LIVE.reassemble();
      LIVE.setDisplay('xray', false);
      LIVE.setDisplay('labels', false);
      LIVE.setDisplay('orbit', false);
      LIVE.setExplode(0);
      LIVE.setSeq('STANCE', 0.9);
      LIVE.setView('hero');
    };
  });
  await shot('01-hero', () => RESET());
  // side-by-side with the reference, then a silhouette IoU against it (both masked against their own background)
  if (!only.length || only.includes('cm')) {
    await run(() => {
      LIVE.takeOver();
      RESET();
      LIVE.showUI(false);
    });
    await page.waitForTimeout(1200);
    const png = await page.screenshot({clip: {x: 350, y: 0, width: 900, height: 900}});
    await run(() => LIVE.floor(false));
    await page.waitForTimeout(500);
    const bare = await page.screenshot();
    await run(() => {
      LIVE.floor(true);
      LIVE.showUI(true);
    });
    const ref = fs.readFileSync(path.join(ROOT, 'ref/vx7-reference.png')).toString('base64');
    const cmp = await browser.newPage({viewport: {width: 1800, height: 900}});
    const out = await cmp.evaluate(async ([a, b, c]) => {
      const load = (s) => new Promise((r) => Object.assign(new Image(), {src: 'data:image/png;base64,' + s, onload() { r(this); }}));
      const grab = (img) => {
        const cv = Object.assign(document.createElement('canvas'), {width: img.width, height: img.height});
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height);
      };
      // foreground = far from the border's median colour (top and sides only: the floor edge is noisy)
      const mask = (d) => {
        const w = d.width;
        const h = d.height;
        const px = (x, y) => [0, 1, 2].map((k) => d.data[(y * w + x) * 4 + k]);
        const edge = [];
        for (let i = 0; i < w; i += 4) edge.push(px(i, 2));
        for (let i = 0; i < h; i += 4) edge.push(px(2, i), px(w - 3, i));
        const med = [0, 1, 2].map((k) => edge.map((e) => e[k]).sort((p, q) => p - q)[edge.length >> 1]);
        const m = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = Math.hypot(...px(x, y).map((v, k) => v - med[k])) > 38 ? 1 : 0;
        // drop specks: keep a pixel only if most of its 3x3 neighbourhood is set
        const k = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          if (!m[y * w + x]) continue;
          let n = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) n += m[(y + j) * w + x + i];
          k[y * w + x] = n >= 6 ? 1 : 0;
        }
        return {m: k, w, h};
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
        return {x0, x1, y0, y1, h: y1 - y0 + 1, cx: (x0 + x1) / 2};
      };
      const ri = await load(a);
      const rm = mask(grab(ri));
      const gm = mask(grab(await load(c)));
      const bR = bbox(rm);
      const bG = bbox(gm);
      // normalised grid: 600 rows tall, same bbox height, centred on the bbox centre
      const G = 600;
      const W = 900;
      const samp = (M, b) => {
        const o = new Uint8Array(W * G);
        for (let y = 0; y < G; y++) for (let x = 0; x < W; x++) {
          const sx = Math.round(b.cx + (x - W / 2) * (b.h / G));
          const sy = Math.round(b.y0 + y * (b.h / G));
          o[y * W + x] = sx >= 0 && sx < M.w && sy >= 0 && sy < M.h ? M.m[sy * M.w + sx] : 0;
        }
        return o;
      };
      const A = samp(rm, bR);
      const B = samp(gm, bG);
      let inter = 0;
      let uni = 0;
      for (let i = 0; i < A.length; i++) (inter += A[i] & B[i], uni += A[i] | B[i]);
      const prof = (M) => [0.12, 0.33, 0.42, 0.55, 0.7].map((f) => {
        const y = Math.round(G - 1 - f * G);
        let w = 0;
        for (let x = 0; x < W; x++) w += M[y * W + x];
        return +(w / G).toFixed(3);
      });
      // images: ref | render | overlay (ref red, render blue)
      const c1 = Object.assign(document.createElement('canvas'), {width: 1800, height: 900});
      const g = c1.getContext('2d');
      g.drawImage(ri, 0, 0, 900, 900);
      g.drawImage(await load(b), 900, 0);
      const c2 = Object.assign(document.createElement('canvas'), {width: W, height: G});
      const g2 = c2.getContext('2d');
      const im = g2.createImageData(W, G);
      for (let i = 0; i < A.length; i++) {
        const v = A[i] && B[i] ? [255, 255, 255] : A[i] ? [230, 60, 60] : B[i] ? [60, 90, 230] : [30, 30, 34];
        im.data.set([...v, 255], i * 4);
      }
      g2.putImageData(im, 0, 0);
      const area = (M) => +(M.reduce((a, v) => a + v, 0) / (G * G)).toFixed(3);
      return {cmp: c1.toDataURL('image/png').split(',')[1], mask: c2.toDataURL('image/png').split(',')[1], iou: inter / uni, areaRef: area(A), areaRender: area(B), ref: prof(A), render: prof(B)};
    }, [ref, png.toString('base64'), bare.toString('base64')]);
    fs.writeFileSync(path.join(OUT, 'compare.png'), Buffer.from(out.cmp, 'base64'));
    fs.writeFileSync(path.join(OUT, 'compare-mask.png'), Buffer.from(out.mask, 'base64'));
    await cmp.close();
    console.log('IOU', out.iou.toFixed(3), 'silhouette area / H^2: ref', out.areaRef, 'render', out.areaRender);
    console.log('row widths / H at 0.12 0.33 0.42 0.55 0.70 (from the ground)');
    console.log(' ref   ', out.ref.join(' '));
    console.log(' render', out.render.join(' '));
  }
  await shot('02-xray', () => LIVE.setDisplay?.('xray', true));
  await shot('03-explode-armor', () => {
    RESET();
    LIVE.setExplode(0.35);
  });
  await shot('04-explode-full', () => LIVE.setExplode(1), 1500);
  await shot('05-iso-shoulder', () => {
    RESET();
    LIVE.isolate('SHOULDER');
  }, 2200);
  await shot('06-iso-knee', () => {
    RESET();
    LIVE.isolate('KNEE');
  }, 2200);
  await shot('07-iso-reactor', () => {
    RESET();
    LIVE.isolate('REACTOR');
  }, 2200);
  await shot('08-pulled-panel', () => {
    RESET();
    LIVE.pull('shell-torso-10');
    LIVE.pull('shell-thighR-00');
  }, 1500);
  await shot('09-reassembled', () => {
    LIVE.setExplode(1);
    LIVE.reassemble();
    LIVE.setExplode(0);
    LIVE.setView('hero');
  });
  await shot('11-head', () => {
    RESET();
    LIVE.isolate('HEAD');
  }, 2200);
  await shot('12-labels', () => {
    RESET();
    LIVE.setDisplay('labels', true);
  });
  await shot('10-strike', () => {
    RESET();
    LIVE.setSeq('STRIKE', 0.9);
    LIVE.setView('side');
  });
  const checks = await run(() => {
    const n = (k) => LIVE.parts.filter((p) => p.kind === k).length;
    LIVE.setExplode(1);
    LIVE.reassemble();
    LIVE.setExplode(0);
    return {armor: n('armor'), drive: n('drive'), frame: n('frame'), hydraulic: n('hydraulic'), reactor: n('reactor'), total: LIVE.parts.length, gears: LIVE.gearCount(), homeError: LIVE.homeError()};
  });
  console.log('CHECKS', JSON.stringify(checks));
  if (errors.length) {
    console.error('ERRORS', errors);
    code = 1;
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
