# VX-7 Duelist — take-apart simulator (build brief)

Use Ponytail: shortest working code, reuse before writing, mark corners `shortcut:` (Ponytail 5). Before reading code, read graphify-out/GRAPH_REPORT.md; if missing run `graphify update .`.

## Goal (what done looks like)

One offline HTML page where Eddie sees the white VX-7 fighting mech from the reference image standing and moving,
and can take it apart: armor comes off, the frame shows, every joint's motor and planetary gearbox slides out and
splits so he SEES THE GEARS TURNING, hydraulic pistons, cables and the glowing reactor. He can spin it, pull single
parts out by clicking them, and put everything back together. This repo will be PUBLIC on GitHub.

## Inputs (read both before writing code)

- Picture: `ref/vx7-reference.png` — THE reference. Match it, never invent. Orange plasma blade, orange chest core.
- Method: `../teardown/SKILL.md` (the teardown skill: rules, review loop, three.js traps). Template code to copy
  from: `../teardown/sims/cessna-shared/` (live.js = controls/orbit/tour/explode easing, stage.js = studio/post,
  console.js = 1600x900 overlay panels/buttons/callouts, gear.js `gearGeo` = toothed gears). `../teardown/sims/v8-shared/`
  for isolate + cutaway. Kit: `../teardown/sims/kit/`. Import the kit as `teardown-kit/<file>.js`, three as `three`.

## What the reference shows (build exactly this, metres, total height ≈ 3.6 m)

- Head: narrow angular helmet, white top plate, graphite sides, orange V visor, two small swept-back fins.
- Neck: exposed graphite cable bundle with orange cables.
- Torso: V-shaped chest, white pectoral plates, central round reactor glowing orange-yellow inside a graphite
  octagonal housing with radial vents. Wasp waist: graphite abdomen with exposed spine segments and orange cables.
- Viewer-left (mech's right) arm: blocky white pauldron, graphite upper arm with orange piston, white forearm armor;
  a straight orange plasma blade (~1.3 m) under the forearm pointing down-forward, as in the picture.
- Viewer-right (mech's left) arm: hangs down, white forearm plates, clawed hand (4 fingers + thumb).
- Shield: tall elongated hexagon (~2.0 m), white panels, graphite centre, orange stripe, mounted behind the
  viewer-right shoulder on a big rotary drum with an orange ring.
- Pelvis: graphite hip block, white front plate, big round hip drums.
- Legs: long, digitigrade. Big white thigh plate, round knee drum, shin back-down to a raised hock, metatarsal down to
  3 forward claw toes + rear spur. Orange hoses wrap the legs. Wide stance, slight forward lean (pose = the picture).
- Look: pale grey studio backdrop (#d9dadd), soft shadow. Armor off-white #e9e9e6 roughness 0.55 with a thin dark
  edge line (white on pale needs ink, SKILL rule 5); graphite #2a2c30 metalness 0.6 roughness 0.5; orange #f08a24;
  steel gears #9aa0a6 metalness 0.8 roughness 0.45; copper windings #b87333; chrome piston rods. Emissive < 1.0.
  Faceted hard-surface armor (extruded bevelled shapes, chamfered boxes), not blobs.

## The insides (real numbers, one source: `vx7-shared/kin.js`, no three.js in it)

- 10 rotary joint drives: neck, waist, L/R shoulder, L/R elbow, L/R hip, L/R knee-pitch drum. Each drive is a stack
  on its joint axis: frameless BLDC motor (stator ring, 24 slots with copper coil blocks, rotor with 20 magnets) →
  planetary stage 1 → stage 2 → cross-roller output bearing. Planetary: sun 12T, 3 planets 30T, ring 72T (internal
  teeth), module 4 mm (ring pitch Ø 288 mm, scale smaller drives down), stage ratio 1+72/12 = 7, two stages = 49:1.
  Gears visibly turn from the joint angle: carrier2 = joint, sun2/carrier1 = 7×joint, sun1/motor = 49×joint, planets
  spin about their pins by the correct relative ratio.
- Hydraulics: knee and ankle (hock) linear actuators, bore 50 mm, rod 28 mm, stroke 180 mm. Their length comes from
  the joint angle by the law of cosines on the mount points, so rod and cylinder always meet the joint correctly.
- Reactor: orange torus core in the chest, coolant pipes, power cables to each drive. Readout: output kW = sum of
  joint mechanical power |τ·ω| + 40 kW base.
- Frame: graphite skeleton bones (tapered boxes/tubes) under the armor; spine segments; cables as tubes on curves.
- Motion = one input per sequence, every pose and number a function of (seq, tau): STANCE (breathing sway, 4 s loop),
  STRIDE (walk in place, 1.6 s cycle), STRIKE (blade slash with shield brace, 2.4 s). Panels read the same function.

## Controls (live page, 1600x900 console like the Cessna)

- Spin: drag to orbit, wheel to zoom, ORBIT toggle auto-spins. Views: HERO (3/4 front = the picture), FRONT, SIDE, BACK.
- EXPLODE slider 0..1 with stage labels ARMOR · DRIVES · GEARS, plus an EXPLODED toggle that animates 0↔1:
  0–0.35 armor panels fly off along their outward normals; 0.35–0.7 drive modules slide out of their sockets along
  the joint axis; 0.7–1 each drive splits into motor / stage 1 / stage 2 / bearing, spaced along its axis, planets
  visible between sun and ring. Sliding back to 0 reassembles exactly.
- X-RAY ARMOR toggle: armor fades to ~15% ghost with edges, insides visible in place.
- ISOLATE buttons: HEAD, REACTOR, SHOULDER, BLADE ARM, HIP, KNEE, FOOT. Others fade to ghost, camera flies to the
  module, its drive opens, gears keep turning. Press again to release.
- CLICK TO PULL: raycast click on any armor panel or drive module: it slides out along its explode vector (eased
  0.6 s) with an orange outline and a label; click again puts it back. Hover highlights. REASSEMBLE ALL button.
  Counter "PARTS OUT n / total".
- Panels: title VX-7 DUELIST · TEARDOWN; selected-drive panel (name, joint angle, deg/s, motor rpm, 49:1, teeth
  sun 12 · planet 30 · ring 72 · m 4, torque N·m); reactor panel (kW bar); sequence buttons STANCE/STRIDE/STRIKE;
  LABELS toggle with leader lines naming parts. Auto tour when idle (copy the Cessna pattern) that shows: hero →
  x-ray → explode in stages → isolate shoulder → knee → reactor → reassemble. Any input hands control over.

## Layout of this repo (public: no absolute /Users paths anywhere in code or docs)

```
vx7-shared/  kin.js  mech.js  stage.js  console.js  tour.js  live.js
vx7-live/main.js
tools/shoot.mjs      review stills (below)
docs/index.html      copy of the built page (for GitHub Pages)
README.md            what it is, a hero image, how to build (clone elvarofficial/teardown next to this repo,
                     npm install there, then `node ../teardown/sims/build.mjs ./vx7-live`)
LICENSE              MIT; credit elvarofficial/teardown and whaleyxbt/claude-motion (MIT)
```

Build, from this folder: `node ../teardown/sims/build.mjs ./vx7-live` → `teardown-out/dist/vx7-live.html`.

## Test hooks (window.LIVE) — required, the checks use them

`setExplode(k)`, `setDisplay(key, on)`, `isolate(name|null)`, `pull(partId)`, `reassemble()`, `setSeq(name, tau)`,
`setView(name)`, `takeOver()`, `parts` (array of {id, name, kind:'armor'|'drive'|'frame'|'hydraulic'|'reactor'}),
`gearCount()`, `homeError()` (max world distance in metres of any part from its assembled home).

## tools/shoot.mjs

Playwright from `../teardown/node_modules/playwright`, `executablePath: process.env.CHROMIUM`, args from
`../teardown/paths.mjs` CHROMIUM_ARGS (real GPU). Load the built page at 1600x900, wait for `window.SIM_SHOWN`,
call `LIVE.takeOver()`, drive the hooks, wait ~1.2 s per state, write: `review/01-hero.png`, `02-xray.png`,
`03-explode-armor.png` (0.35), `04-explode-full.png` (1.0), `05-iso-shoulder.png`, `06-iso-knee.png`,
`07-iso-reactor.png`, `08-pulled-panel.png`, `09-reassembled.png`, `10-strike.png`. Collect console errors and page
errors; exit 1 if any. ALWAYS close the browser in `finally`.
Run it with: `CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" node tools/shoot.mjs`
(the Bash call that launches the browser needs `dangerouslyDisableSandbox: true`; the sandbox blocks the GPU).

## CHECK (every line must pass; each is a command)

1. `node ../teardown/sims/build.mjs ./vx7-live` exits 0; `teardown-out/dist/vx7-live.html` exists and is < 1.5 MB.
2. `node tools/shoot.mjs` exits 0 with zero console/page errors and writes all 10 PNGs in `review/`.
3. In the page: armor parts ≥ 40, drive parts ≥ 10, `gearCount()` ≥ 50 (10 drives × sun + 3 planets + ring per stage).
4. After `setExplode(1)` then `reassemble()` + `setExplode(0)`: `homeError() < 0.001`.
5. You OPEN every PNG and compare `01-hero.png` against `ref/vx7-reference.png`: wide stance, digitigrade legs, blade on
   the viewer-left arm pointing down-left, tall shield behind the viewer-right shoulder, glowing orange chest core,
   white armor on graphite. `04` shows gears and motors clearly separated. Fix and reshoot until true.
6. `grep -rn '/Users/' vx7-shared vx7-live tools docs README.md` prints nothing.
7. `docs/index.html` is a copy of the final build.

## How to work

- **Commit the first working step before anything else** — even a page showing the torso and one turning gearbox.
  A piece committed survives a timeout; a piece in your context does not. Then commit as each piece lands
  (insides, explode, isolate/pull, console, tour, shoot tool, README). Branch: main. Message ends with
  `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- If a file you are about to create already exists, read it first and continue it.
- Do not edit anything in `../teardown/` (third-party repo). Do not push. Do not start servers or leave browsers open.
- Final message: the CHECK list with pass/fail per line and the evidence (numbers, file sizes), and anything unfinished.
