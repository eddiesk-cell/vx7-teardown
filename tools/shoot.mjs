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
  // side-by-side with the reference: the render without the console, cropped to the reference's square
  if (!only.length || only.includes('cm')) {
    await run(() => {
      LIVE.takeOver();
      RESET();
      LIVE.showUI(false);
    });
    await page.waitForTimeout(1200);
    const png = await page.screenshot({clip: {x: 350, y: 0, width: 900, height: 900}});
    await run(() => LIVE.showUI(true));
    const ref = fs.readFileSync(path.join(ROOT, 'ref/vx7-reference.png')).toString('base64');
    const cmp = await browser.newPage({viewport: {width: 1800, height: 900}});
    const out = await cmp.evaluate(async ([a, b]) => {
      const load = (s) => new Promise((r) => Object.assign(new Image(), {src: 'data:image/png;base64,' + s, onload() { r(this); }}));
      const c = Object.assign(document.createElement('canvas'), {width: 1800, height: 900});
      const g = c.getContext('2d');
      g.drawImage(await load(a), 0, 0, 900, 900);
      g.drawImage(await load(b), 900, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, [ref, png.toString('base64')]);
    fs.writeFileSync(path.join(OUT, 'compare.png'), Buffer.from(out, 'base64'));
    await cmp.close();
    console.log('wrote compare');
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
    LIVE.pull('pec-L');
    LIVE.pull('thigh-front-R');
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
