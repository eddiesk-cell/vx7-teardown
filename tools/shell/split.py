# Measures the painted shell into a mould for the code-built armor: per body segment, its radius and paint round the bone.
#   python3 tools/shell/split.py vx7-shared/assets/vx7-shell.glb vx7-shared/assets/vx7-mold.json
# 1. Each segment scores every vertex by its distance to the bone (in units of its radius). A segment cannot reach
#    behind the joint it hangs from and its parent cannot reach past it, so neighbours meet on a plane at the joint.
# 2. Each joint plane slides along its normal to the place where the cut crosses the least white armor: the dark
#    mechanical gap between two plates, as in the reference. A plate is never cut in half if a gap is near.
# 3. Every segment keeps only its largest connected patch of surface; stray bits (a claw tip that scored closer to the
#    thigh) go to the segment around them, so nothing of one part rides on another.
# 4. Triangles on a boundary are clipped exactly on it, and normals are smoothed over the whole shell first, so the
#    assembled shell shows no seam.
# 5. Each of the 17 pieces is measured round its bone (radius and paint colour on a 1 cm x 2.5 degree grid); the page
#    builds the armor plates in code from that mould.
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

# ---- 5. a mould for the code-built armor. The page builds every plate in code (vx7-shared/shell.js); this measures
# the painted shell for it. Round each segment's bone, rays go out from the axis every DT along it and every DTH round
# it, and the outermost hit on that segment's surface gives the radius r(t, theta) and the paint colour there.
DT, NTH = 0.01, 144            # 1 cm along the bone, 2.5 degrees round it
RGB = np.asarray(Image.open(io.BytesIO(JPEG)).convert('RGB'))
def frame_of(g):
    u = g['u']; ref = np.array([0, 1.0, 0]) if abs(u[2]) > 0.6 else np.array([0, 0, 1.0])
    f = ref - (ref @ u) * u; f /= np.linalg.norm(f)
    return u, f, np.cross(u, f)
def cast(O, D, T3, U3):
    """outermost hit of each ray (origin O, direction D) on triangles T3: distance (0 = none) and the uv there"""
    e1, e2 = T3[:, 1] - T3[:, 0], T3[:, 2] - T3[:, 0]
    best = np.zeros(len(O)); buv = np.zeros((len(O), 2))
    for i in range(0, len(O), 128):
        o, d = O[i:i + 128, None], D[i:i + 128, None]
        pv = np.cross(d, e2); det = np.einsum('rtk,tk->rt', pv, e1)
        ok = np.abs(det) > 1e-12; inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
        tv = o - T3[:, 0]; uu = np.einsum('rtk,rtk->rt', tv, pv) * inv
        qv = np.cross(tv, e1); vv = np.einsum('rtk,rtk->rt', np.broadcast_to(d, qv.shape), qv) * inv
        tt = np.einsum('tk,rtk->rt', e2, qv) * inv
        hit = ok & (uu >= 0) & (vv >= 0) & (uu + vv <= 1) & (tt > 0)
        tt = np.where(hit, tt, -1); k = tt.argmax(1); r = np.arange(len(k))
        best[i:i + 128] = np.maximum(tt[r, k], 0)
        w0 = 1 - uu[r, k] - vv[r, k]
        buv[i:i + 128] = w0[:, None] * U3[k, 0] + uu[r, k][:, None] * U3[k, 1] + vv[r, k][:, None] * U3[k, 2]
    return best, buv
mold = []
for g, pc in zip(S, pieces):
    u, f, l = frame_of(g)
    T3 = pc[:, :3].reshape(-1, 3, 3); U3 = pc[:, 3:5].reshape(-1, 3, 2)
    tp = (pc[:, :3] - g['a']) @ u
    t0 = np.floor(tp.min() / DT) * DT; nt = int(np.ceil((tp.max() - t0) / DT)) + 1
    th = np.arange(NTH) * 2 * np.pi / NTH
    D = np.cos(th)[None, :, None] * f + np.sin(th)[None, :, None] * l
    O = g['a'] + (t0 + np.arange(nt) * DT)[:, None, None] * u + 0 * D
    r, uv = cast(O.reshape(-1, 3), np.broadcast_to(D, O.shape).reshape(-1, 3), T3, U3)
    px = RGB[np.clip((uv[:, 1] * RGB.shape[0]).astype(int), 0, RGB.shape[0] - 1), np.clip((uv[:, 0] * RGB.shape[1]).astype(int), 0, RGB.shape[1] - 1)]
    px[r == 0] = 0
    mold.append({'id': g['id'], 'a': g['a'].round(4).tolist(), 'u': u.round(5).tolist(), 'f': f.round(5).tolist(), 'l': l.round(5).tolist(),
                 't0': round(float(t0), 4), 'dt': DT, 'nt': nt, 'nth': NTH,
                 'r': base64.b64encode(np.round(r * 1000).astype(np.uint16).tobytes()).decode(),
                 'c': base64.b64encode(px.astype(np.uint8).tobytes()).decode()})
    print(f"{g['id']:8s} {nt:3d} x {NTH} samples, {int((r > 0).mean() * 100)}% hit, r {r[r > 0].min():.2f}-{r.max():.2f} m")
# ---- 6. the paint, unrolled: for each segment the painted shell is rendered round its bone into a flat image (angle
# across, height down; 0.625 degrees and 2.5 mm a pixel), keeping the outermost surface, so the code plates can wear the
# design's paint with no atlas seams. The angle runs from -90 to 450 degrees, so a plate across the front never wraps.
TH0, TH1, PXA, PXT = -np.pi / 2, 2.5 * np.pi, np.radians(0.625), 0.0025
def unroll(g, pc, m):
    u, f, l = frame_of(g)
    H = (m['nt'] - 1) * DT
    W_, H_ = int(round((TH1 - TH0) / PXA)), int(round(H / PXT)) + 1
    depth = np.full((H_, W_), -1.0); UVI = np.zeros((H_, W_, 2))
    X = pc[:, :3].reshape(-1, 3, 3); UVt = pc[:, 3:5].reshape(-1, 3, 2)
    d = X - g['a']; tt = d @ u; rv = d - tt[..., None] * u
    th = np.arctan2(rv @ l, rv @ f); rad = np.linalg.norm(rv, axis=2)
    wrap = th.max(1) - th.min(1) > np.pi
    th = np.where(wrap[:, None] & (th < 0), th + 2 * np.pi, th)
    py_all = (tt - m['t0']) / PXT
    yy, xx = np.mgrid[0:H_, 0:W_]
    for k in range(len(X)):
        for off in (-2 * np.pi, 0, 2 * np.pi):
            px = (th[k] + off - TH0) / PXA; py = py_all[k]
            x0, x1 = int(np.floor(px.min())), int(np.ceil(px.max())); y0, y1 = int(np.floor(py.min())), int(np.ceil(py.max()))
            if x1 < 0 or x0 >= W_ or y1 < 0 or y0 >= H_: continue
            x0, x1, y0, y1 = max(x0, 0), min(x1, W_ - 1), max(y0, 0), min(y1, H_ - 1)
            gx = xx[y0:y1 + 1, x0:x1 + 1] + 0.5; gy = yy[y0:y1 + 1, x0:x1 + 1] + 0.5
            (ax_, ay_), (bx_, by_), (cx_, cy_) = zip(px, py)
            den = (by_ - cy_) * (ax_ - cx_) + (cx_ - bx_) * (ay_ - cy_)
            if abs(den) < 1e-12: continue
            w0 = ((by_ - cy_) * (gx - cx_) + (cx_ - bx_) * (gy - cy_)) / den
            w1 = ((cy_ - ay_) * (gx - cx_) + (ax_ - cx_) * (gy - cy_)) / den
            w2 = 1 - w0 - w1
            ins = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not ins.any(): continue
            z = w0 * rad[k, 0] + w1 * rad[k, 1] + w2 * rad[k, 2]
            sub = depth[y0:y1 + 1, x0:x1 + 1]
            win = ins & (z > sub)
            sub[win] = z[win]
            uvs = UVI[y0:y1 + 1, x0:x1 + 1]
            for q in range(2): uvs[..., q][win] = (w0 * UVt[k, 0, q] + w1 * UVt[k, 1, q] + w2 * UVt[k, 2, q])[win]
    have = depth > 0
    img = RGB[np.clip((UVI[..., 1] * RGB.shape[0]).astype(int), 0, RGB.shape[0] - 1), np.clip((UVI[..., 0] * RGB.shape[1]).astype(int), 0, RGB.shape[1] - 1)].copy()
    img[~have] = 0
    # what the shell does not cover (past a joint cut, an arm opening) takes the paint round it
    img = cv2.inpaint(np.ascontiguousarray(img[..., ::-1]), (~have).astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA)[..., ::-1]
    return img
import cv2
tiles = [unroll(g, pc, m) for g, pc, m in zip(S, pieces, mold)]
# pack the tiles into columns of one atlas, shortest column first
NCOL = 3
colh = [0] * NCOL; place = []
for k in sorted(range(len(tiles)), key=lambda k: -tiles[k].shape[0]):
    c_ = int(np.argmin(colh)); place.append((k, c_ * tiles[k].shape[1], colh[c_])); colh[c_] += tiles[k].shape[0]
AW, AH = NCOL * tiles[0].shape[1], max(colh)
atlas = np.zeros((AH, AW, 3), np.uint8)
for k, x, y in place:
    h_, w_ = tiles[k].shape[:2]; atlas[y:y + h_, x:x + w_] = tiles[k]
    mold[k]['tex'] = {'x': x, 'y': y, 'w': w_, 'h': h_, 'th0': TH0, 'th1': TH1, 'pxt': PXT}
for q in (88, 87, 86, 85, 84):
    ok_, jpg = cv2.imencode('.jpg', np.ascontiguousarray(atlas[..., ::-1]), [cv2.IMWRITE_JPEG_QUALITY, q])
    txt = json.dumps({'atlas': {'w': AW, 'h': AH, 'jpg': base64.b64encode(jpg.tobytes()).decode()}, 'segments': mold}, separators=(',', ':'))
    if not re.search(r'AIza[0-9A-Za-z_-]{35}', txt): break
else: sys.exit('every JPEG quality still reads like an API key')
cv2.imwrite(OUT.replace('.json', '-paint.jpg'), np.ascontiguousarray(atlas[..., ::-1]))
print(f'paint atlas {AW} x {AH}, jpeg {len(jpg)} bytes (quality {q})')
open(OUT, 'w').write(txt)
print('wrote', OUT, len(txt), 'bytes')
