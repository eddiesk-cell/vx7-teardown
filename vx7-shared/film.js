// The film: the same page on a fixed clock, played from this script. Each event sets a move, a camera, a display
// toggle, the explode target (k, eased over `rate` seconds for the full range), an isolate or a caption. No three.js
// here, so tools/timeline.mjs can read it to place the sounds.
export const FILM = {
  duration: 56,
  events: [
    {t: 0, seq: 'STANCE', view: 'open', orbit: true, cap: ['VX-7 Duelist', 'ONLINE · REACTOR 40 KW']},
    {t: 3.2, seq: 'STRIDE', view: 'walk', orbit: false, cap: ['Walk', '1.7 M/S · DIGITIGRADE LEGS · HYDRAULIC HOCKS']},
    {t: 7.6, seq: 'RUN', view: 'run', cap: ['Run', '6.5 M/S · KNEE MOTORS AT 4,000 RPM']},
    {t: 12.2, seq: 'JUMP', view: 'jump', cap: ['Jump', '1.5 M HIGH · 2.8 M LONG']},
    {t: 15.6, seq: 'ROLL', view: 'roll', cap: ['Combat roll', 'BLADE OFF · TUCK · FULL TURN']},
    {t: 18.4, seq: 'SLASH', view: 'fight', cap: ['Slash', 'PLASMA BLADE · 1.3 M'], dur: 1.4},
    {t: 20.1, seq: 'BLOCK', view: 'fight2', cap: ['Block', 'SHIELD ON A ROTARY DRUM'], dur: 1.5},
    {t: 21.9, seq: 'SHOOT', view: 'shoot', cap: ['Shoot', 'LASER EMITTER · LEFT FOREARM'], dur: 1.7},
    {t: 23.9, seq: 'FIGHT', view: 'fight2', xray: true, cap: ['X-ray', 'EVERY DRIVE AND PISTON UNDER THE ARMOR']},
    {t: 29.5, seq: 'RUN', view: 'run2', xray: false, k: 0.35, rate: 4, cap: ['Armor off', 'THE FRAME KEEPS RUNNING']},
    {t: 35.0, seq: 'FIGHT', view: 'fight', cap: ['Inside the fight', '10 PLANETARY DRIVES · 6 HYDRAULIC CYLINDERS']},
    {t: 40.6, seq: 'STANCE', view: 'hero', orbit: true, k: 1, rate: 4, cap: ['{parts} parts', 'EVERY ONE COMES OUT'], dur: 4.6},
    {t: 46.0, seq: 'FIGHT', view: 'fight2', orbit: false, k: 0, rate: 2.5, iso: 'SHOULDER', cap: ['Right shoulder', 'SUN 12 · PLANET 30 · RING 72 · 49:1']},
    {t: 51.6, seq: 'STRIDE', view: 'hero', orbit: true, iso: null, cap: ['VX-7 Duelist', 'TURN HIM · TAKE HIM APART · BUILT FROM CODE'], dur: 4.4},
  ],
};
