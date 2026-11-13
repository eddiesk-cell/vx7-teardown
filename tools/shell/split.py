# Cuts the painted shell into armor plates and writes them as one GLB (a mesh per plate).
#   python3 tools/shell/split.py vx7-shared/assets/vx7-shell.glb vx7-shared/assets/vx7-armor.glb
# 1. Each segment scores every vertex by its distance to the bone (in units of its radius). A segment cannot reach
#    behind the joint it hangs from and its parent cannot reach past it, so neighbours meet on a plane at the joint.
# 2. Each joint plane slides along its normal to the place where the cut crosses the least white armor: the dark
#    mechanical gap between two plates, as in the reference. A plate is never cut in half if a gap is near.
# 3. Every segment keeps only its largest connected patch of surface; stray bits (a claw tip that scored closer to the
#    thigh) go to the segment around them, so nothing of one part rides on another.
# 4. Triangles on a boundary are clipped exactly on it, and normals are smoothed over the whole shell first, so the
#    assembled shell shows no seam.
# 5. Each of the 17 pieces is cut into plates on straight panel lines (bands and sectors round its bone, each nudged to
#    a painted seam), with a panel groove between plates and a dark edge for their thickness.
import io, json, re, struct, sys, base64
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

SRC, OUT = sys.argv[1:3]
KIN = 'vx7-shared/kin.js'
BIG = 400.0           # score per metre on the wrong side of a joint plane
DARK = 0.45           # texture luminance below this is a dark joint gap, above it white or orange armor

# ---- read the quantized shell (quant.py output): positions in metres, UVs, triangles, the paint
b = open(SRC, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]; G0 = json.loads(b[20:20 + L]); bin0 = 20 + L + 8
def view(i):
    bv = G0['bufferViews'][i]; o = bin0 + bv.get('byteOffset', 0); return b[o:o + bv['byteLength']]
def acc(i):
    a = G0['accessors'][i]; bv = G0['bufferViews'][a['bufferView']]
    dt = {5122: np.int16, 5123: np.uint16, 5125: np.uint32}[a['componentType']]; n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    st = bv.get('byteStride', 0) // np.dtype(dt).itemsize or n
    return np.frombuffer(view(a['bufferView']), dtype=dt).reshape(-1, st)[:a['count'], :n].astype(np.float64)
nd = G0['nodes'][0]; pr = G0['meshes'][0]['primitives'][0]
F = acc(pr['indices']).astype(np.int64).reshape(-1, 3)
P = (acc(pr['attributes']['POSITION']) / 32767 * nd['scale'] + nd['translation'])[F].reshape(-1, 3)   # triangle soup
UV = (acc(pr['attributes']['TEXCOORD_0']) / 65535)[F].reshape(-1, 2)
JPEG = view(G0['images'][0]['bufferView'])
img = np.asarray(Image.open(io.BytesIO(JPEG)).convert('RGB')).astype(np.float32) @ [0.3 / 255, 0.59 / 255, 0.11 / 255]
def lum(uv):
    return img[np.clip((uv[:, 1] * img.shape[0]).astype(int), 0, img.shape[0] - 1), np.clip((uv[:, 0] * img.shape[1]).astype(int), 0, img.shape[1] - 1)]
NV = len(P)

# weld by position: connectivity and smooth normals
key = np.round(P * 2000).astype(np.int64)
uid = np.unique(key, axis=0, return_inverse=True)[1].ravel(); NU = uid.max() + 1
T = P.reshape(-1, 3, 3)
fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])                     # area-weighted face normals
acc_n = np.zeros((NU, 3)); np.add.at(acc_n, uid, np.repeat(fn, 3, axis=0))
NRM = acc_n[uid] / np.maximum(np.linalg.norm(acc_n[uid], axis=1, keepdims=True), 1e-12)

# ---- segments, from the same rest joints the page poses
REST = {k: np.array(list(map(float, v.split(',')))) for k, v in re.findall(r'(\w+): \[([-\d., ]+)\]', open(KIN).read().split('export const REST')[1].split('};')[0])}
unit = lambda v: v / np.linalg.norm(v)
Y = np.array([0, 1.0, 0])
S = [dict(id='pelvis', a=np.array([-0.2, 2.34, 0]), b=np.array([0.2, 2.34, 0]), r=0.17),
     dict(id='torso', a=np.array([0, 2.6, -0.05]), b=np.array([0, 3.16, -0.05]), r=0.3, up='pelvis', p=REST['waist'], n=Y),
     dict(id='head', a=REST['neck'], b=np.array([0, 3.62, 0]), r=0.15, up='torso', p=REST['neck'], n=Y)]
for s, sx in (('L', 1), ('R', -1)):
    S += [dict(id='upper' + s, a=REST['sh' + s] + [0, 0.08, 0], b=REST['el' + s], r=0.12, up='torso', p=REST['sh' + s] + [-0.12 * sx, 0, 0], n=np.array([sx, 0, 0.])),
          dict(id='fore' + s, a=REST['el' + s], b=REST['wr' + s], r=0.11, up='upper' + s),
          dict(id='hand' + s, a=REST['wr' + s], b=REST['hand' + s], r=0.08, up='fore' + s),
          dict(id='thigh' + s, a=REST['hip' + s], b=REST['knee' + s], r=0.14, up='pelvis'),
          dict(id='shin' + s, a=REST['knee' + s], b=REST['hock' + s], r=0.11, up='thigh' + s),
          dict(id='meta' + s, a=REST['hock' + s], b=REST['foot' + s], r=0.08, up='shin' + s),
          dict(id='foot' + s, a=REST['foot' + s], b=REST['foot' + s] + [0, -0.11, 0.3], r=0.1, up='meta' + s)]
ID = {g['id']: i for i, g in enumerate(S)}
for g in S:
    g['u'] = unit(g['b'] - g['a']); g['len'] = np.linalg.norm(g['b'] - g['a']); g['kids'] = []
for g in S:
    if 'up' not in g: continue
    par = S[ID[g['up']]]; par['kids'].append(g)
    g.setdefault('p', g['a'].copy())
    g.setdefault('n', g['u'].copy() if g['up'] == 'pelvis' else unit(par['u'] + g['u']))

def cap(g, X):
    t = np.clip((X - g['a']) @ g['u'] / g['len'], 0, 1)
    return np.linalg.norm(X - (g['a'] + t[:, None] * g['len'] * g['u']), axis=1) / g['r']
def rho(g, X):
    d = X - g['a']; return np.linalg.norm(d - np.outer(d @ g['u'], g['u']), axis=1)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def wall(par, kid, X):
    """how far X is on the child's side of the joint, for the parent's penalty (metres, 0 on its own side)"""
    d = (X - kid['p']) @ kid['n']
    if par['id'] == 'pelvis' and kid['id'] != 'torso':
        # a thigh comes off on its hip plane on the outside; inside, the pelvis may compete (2b draws that line)
        return np.maximum(0, d) * smooth(0.22, 0.30, np.sign(kid['a'][0]) * X[:, 0])
    if kid['id'] == 'head':   # the chest is held back only near the head: it keeps the collar
        return np.maximum(0, d) * (1 - smooth(1.6 * kid['r'], 2.4 * kid['r'], rho(kid, X)))
    return np.maximum(0, d)   # a limb never reaches past its next joint, nor the chest past a shoulder
def scores(X):
    out = np.empty((len(X), len(S)))
    for i, g in enumerate(S):
        s = cap(g, X)
        if 'up' in g: s += BIG * np.maximum(0, -(X - g['p']) @ g['n'])
        for k in g['kids']: s += BIG * wall(g, k, X)
        out[:, i] = s
    return out

# ---- 2. slide each joint plane to the darkest crossing near it
base = np.stack([cap(g, P) for g in S], 1).argmin(1).reshape(-1, 3)      # bone-distance only, to pick the joint's own surface
cen = T.mean(1)
def crossing(Tn, Un, p, n):
    d = (Tn - p) @ n
    sg = d > 0
    m = sg.any(1) & ~sg.all(1)
    if not m.any(): return 0.0, 0.0
    d, Tn, Un, sg = d[m], Tn[m], Un[m], sg[m]
    pts, uvs = [], []
    for e0, e1 in ((0, 1), (1, 2), (2, 0)):
        c = sg[:, e0] != sg[:, e1]
        f = np.where(c, d[:, e0] / np.where(c, d[:, e0] - d[:, e1], 1), 0)[:, None]
        pts.append((Tn[:, e0] + f * (Tn[:, e1] - Tn[:, e0]), c)); uvs.append(Un[:, e0] + f * (Un[:, e1] - Un[:, e0]))
    # each crossing triangle has exactly two crossed edges: pair them up
    cs = np.stack([c for _, c in pts], 1)
    P3 = np.stack([q for q, _ in pts], 1); U3 = np.stack(uvs, 1)
    idx = np.argsort(~cs, axis=1, kind='stable')[:, :2]
    r = np.arange(len(d))
    a, bb = P3[r, idx[:, 0]], P3[r, idx[:, 1]]
    ln = np.linalg.norm(bb - a, axis=1)
    lm = lum((U3[r, idx[:, 0]] + U3[r, idx[:, 1]]) / 2)
    return ln.sum(), (ln * (lm > DARK)).sum()
print('joint      shift   cut length   white crossed')
cost = {}
for g in S:
    if 'up' not in g: continue
    par = S[ID[g['up']]]
    own = np.isin(base, [ID[g['id']], ID[par['id']]]).all(1) & (np.abs((cen - g['p']) @ g['n']) < 0.16) & (rho(g, cen) < 2.6 * g['r'])
    # a shoulder may only move a little: further in, the darkest line runs through the back, not the shoulder joint
    span = 0.04 if g['id'].startswith('upper') else 0.10
    ts = np.round(np.arange(-span, span + 0.001, 0.01), 2)
    m = [crossing(T[own], UV.reshape(-1, 3, 2)[own], g['p'] + t * g['n'], g['n']) for t in ts]
    cost[g['id']] = (ts, np.array([br + 0.15 * tot + 1.5 * abs(t) for t, (tot, br) in zip(ts, m)]), m)
for g in S:
    if 'up' not in g: continue
    ts, c, m = cost[g['id']]
    k = int(np.argmin(c))
    tot, br = m[k]
    print(f"{g['id']:8s} {ts[k]:+.2f} m   {tot:6.2f} m   {br / max(tot, 1e-9):5.0%}")
    g['p'] = g['p'] + ts[k] * g['n']

# ---- 1. label every vertex
SC = scores(P)
lab_u = np.full(NU, -1); lab_u[uid] = SC.argmin(1)                      # identical positions score identically

E = np.concatenate([uid.reshape(-1, 3)[:, [0, 1]], uid.reshape(-1, 3)[:, [1, 2]], uid.reshape(-1, 3)[:, [2, 0]]])
E = np.unique(np.sort(E[E[:, 0] != E[:, 1]], 1), axis=0)

# ---- 2b. the hips are not tubes: the pelvis plates (front and rear) overlap the thighs, so there the line between a
# thigh and the pelvis follows the dark gap around those plates. Within a window round each crotch side it is the
# cheapest closed line between the pelvis middle and the thigh's outside, where crossing white armor costs 20 times
# more than crossing a dark gap (a minimum cut). The line is then smoothed and every triangle clipped on it.
PU = np.zeros((NU, 3)); PU[uid] = P
LU = np.zeros(NU); cnt = np.zeros(NU); np.add.at(LU, uid, lum(UV)); np.add.at(cnt, uid, 1); LU /= cnt
from scipy.sparse.csgraph import maximum_flow
from scipy.sparse import csr_matrix
nbr = coo_matrix((np.ones(2 * len(E)), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(NU, NU)).tocsr()
for s_ in ('L', 'R'):
    A, B = ID['pelvis'], ID['thigh' + s_]
    th = S[B]; sx = np.sign(th['a'][0]); X = PU
    roi = np.isin(lab_u, [A, B]) & (X[:, 1] > th['a'][1] - 0.5) & (X[:, 1] < th['a'][1] + 0.12) & (sx * X[:, 0] > -0.02) & (sx * X[:, 0] < 0.30)
    inner = roi[E[:, 0]] & roi[E[:, 1]]
    edge_out = roi[E[:, 0]] ^ roi[E[:, 1]]                                    # edges leaving the window
    v_in = np.where(roi[E[edge_out, 0]], E[edge_out, 0], E[edge_out, 1]); v_out = np.where(roi[E[edge_out, 0]], E[edge_out, 1], E[edge_out, 0])
    src = np.zeros(NU, bool); snk = np.zeros(NU, bool)
    src[v_in[lab_u[v_out] == A]] = True; snk[v_in[lab_u[v_out] == B]] = True  # agree with the pieces round the window
    src |= roi & (sx * X[:, 0] < 0.03)                                          # the pelvis middle
    snk |= roi & (sx * X[:, 0] > 0.27) & ~src                                   # the thigh's outside
    src &= ~snk
    e = E[inner]
    ln = np.linalg.norm(X[e[:, 0]] - X[e[:, 1]], axis=1)
    w = ln * (0.05 + ((LU[e[:, 0]] + LU[e[:, 1]]) / 2 > DARK))
    cap = np.maximum(1, np.round(w * 1e5)).astype(np.int32)
    ids = np.nonzero(roi)[0]; loc = -np.ones(NU, int); loc[ids] = np.arange(len(ids)); n = len(ids); SRC_, SNK_ = n, n + 1
    big = np.int32(2 ** 30)
    rows = np.r_[loc[e[:, 0]], loc[e[:, 1]], np.full(src.sum(), SRC_), loc[np.nonzero(snk)[0]]]
    cols = np.r_[loc[e[:, 1]], loc[e[:, 0]], loc[np.nonzero(src)[0]], np.full(snk.sum(), SNK_)]
    caps = np.r_[cap, cap, np.full(src.sum() + snk.sum(), big)]
    G = csr_matrix((caps, (rows, cols)), shape=(n + 2, n + 2))
    G.sum_duplicates()
    mf = maximum_flow(G, SRC_, SNK_); fl = mf.flow
    R = (G - fl).tocsr(); R.data = (R.data > 0).astype(np.int8); R.eliminate_zeros()
    seen = np.zeros(n + 2, bool); stack = [SRC_]; seen[SRC_] = True
    while stack:
        k = stack.pop()
        for q in R.indices[R.indptr[k]:R.indptr[k + 1]]:
            if not seen[q]: seen[q] = True; stack.append(q)
    f = seen[:n].astype(float)                                                  # 1 pelvis, 0 thigh
    free = ~(src[ids] | snk[ids])
    sub = nbr[ids][:, ids]; deg = np.asarray(sub.sum(1)).ravel()
    for _ in range(8):                                                          # smooth the stair-stepped line
        f = np.where(free & (deg > 0), (sub @ f) / np.maximum(deg, 1), f)
    # scores for the window: these two segments win, and they trade places where f crosses one half
    corner = np.isin(uid, ids)
    fc = f[loc[uid[corner]]]
    base_s = SC[corner].min(1) - 10
    SC[corner, A] = base_s + (0.5 - fc)
    SC[corner, B] = base_s - (0.5 - fc)
    lab_u[ids] = np.where(f > 0.5, A, B)
    print(f'hip {s_}: window {n} vertices, {int((f > 0.5).sum())} to the pelvis, cut {mf.flow_value / 1e5:.2f} m-equivalent')

# ---- 3. keep each segment's largest connected patch; give stray patches to the segment around them
moved = 0
for i in range(len(S)):
    on = lab_u == i
    e = E[on[E[:, 0]] & on[E[:, 1]]]
    nc, comp = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(NU, NU)), directed=False)
    sizes = np.bincount(comp[on], minlength=nc)
    stray = on & (comp != sizes.argmax())
    moved += stray.sum(); lab_u[stray] = -1
while (lab_u < 0).any():
    e = E[(lab_u[E[:, 0]] < 0) & (lab_u[E[:, 1]] >= 0)]
    e = np.concatenate([e, E[(lab_u[E[:, 1]] < 0) & (lab_u[E[:, 0]] >= 0)][:, ::-1]])
    if not len(e): break
    votes = coo_matrix((np.ones(len(e)), (e[:, 0], lab_u[e[:, 1]])), shape=(NU, len(S))).toarray()
    fill = (lab_u < 0) & (votes.sum(1) > 0)
    lab_u[fill] = votes[fill].argmax(1)
print('stray vertices moved to their neighbours:', int(moved))
lab = lab_u[uid]
# a moved vertex must win its new segment's comparison when its triangle is clipped
forced = lab != SC.argmin(1)
SC[forced, lab[forced]] = SC[forced].min(1) - 1

# ---- 4. clip triangles that straddle a boundary
pieces = [[] for _ in S]
L3 = lab.reshape(-1, 3)
whole = (L3[:, 0] == L3[:, 1]) & (L3[:, 1] == L3[:, 2])
REC = np.concatenate([P, UV, NRM], 1)                                    # x y z u v nx ny nz
for i in range(len(S)):
    m = whole & (L3[:, 0] == i)
    pieces[i].append(REC.reshape(-1, 3, 8)[m].reshape(-1, 8))
def clip(poly, i, j):
    out = []
    for k in range(len(poly)):
        A, B = poly[k], poly[(k + 1) % len(poly)]
        fa, fb = A[i] - A[j], B[i] - B[j]
        if fa <= 0: out.append(A)
        if (fa <= 0) != (fb <= 0): out.append(A + (B - A) * (fa / (fa - fb)))
    return out
for t in np.nonzero(~whole)[0]:
    ids = sorted(set(L3[t]))
    tri = [np.concatenate([REC[3 * t + q], SC[3 * t + q, ids]]) for q in range(3)]
    for li, Lb in enumerate(ids):
        poly = tri
        for mi in range(len(ids)):
            if mi != li and poly: poly = clip(poly, 8 + li, 8 + mi)
        pieces[Lb] += [np.array([poly[0][:8], poly[k][:8], poly[k + 1][:8]]) for k in range(1, len(poly) - 1)]
pieces = [np.concatenate([x.reshape(-1, 8) for x in pc]) for pc in pieces]
print('clipped triangles:', int((~whole).sum()))

# ---- 5. each piece comes apart into armor plates on straight panel lines, like the exploded reference
# (ref/vx7-exploded.png): white plates with clean edges and real thickness lifting off the mechanical body. A piece is
# cut by bands (planes across its bone) and sectors (half-planes along it, from the bone axis). Each line slides a
# little, along the bone or round it, to where it crosses the least white armor in the paint, so it follows a painted
# seam where there is one. Plates keep a GAP between them (the panel line) and get a dark edge wall of THICK.
import math
import cv2
GAP = 0.006            # m: the groove between two plates
THICK = 0.012          # m: plate thickness
LAYOUT = {             # bands: fractions along the bone; sectors: boundary angles (deg) round it, 0 = the front
    'pelvis': ([], [90, 270]), 'torso': ([0.5], [45, 135, 225, 315]), 'head': ([], [90, 270]),
    'upper': ([0.5], [90, 270]), 'fore': ([0.5], [90, 270]), 'hand': ([], [90, 270]),
    'thigh': ([0.36, 0.7], [90, 270]), 'shin': ([0.36, 0.7], [90, 270]), 'meta': ([0.5], [90, 270]), 'foot': ([], [90, 270])}
def frame_of(g):
    u = g['u']; ref = np.array([0, 1.0, 0]) if abs(u[2]) > 0.6 else np.array([0, 0, 1.0])
    f = ref - (ref @ u) * u; f /= np.linalg.norm(f)
    return u, f, np.cross(u, f)
def radial(g, X):
    u, f, l = frame_of(g); d = X - g['a']; return d - np.outer(d @ u, u), d @ u
def mdir(g, th):
    u, f, l = frame_of(g); r = math.radians(th); return math.cos(r) * f + math.sin(r) * l
def _dark_uv():
    gb = cv2.blur(img.astype(np.float32), (9, 9)); v = cv2.blur(img.astype(np.float32) ** 2, (9, 9)) - gb * gb
    y, x = np.unravel_index(np.argmin(np.where((gb > 0.08) & (gb < 0.2), v, 1e9)), gb.shape)
    return np.array([(x + 0.5) / img.shape[1], (y + 0.5) / img.shape[0]])  # a flat dark graphite texel
DUV = _dark_uv()
def tune(g, pc, bands, secs):
    """slide every band along the bone and every sector line round it to the darkest crossing nearby"""
    T_ = pc[:, :3].reshape(-1, 3, 3); U_ = pc[:, 3:5].reshape(-1, 3, 2); C_ = T_.mean(1)
    R_, t_ = radial(g, C_)
    out_b, out_s = [], []
    for fr in bands:
        best = None
        for dt in np.linspace(-0.12, 0.12, 13):
            tot, br = crossing(T_, U_, g['a'] + (fr + dt) * g['len'] * g['u'], g['u'])
            c = br + 0.15 * tot + 0.4 * abs(dt)
            if best is None or c < best[0]: best = (c, fr + dt)
        out_b.append(best[1] * g['len'])
    for th in secs:
        best = None
        for dth in range(-20, 21, 5):
            m = R_ @ mdir(g, th + dth) > 0                                    # only this half-plane's side
            n = mdir(g, th + dth + 90)
            tot, br = crossing(T_[m], U_[m], g['a'], n)
            c = br + 0.15 * tot + 0.004 * abs(dth)
            if tot > 0 and (best is None or c < best[0]): best = (c, th + dth)
        out_s.append(best[1] if best else th)
    return out_b, out_s
def cell_score(g, X, bands, secs, bi, si):
    """how far X lies outside cell (band bi, sector si), in metres; <= 0 inside"""
    R_, t_ = radial(g, X)
    s = np.full(len(X), -1e3)
    if bi > 0: s = np.maximum(s, bands[bi - 1] - t_)
    if bi < len(bands): s = np.maximum(s, t_ - bands[bi])
    th1, th2 = secs[si], secs[(si + 1) % len(secs)]
    s = np.maximum(s, -(R_ @ mdir(g, th1 + 90)))                             # inside the wedge from its first edge
    s = np.maximum(s, -(R_ @ mdir(g, th2 - 90)))                             # and from its second
    return s
def fan(poly): return [np.array([poly[0][:8], poly[k][:8], poly[k + 1][:8]]) for k in range(1, len(poly) - 1)]
def walls(rows, c):
    """the plate's thickness: a dark wall down from every open edge"""
    X = rows[:, :3]; kk = [tuple(k) for k in np.round(X * 2000).astype(np.int64)]
    cnt = {}
    for i in range(0, len(rows), 3):
        for a_, b_ in ((i, i + 1), (i + 1, i + 2), (i + 2, i)):
            key = tuple(sorted((kk[a_], kk[b_]))); cnt[key] = cnt.get(key, 0) + 1
    out = []
    for i in range(0, len(rows), 3):
        for a_, b_ in ((i, i + 1), (i + 1, i + 2), (i + 2, i)):
            if cnt[tuple(sorted((kk[a_], kk[b_])))] != 1: continue
            pa, pb, na, nb_ = X[a_], X[b_], rows[a_, 5:8], rows[b_, 5:8]
            qa, qb = pa - THICK * na, pb - THICK * nb_
            wn = np.cross(pb - pa, (na + nb_) / 2); wn /= np.linalg.norm(wn) + 1e-12
            if wn @ ((pa + pb) / 2 - c) < 0: wn = -wn
            v = lambda P_: np.r_[P_, DUV, wn]
            out += [np.array([v(pa), v(pb), v(qb)]), np.array([v(pa), v(qb), v(qa)])]
    return np.concatenate(out).reshape(-1, 8) if out else np.zeros((0, 8))
def plates_of(g, pc):
    bands0, secs0 = LAYOUT[re.sub('[LR]$', '', g['id'])]
    bands, secs = tune(g, pc, bands0, secs0)
    got = []
    for bi in range(len(bands) + 1):
        for si in range(len(secs)):
            phi = cell_score(g, pc[:, :3], bands, secs, bi, si) + GAP / 2
            F3 = phi.reshape(-1, 3)
            R3 = pc.reshape(-1, 3, 8)
            rows = [R3[F3.max(1) <= 0].reshape(-1, 8)]
            for ti in np.nonzero((F3.min(1) < 0) & (F3.max(1) > 0))[0]:
                tri = [np.r_[pc[3 * ti + q], phi[3 * ti + q], -phi[3 * ti + q]] for q in range(3)]
                rows += fan(clip(tri, 8, 9))
            rows = np.concatenate([x.reshape(-1, 8) for x in rows])
            if len(rows) < 30: continue
            mid = (secs[si] + ((secs[(si + 1) % len(secs)] - secs[si]) % 360) / 2)
            got.append((bi, mid, np.concatenate([rows, walls(rows, rows[:, :3].mean(0) - 0.05 * mdir(g, mid))])))
    return got, len(bands)
SIDES = (('FRONT', [0, 0, 1]), ('REAR', [0, 0, -1]), ('TOP', [0, 1, 0]), ('UNDERSIDE', [0, -1, 0]))
def plate_name(g, rows):
    nrm = rows[:, 5:8].mean(0)
    sx = np.sign(g['a'][0]) or 1
    opts = SIDES + (('OUTER', [sx, 0, 0]), ('INNER', [-sx, 0, 0])) if g['a'][0] else SIDES + (('LEFT', [1, 0, 0]), ('RIGHT', [-1, 0, 0]))
    return max(opts, key=lambda o: nrm @ o[1])[0]
plates = []                                                                # (segment, plate name, rows)
for g, pc in zip(S, pieces):
    got, nb = plates_of(g, pc)
    BAND = {0: [''], 1: [' UPPER', ' LOWER'], 2: [' UPPER', ' MIDDLE', ' LOWER']}[nb]
    up = g['u'][1] < 0                                                       # band 0 is the top for a hanging bone
    for bi, mid, rows in got:
        face = rows[rows[:, 3] != DUV[0]]
        side = plate_name(g, face)
        ar = np.linalg.norm(np.cross(face[1::3, :3] - face[0::3, :3], face[2::3, :3] - face[0::3, :3]), axis=1).sum() / 2
        plates.append((g, side + BAND[bi if up else nb - bi], rows))
        print(f"  {g['id']:8s} {plates[-1][1]:22s} {ar * 1e4:7.0f} cm2")
print('plates:', len(plates))

# ---- write: one node + mesh per piece, int16 positions, int8 normals, uint16 UVs (KHR_mesh_quantization), the paint
# the page inlines this file as base64; GitHub's secret scanner refuses a push when a run of it happens to read like a
# Google API key (AIza + 35 chars). Shift the alignment (JSON padding) and, if every alignment still has one, change the
# unused fourth position component (salt) until none does.
def pack(salt):
    blobs, views, accs, nodes, meshes = [], [], [], [], []
    def add(data, target=None, stride=None):
        off = sum(len(x) for x in blobs); blobs.append(data + b'\0' * (-len(data) % 4))
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        if stride: v['byteStride'] = stride
        views.append(v); return len(views) - 1
    for j, (g, label, pc) in enumerate(plates):
        X, U, N = pc[:, :3], pc[:, 3:5], pc[:, 5:8]
        lo, hi = X.min(0), X.max(0); c = (lo + hi) / 2; e = np.maximum((hi - lo) / 2, 1e-6)
        qp = np.full((len(X), 4), salt, np.int16); qp[:, :3] = np.round((X - c) / e * 32767)
        qn = np.full((len(X), 4), salt, np.int8); qn[:, :3] = np.round(N / np.linalg.norm(N, axis=1, keepdims=True) * 127)
        qu = np.round(np.clip(U, 0, 1) * 65535).astype(np.uint16)
        k = len(accs)
        accs += [{'bufferView': add(qp.tobytes(), 34962, 8), 'componentType': 5122, 'normalized': True, 'count': len(X), 'type': 'VEC3', 'min': [-32767] * 3, 'max': [32767] * 3},
                 {'bufferView': add(qn.tobytes(), 34962, 4), 'componentType': 5120, 'normalized': True, 'count': len(X), 'type': 'VEC3'},
                 {'bufferView': add(qu.tobytes(), 34962, 4), 'componentType': 5123, 'normalized': True, 'count': len(X), 'type': 'VEC2'}]
        nm = f"shell-{g['id']}-{sum(x[0] is g for x in plates[:j]) + 1}"
        meshes.append({'name': nm, 'primitives': [{'attributes': {'POSITION': k, 'NORMAL': k + 1, 'TEXCOORD_0': k + 2}, 'material': 0}]})
        nodes.append({'mesh': len(meshes) - 1, 'name': nm, 'translation': c.tolist(), 'scale': e.tolist(), 'extras': {'piece': g['id'], 'plate': label}})
    vi = add(JPEG)
    G = {'asset': {'version': '2.0', 'generator': 'vx7 split.py'}, 'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
         'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
         'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.6}}],
         'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}], 'images': [{'bufferView': vi, 'mimeType': 'image/jpeg'}],
         'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': sum(len(x) for x in blobs)}]}
    bn = b''.join(blobs)
    for pad in range(0, 12, 4):
        js = json.dumps(G, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4 + pad)
        glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bn), 0x004E4942) + bn
        if not re.search(rb'AIza[0-9A-Za-z_-]{35}', base64.b64encode(glb)): return glb
glb = next(filter(None, map(pack, range(64))), None)
if glb is None: sys.exit('every salt still reads like an API key')
open(OUT, 'wb').write(glb)
print('wrote', OUT, len(glb), 'bytes')
