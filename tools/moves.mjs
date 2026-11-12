// Review stills of every move: loads the built page on the real GPU, poses each move at a few moments (LIVE hooks)
// and writes review/moves-*.png plus one contact sheet line per frame (pelvis height, lowest point). `node tools/moves.mjs [SEQ...]`
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHROMIUM_ARGS, playwright} from '../../teardown/paths.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'review');
const PAGE = path.join(ROOT, 'teardown-out/dist/vx7-live.html');
const SHOTS = {STANCE: [1], STRIDE: [0.4, 1.2], RUN: [0.1, 0.3, 0.5], JUMP: [0.6, 0.95, 1.4, 1.9, 2.32], ROLL: [0.5, 0.9, 1.15, 1.4, 1.75], FIGHT: [0.5, 0.78, 2.15, 2.45, 4.0], SLASH: [0.5, 0.62, 0.72], BLOCK: [0.5, 0.72], SHOOT: [0.52, 0.75, 1.2]};
const only = process.argv.slice(2);
fs.mkdirSync(OUT, {recursive: true});
const browser = await playwright().chromium.launch({executablePath: process.env.CHROMIUM, args: CHROMIUM_ARGS});
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + PAGE);
  await page.waitForFunction(() => window.SIM_SHOWN, null, {timeout: 60000});
  await page.waitForTimeout(800);
  for (const [seq, ts] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(seq)) continue;
    for (const t of ts) {
      await page.evaluate(([s, x]) => {
        LIVE.takeOver();
        LIVE.setView({RUN: 'run', ROLL: 'roll', JUMP: 'jump', SHOOT: 'shoot'}[s] || 'hero');
        LIVE.setSeq(s, x);
        LIVE.renderNow();
      }, [seq, t]);
      await page.waitForTimeout(250);
      const h = await page.evaluate(() => LIVE.height());
      const name = `moves-${seq}-${t}`;
      await page.screenshot({path: path.join(OUT, name + '.png')});
      console.log(name, 'pelvis', h.pelvis.toFixed(3), 'min y', h.min[1].toFixed(3), 'max y', h.max[1].toFixed(3));
    }
  }
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
