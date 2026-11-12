"""Score for the VX-7 film: a dark low pad in D minor under everything, a motor hum that rises while he runs, a heavy
metal footfall on every step, air on every swing, a deep hit on every landing and blow, a rattle when the armor flies
off and a soft sweep for the x-ray.

    python ../teardown/run_sfx.py vx7-shared/score.py

Every time comes from vx7-film/timeline.json (tools/timeline.mjs writes it from the film script and the moves).
"""

import math
import os

from sfx.score_kit import airy, bang, hz, motor, rattle, thud
from sfx.synth import click, impact, pad, whoosh

TIMELINE = "../vx7-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "vx7-score.wav")
TARGET_LUFS = -14.0
SEED = 7

CHORDS = [[hz(n) for n in c.split()] for c in ("D2 A2 D3 F3", "Bb1 F2 Bb2 D3", "F2 C3 F3 A3", "C2 G2 C3 E3")]


def laser(dur=0.2):
    """A blaster bolt: a bright tone falling from 2.6 kHz to 260 Hz with a fast decay."""
    n = int(dur * 48000)
    out, ph = [], 0.0
    for k in range(n):
        u = k / n
        ph += 2 * math.pi * 2600 * (0.1 ** u) / 48000
        out.append((math.sin(ph) + 0.35 * math.sin(3 * ph)) * math.exp(-u * 4.5) * min(1, k / 60))
    return out


def score(mix, tl):
    dur = tl["duration"]
    left, right = pad(dur, [(i * 7.0, CHORDS[i % 4]) for i in range(int(dur / 7) + 1)])
    mix.put_stereo(0, left, right, 0.16)
    # the reactor: a low motor under the whole film, a second, brighter one while he runs
    mix.put(0, motor(dur, 55, 600, 3), 0.025)
    for a, b in tl["run"]:
        mix.put(a, motor(b - a, 110, 1800, 9), 0.03)
    for t in tl["step"]:
        mix.put(t, thud(58, 0.07, 0.35), 0.16)
        mix.put(t + 0.004, click(700, 0.04), 0.035)
    for t in tl["whoosh"]:
        mix.put(t - 0.12, whoosh(0.42, 500, 2600, 0.6), 0.12)
    for t in tl["land"]:
        mix.put(t, thud(44, 0.16, 0.7), 0.34)
        mix.put(t, bang(0.5, int(t * 10)), 0.08)
    for t in tl["hit"]:
        mix.put(t, bang(0.8, int(t * 10)), 0.12)
        mix.put(t, thud(50, 0.12, 0.5), 0.22)
    for t, k in tl["explode"]:
        mix.put(t, rattle(1.6, 16, 2600, int(t), 0.6), 0.05)
        mix.put(t, airy(1.4, 300 if k else 2400, 2400 if k else 300), 0.05)
    for t in tl["laser"]:
        mix.put(t, laser(), 0.09)
        mix.put(t, thud(90, 0.04, 0.2), 0.08)
    for t in tl["xray"]:
        mix.put(t, airy(1.0, 900, 4200), 0.04)
    for t in tl["iso"]:
        mix.put(t, airy(1.2, 2600, 500), 0.05)
    for t in tl["beats"][1:]:
        mix.put(t, click(2200, 0.025), 0.03)
    mix.put(dur - 4.6, impact(3.0), 0.05)
