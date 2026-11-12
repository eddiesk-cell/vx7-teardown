# VX-7 Duelist · teardown

A take-apart 3D simulator of a white fighting mech: one offline HTML page. Spin it, pull the armor off panel by panel,
slide every joint's motor and planetary gearbox out and watch the gears turn.

![VX-7 hero](review/01-hero.png)

![Exploded](review/04-explode-full.png)

## How it is made

- **Outside: a painted 3D shell made from pictures.** `ref/vx7-reference.png` is the design; `ref/vx7-turnaround.png`
  (front, side, back) and `ref/vx7-exploded.png` were made from it. The front view, with shield and blade cut out
  (`ref/vx7-front-cutout.png`), went through Hunyuan3D-2mini (shape) and Hunyuan3D paint, both run locally with MLX.
  `tools/shell/` holds every step: cut-out, clean-up, joint measurement, web packing (int16 positions, JPEG texture, 3.5 MB).
- **The shell is cut into ~70 armor panels in the page** (`vx7-shared/shell.js`): each triangle goes to the bone it sits
  closest to, then by angle around the bone and band along it. Each panel rides its joint, flies out on EXPLODE and pulls
  out on a click.
- **Inside: built from code** (`vx7-shared/inner.js`, `mech.js`): graphite frame, spine, cables, the chest reactor, knee /
  hock / elbow hydraulics (bore 50, rod 28, stroke 180 mm, rod length from the law of cosines), the shield and the plasma blade.
- **10 planetary drives** (neck, waist, shoulders, elbows, hips, knees): frameless BLDC motor (24 coil slots, 20 magnets,
  encoder disc), two planetary stages (sun 12T, 3 planets 30T, ring 72T, 7:1 each, **49:1** total), cross-roller bearing,
  collar and circlips. 100 toothed gears that mesh and turn from the joint angle.
- **Joints** sit on centres measured on the shell (`REST` in `vx7-shared/kin.js`); every pose, gear angle, torque, rpm and the
  reactor kW readout is a function of `(sequence, tau)` there.

## Controls

EXPLODE slider in three stages (ARMOR, DRIVES, GEARS), X-RAY ARMOR, ISOLATE (head, reactor, shoulder, blade arm, hip, knee,
foot), LABELS, four views, orbit, click any panel to pull it out and again to put it back, REASSEMBLE ALL, sequences STANCE /
STRIDE / STRIKE, and an auto tour that hands control to you on any input.

## Build

The page is bundled with the [teardown](https://github.com/elvarofficial/teardown) kit. Clone it next to this repo:

```
git clone https://github.com/elvarofficial/teardown ../teardown
(cd ../teardown && npm install)
node ../teardown/sims/build.mjs ./vx7-live        # -> teardown-out/dist/vx7-live.html (about 5.5 MB, works from file://)
```

`docs/index.html` is a copy of that build.

Review stills (needs Playwright's Chromium, or point `CHROMIUM` at any Chrome):

```
CHROMIUM=/path/to/chrome node tools/shoot.mjs      # review/01..12 .png, exits 1 on any console error
CHROMIUM=/path/to/chrome node tools/tour-check.mjs # runs the auto tour once and prints fps
```

Test hooks live on `window.LIVE`: `setExplode(k)`, `setDisplay(key, on)`, `isolate(name|null)`, `pull(partId)`, `reassemble()`,
`setSeq(name, tau)`, `setView(name)`, `takeOver()`, `parts`, `gearCount()`, `homeError()`.

## Credits and license

Code: MIT. Built with [elvarofficial/teardown](https://github.com/elvarofficial/teardown) (MIT), whose kit is from
[whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT). The shell was generated with Tencent
Hunyuan3D-2 models (Tencent Hunyuan Community License, which does not cover the EU, the UK or South Korea).
