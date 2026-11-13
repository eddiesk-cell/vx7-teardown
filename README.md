# VX-7 Duelist

A product page for a white fighting mech that you can drive like a game character and take apart: one offline HTML
page. He walks when you arrive; turn, zoom and pan around him while he moves; make him run, jump, roll, slash, block
and shoot; then pull the armor off plate by plate and watch the motors and planetary gears work inside.

**Try it: https://eddiesk-cell.github.io/vx7-teardown/** (a 5.5 MB page; best on a laptop or desktop)

![VX-7 product page](review/page.png)

![Fighting](review/fight.png)

![Armor off, still running](review/inside.png)

## How it is made

- **The armor is built in code, shaped on a mould of the design.** `ref/vx7-reference.png` is the design;
  `ref/vx7-turnaround.png` (front, side, back) and `ref/vx7-exploded.png` were made from it. The front view went
  through Hunyuan3D-2mini (shape) and Hunyuan3D paint, run locally with MLX, into a painted shell
  (`vx7-shared/assets/vx7-shell.glb`). The page never draws that mesh: `tools/shell/split.py` cuts it at the joints
  into 17 body segments and measures each round its bone (radius and paint colour every 1 cm and 2.5 degrees) into
  `vx7-shared/assets/vx7-mold.json`. `vx7-shared/shell.js` builds **about 340 armor plates** from that mould:
  curved panels on panel lines (bands across the bone, sectors round it, each nudged to a painted seam) that meet edge
  to edge with shared normals, so the assembled armor reads as one smooth shell and a seam shows only when a plate
  comes off. The plates wear the design's paint: `split.py` also unrolls the painted shell round each bone into one
  atlas (0.625 degrees x 2.5 mm a pixel), so there are no texture seams. Code adds the rest: a dark 12 mm edge on every
  plate, light lines along the outer limbs and the chest, a glowing V visor, two swept fins, domed caps on the helmet
  and shoulders, and a window for the reactor. Plates at rest draw as one merged piece per joint and split back into
  parts the moment one moves.
- **Inside: built from code** (`vx7-shared/inner.js`, `mech.js`): graphite frame, spine, cables, the chest reactor, knee /
  hock / elbow hydraulics (bore 50, rod 28, stroke 180 mm, rod length from the law of cosines), the shield and the plasma blade.
- **10 planetary drives** (neck, waist, shoulders, elbows, hips, knees), each **87 separate parts**: frameless BLDC motor
  (stator with 24 copper coils, rotor with 20 magnets and the encoder disc), two planetary stages (sun 12T, carrier,
  3 planets 30T, ring 72T, 7:1 each, **49:1** total), cross-roller bearing (outer race, inner race, cage, 24 balls),
  collar and circlips. 100 toothed gears mesh and turn from the joint angle. **1,279 parts** in all; a drive's small parts
  join the scene only once it is opened, so the walking page draws about as much as before.
- **Joints** sit on centres measured on the shell (`REST` in `vx7-shared/kin.js`); every pose, gear angle, torque, rpm and the
  reactor kW readout is a function of `(sequence, tau)` there.

## Controls

- **MOVE:** IDLE `I` · WALK `W` · RUN `R` · JUMP `Space` · ROLL `Q`. **FIGHT:** SLASH `J` · BLOCK `K` · SHOOT `L` (laser
  from the left forearm) · COMBO `F`. Jump, roll and the fight moves play once, then he goes back to the walk, run or idle
  you left him in.
- **Look:** drag to turn, scroll or pinch to zoom, right-drag, shift-drag or two fingers to pan, views `1`-`4`. The camera
  turns slowly on its own until you touch it (TURNTABLE).
- **Look inside:** X-RAY ARMOR `X`, the EXPLODE slider in three stages (ARMOR, DRIVES, GEARS), EXPLODE ALL `E`, ISOLATE
  (head, reactor, shoulder, blade arm, hip, knee, foot), LABELS, click any part to pull it out and again to put it back,
  REASSEMBLE ALL `C`. Live telemetry follows the drive doing the most work in each move.
- The floor is a treadmill: he stays in the middle and the grid rolls back under him at his real speed (1.7 m/s walking,
  6.5 m/s running, 2.8 m per jump, one full turn per roll).

## The film

`vx7-film` is the same page played from a script (`vx7-shared/film.js`) on a fixed clock: walk, run, jump, roll, slash,
block, shoot, a fight in x-ray, running with the armor off, every part out, the right shoulder's gears, back together.
The score (`vx7-shared/score.py`) is synthesised from the same timeline, so every footfall, swing, laser shot and hit lands
on its frame.

```
node tools/timeline.mjs                                   # vx7-film/timeline.json from the script and the moves
python ../teardown/run_sfx.py vx7-shared/score.py         # teardown-out/vx7-score.wav
node ../teardown/sims/build.mjs ./vx7-film
node ../teardown/sims/capture.mjs vx7-film --size 1600x900 --dpr 1.2 --out teardown-out/vx7-silent.mp4
ffmpeg -i teardown-out/vx7-silent.mp4 -i teardown-out/vx7-score.wav -map 0:v -map 1:a -c:v copy -c:a aac -shortest teardown-out/vx7-film.mp4
```

## Build

The page is bundled with the [teardown](https://github.com/elvarofficial/teardown) kit. Clone it next to this repo:

```
git clone https://github.com/elvarofficial/teardown ../teardown
(cd ../teardown && npm install)
node ../teardown/sims/build.mjs ./vx7-live        # -> teardown-out/dist/vx7-live.html (about 5.5 MB, works from file://)
```

`docs/index.html` is a copy of that build.

Checks (need Playwright's Chromium, or point `CHROMIUM` at any Chrome):

```
CHROMIUM=/path/to/chrome node tools/product-check.mjs  # clicks the buttons and keys, pans, zooms, pulls a part; exit 1 on a fail
CHROMIUM=/path/to/chrome node tools/moves.mjs          # review/moves-*.png: every move at its key moments
CHROMIUM=/path/to/chrome node tools/shoot.mjs          # review/01..12 .png: x-ray, explode, isolates, labels
```

Test hooks live on `window.LIVE`: `setExplode(k)`, `setDisplay(key, on)`, `isolate(name|null)`, `pull(partId)`, `reassemble()`,
`setSeq(name, tau)`, `press(buttonKey)`, `setView(name)`, `pan(x, y, zoom)`, `parts`, `gearCount()`, `homeError()`.

## Credits and license

Code: MIT. Built with [elvarofficial/teardown](https://github.com/elvarofficial/teardown) (MIT), whose kit is from
[whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT). The shell was generated with Tencent
Hunyuan3D-2 models (Tencent Hunyuan Community License, which does not cover the EU, the UK or South Korea).
