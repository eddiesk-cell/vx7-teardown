// Writes vx7-film/timeline.json from the film script and the moves, so the score lands every footfall, swing and hit
// on the frame it happens: `node tools/timeline.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FILM} from '../vx7-shared/film.js';
import {BLOCK_HIT, FLY, SEQ, SHOTS} from '../vx7-shared/kin.js';

// sounds in each move's own clock (s): feet down, swings, heavy hits
const HITS = {
  STRIDE: {step: [0.4, 1.2]},
  RUN: {step: [0.19, 0.57]},
  JUMP: {step: [0.6], whoosh: [0.95], land: [FLY.b]},
  ROLL: {whoosh: [0.55], land: [1.15], step: [1.75, 2.3]},
  SLASH: {whoosh: [0.5], step: [0.42]},
  BLOCK: {hit: [BLOCK_HIT], step: [0.25]},
  SHOOT: {laser: SHOTS},
  FIGHT: {whoosh: [0.62, 2.3], hit: [2.45, 4.0], step: [0.5, 3.75]},
};
const tl = {duration: FILM.duration, beats: FILM.events.map((e) => e.t), step: [], whoosh: [], land: [], hit: [], laser: [], explode: [], xray: [], iso: [], run: []};
const seqs = FILM.events.filter((e) => e.seq);
seqs.forEach((e, i) => {
  const end = seqs[i + 1]?.t ?? FILM.duration;
  const T = SEQ[e.seq].dur;
  if (e.seq === 'RUN') tl.run.push([e.t, end]);
  for (const [kind, ts] of Object.entries(HITS[e.seq] || {}))
    for (let n = 0; e.t + n * T < end; n++) for (const x of ts) if (e.t + n * T + x < end - 0.05) tl[kind].push(+(e.t + n * T + x).toFixed(3));
});
for (const e of FILM.events) {
  if ('k' in e) tl.explode.push([e.t, e.k]);
  if (e.xray !== undefined) tl.xray.push(e.t);
  if (e.iso) tl.iso.push(e.t);
}
for (const k of ['step', 'whoosh', 'land', 'hit', 'laser']) tl[k].sort((a, b) => a - b);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../vx7-film/timeline.json');
fs.writeFileSync(out, JSON.stringify(tl) + '\n');
console.log(out, Object.fromEntries(Object.entries(tl).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])));
