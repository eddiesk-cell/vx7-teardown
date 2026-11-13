// Drives the product page like a visitor: real clicks on the move buttons, right-drag pan, wheel zoom, drag to turn,
// a click on a part. Checks he walks at load, a one-shot move hands back to the last loop, IDLE sticks, and the frame
// rate. Prints one line per probe; exit 1 on a failed probe or a page error.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHROMIUM_ARGS, playwright} from '../../teardown/paths.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await playwright().chromium.launch({executablePath: process.env.CHROMIUM, args: CHROMIUM_ARGS});
const errors = [];
const fails = [];
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info ?? '');
  if (!ok) fails.push(name);
};
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.argv[2] || 'file://' + path.join(ROOT, 'teardown-out/dist/vx7-live.html'));
  await page.waitForFunction(() => window.SIM_SHOWN, null, {timeout: 60000});
  const S = () => page.evaluate(() => ({seq: LIVE.S.seq, loop: LIVE.S.loop, orbit: LIVE.S.orbit0, floor: LIVE.S.floorNow, off: {...LIVE.off}, k: LIVE.S.k}));
  await page.waitForTimeout(1500);
  let s = await S();
  check('walks at load', s.seq === 'STRIDE' && s.floor > 0.5, `floor moved ${s.floor.toFixed(2)} m`);
  const press = (label) => page.locator('.bt.mv', {hasText: new RegExp(`^${label}`)}).click();
  await press('JUMP');
  await page.waitForTimeout(600);
  check('JUMP pressed', (await S()).seq === 'JUMP');
  await page.waitForTimeout(3300);
  check('jump hands back to walk', (await S()).seq === 'STRIDE');
  await press('RUN');
  await page.waitForTimeout(500);
  await press('COMBO');
  await page.waitForTimeout(6200);
  check('fight hands back to run', (await S()).seq === 'RUN');
  // game keys: L shoots, K blocks, J slashes; each hands back to the loop it interrupted
  for (const [key, seq, dur] of [['l', 'SHOOT', 2.0], ['k', 'BLOCK', 1.8], ['j', 'SLASH', 1.7]]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    const a = (await S()).seq;
    await page.waitForTimeout(dur * 1000 + 500);
    check(`key ${key.toUpperCase()} -> ${seq} -> back`, a === seq && (await S()).seq === 'RUN', a);
  }
  await press('IDLE');
  await page.waitForTimeout(3000);
  check('idle sticks', (await S()).seq === 'STANCE');
  // right-drag pans, wheel zooms, left-drag turns
  await page.mouse.move(800, 450);
  await page.mouse.down({button: 'right'});
  await page.mouse.move(700, 400, {steps: 8});
  await page.mouse.up({button: 'right'});
  s = await S();
  check('right-drag pans', Math.abs(s.off.px) > 0.2 && Math.abs(s.off.py) > 0.1, `px ${s.off.px.toFixed(2)} py ${s.off.py.toFixed(2)}`);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(200);
  s = await S();
  check('wheel zooms in', s.off.k < 0.8, `k ${s.off.k.toFixed(2)}`);
  const az0 = s.off.az;
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(980, 450, {steps: 8});
  await page.mouse.up();
  s = await S();
  check('drag turns', Math.abs(s.off.az - az0) > 30, `az ${az0.toFixed(0)} -> ${s.off.az.toFixed(0)}`);
  await page.waitForTimeout(800);
  await page.screenshot({path: path.join(ROOT, 'review/product-panzoom.png')});
  // click the helmet to pull it out
  await page.evaluate(() => LIVE.setView('front'));
  await page.waitForTimeout(1200);
  const at = await page.evaluate(() => {
    const v = LIVE.mech.worldPos('shell-head-00');
    return LIVE.st.project(v);
  });
  await page.mouse.click(at[0], at[1]);
  await page.waitForTimeout(900);
  const pulled = await page.evaluate(() => LIVE.mech.parts.filter((p) => p.pullT > 0.5).map((p) => p.id));
  check('click pulls a part', pulled.length > 0, pulled.join(','));
  const fps = await page.evaluate(() => new Promise((r) => {
    let n = 0;
    const t0 = performance.now();
    const f = () => (++n < 120 ? requestAnimationFrame(f) : r((120 / (performance.now() - t0)) * 1000));
    requestAnimationFrame(f);
  }));
  check('frame rate', fps > 40, `${Math.round(fps)} fps, tier ${await page.evaluate(() => LIVE.tier)}`);
  check('no page errors', !errors.length, errors.join(' | '));
} catch (e) {
  console.error(e);
  fails.push('crash');
} finally {
  await browser.close();
}
process.exit(fails.length ? 1 : 0);
