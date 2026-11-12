// The auto tour: a list of button presses with times. The pointer glides between buttons and the same handlers run
// that a visitor's click would, so a takeover keeps whatever state the tour reached.
export const TOUR = [
  {t: 0.5, key: 'seq-STANCE'},
  {t: 3.2, key: 'disp-xray'},
  {t: 6.2, key: 'disp-xray'},
  {t: 7.4, key: 'disp-exploded'},
  {t: 15.5, key: 'disp-exploded'},
  {t: 18.6, key: 'iso-SHOULDER'},
  {t: 23.4, key: 'iso-KNEE'},
  {t: 28.2, key: 'iso-REACTOR'},
  {t: 32.6, key: 'iso-REACTOR'},
  {t: 33.6, key: 'seq-STRIKE'},
  {t: 37.2, key: 'disp-labels'},
  {t: 40.4, key: 'disp-labels'},
  {t: 41.0, key: 'seq-STRIDE'},
  {t: 44.0, key: 'view-side'},
  {t: 46.5, key: 'view-hero'},
];
export const TOUR_DURATION = 49;
const ease = (x) => x * x * (3 - 2 * x);
// the pointer position at tour time c, gliding from the previous press to the next
export function cursorAt(c, spots) {
  let i = -1;
  while (i + 1 < TOUR.length && TOUR[i + 1].t <= c) i++;
  const prev = i >= 0 ? spots[TOUR[i].key] : [800, 520];
  const nxt = TOUR[Math.min(TOUR.length - 1, i + 1)];
  const next = spots[nxt.key];
  const t0 = i >= 0 ? TOUR[i].t + 0.35 : 0;
  const t1 = nxt.t - 0.15;
  const k = i + 1 >= TOUR.length ? 1 : ease(Math.min(1, Math.max(0, (c - t0) / Math.max(0.3, t1 - t0))));
  const tgt = i + 1 >= TOUR.length ? prev : next;
  const x = prev[0] + (tgt[0] - prev[0]) * k;
  const y = prev[1] + (tgt[1] - prev[1]) * k;
  const since = i >= 0 ? c - TOUR[i].t : 9;
  return {x, y, press: since >= 0 && since < 0.18, ring: Math.max(0, 1 - since / 0.55), ringX: i >= 0 ? spots[TOUR[i].key][0] : 0, ringY: i >= 0 ? spots[TOUR[i].key][1] : 0};
}
