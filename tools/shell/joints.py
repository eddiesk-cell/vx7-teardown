# Joint positions for the VX-7 shell: x,y from the front picture, z from cross-sections of the mesh. Prints metres.
import sys, json, numpy as np, trimesh
m = trimesh.load(sys.argv[1], force='mesh')
V = m.vertices
lo, hi = V.min(0), V.max(0)
H_M = 3.6
FX0, FX1, FY0, FY1 = 290, 850, 23, 1104          # front picture figure bbox (px)
def to_mesh(px, py):
    return (lo[0] + (px - FX0) / (FX1 - FX0) * (hi[0] - lo[0]), hi[1] - (py - FY0) / (FY1 - FY0) * (hi[1] - lo[1]))
s = H_M / (hi[1] - lo[1])
xb, _ = to_mesh(600, 0)                             # body centre line
J = {  # name: (px, py, half-width px of the limb at that height)
    'pelvis': (603, 400, 60), 'waist': (600, 330, 40), 'chest': (595, 235, 90), 'neck': (600, 140, 25), 'head': (600, 75, 30),
    'hipR': (497, 410, 45), 'hipL': (703, 408, 45), 'kneeR': (480, 650, 35), 'kneeL': (705, 650, 35),
    'hockR': (452, 930, 28), 'hockL': (728, 930, 28), 'footR': (442, 1065, 30), 'footL': (735, 1065, 30),
    'shR': (450, 192, 35), 'shL': (755, 188, 35), 'elR': (405, 335, 28), 'elL': (765, 345, 28),
    'wrR': (345, 525, 25), 'wrL': (805, 520, 25), 'handL': (800, 612, 25), 'handR': (330, 575, 22),
}
out = {}
for k, (px, py, hw) in J.items():
    x, y = to_mesh(px, py)
    r = hw / (FX1 - FX0) * (hi[0] - lo[0])
    sel = (np.abs(V[:, 1] - y) < 0.025) & (np.abs(V[:, 0] - x) < r)
    if sel.sum() < 5:
        sel = (np.abs(V[:, 1] - y) < 0.05) & (np.abs(V[:, 0] - x) < r * 1.5)
    z = (V[sel, 2].min() + V[sel, 2].max()) / 2 if sel.sum() else 0
    out[k] = [round((x - xb) * s, 3), round((y - lo[1]) * s, 3), round(z * s, 3)]
    print(f'{k:7s} n={int(sel.sum()):5d}  {out[k]}')
zc = out['pelvis'][2]
for k in out: out[k][2] = round(out[k][2] - zc, 3)
xf = {'scale': round(s, 5), 'offset': [round(-xb * s, 4), round(-lo[1] * s, 4), round(-zc, 4)]}
print('MESH->METRES', json.dumps(xf))
print('JOINTS', json.dumps(out))
