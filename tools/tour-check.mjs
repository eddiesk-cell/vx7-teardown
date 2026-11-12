// Lets the auto tour run untouched and samples what it did: no errors, the explode slider travels 0 -> 1 -> 0, an isolate
// engages, and the frame rate. Prints one line per probe.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHROMIUM_ARGS, playwright} from '../../teardown/paths.mjs';

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../teardown-out/dist/vx7-live.html');
const browser = await playwright().chromium.launch({executablePath: process.env.CHROMIUM, args: CHROMIUM_ARGS});
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + PAGE);
  await page.waitForFunction(() => window.SIM_SHOWN, null, {timeout: 60000});
  const seen = {k: 0, iso: new Set(), xray: false, seq: new Set()};
  for (let t = 0; t < 50; t++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => ({k: LIVE.S.k, iso: LIVE.S.iso, seq: LIVE.S.seq, tier: LIVE.tier}));
    seen.k = Math.max(seen.k, s.k);
    if (s.iso) seen.iso.add(s.iso);
    seen.seq.add(s.seq);
  }
  const fps = await page.evaluate(() => new Promise((r) => {
    let n = 0;
    const t0 = performance.now();
    const f = () => (++n < 120 ? requestAnimationFrame(f) : r((120 / (performance.now() - t0)) * 1000));
    requestAnimationFrame(f);
  }));
  console.log('tour', JSON.stringify({maxExplode: seen.k, iso: [...seen.iso], seq: [...seen.seq], fps: Math.round(fps), tier: await page.evaluate(() => LIVE.tier)}));
  if (errors.length) {
    console.error(errors);
    code = 1;
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
