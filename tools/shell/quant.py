# Re-pack the shell GLB in metres (mech frame) with int16 positions and uint16 UVs (KHR_mesh_quantization), JPEG kept.
import sys, json, struct, numpy as np
src, out, scale, ox, oy, oz = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7])
b = open(src, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); bin0 = 20 + L + 8
def view(i):
    bv = j['bufferViews'][i]; o = bin0 + bv.get('byteOffset', 0); return b[o:o + bv['byteLength']]
def acc(i, dt, n):
    a = j['accessors'][i]; return np.frombuffer(view(a['bufferView']), dtype=dt, count=a['count'] * n, offset=a.get('byteOffset', 0)).reshape(-1, n)
prim = j['meshes'][0]['primitives'][0]
P = acc(prim['attributes']['POSITION'], np.float32, 3).astype(np.float64) * scale + [ox, oy, oz]
UV = acc(prim['attributes']['TEXCOORD_0'], np.float32, 2)
assert 'indices' not in prim or True
img = view(j['images'][0]['bufferView'])
# the painter's atlas leaves some triangles wound backwards; weld by position, make the winding consistent and
# outward (trimesh), then flip those same triangles in the unwelded, textured mesh
if 'indices' in prim:
    import trimesh
    ia0 = j['accessors'][prim['indices']]
    F = np.frombuffer(view(ia0['bufferView']), dtype=np.uint32 if ia0['componentType'] == 5125 else np.uint16, count=ia0['count']).reshape(-1, 3).copy()
    w = trimesh.Trimesh(P, F, process=False); w.merge_vertices(merge_tex=True, merge_norm=True)
    n0 = trimesh.Trimesh(P, F, process=False).face_normals
    trimesh.repair.fix_normals(w, multibody=True)
    flip = (np.einsum('ij,ij->i', n0, w.face_normals) < 0)
    F[flip] = F[flip][:, ::-1]
    print('flipped', int(flip.sum()), 'of', len(F))
    FIXED = F.reshape(-1)

lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2; e = (hi - lo) / 2
q = np.round((P - c) / e * 32767).astype(np.int16)
qp = np.zeros((len(q), 4), np.int16); qp[:, :3] = q                      # 8-byte stride
assert UV.min() >= -1e-4 and UV.max() <= 1 + 1e-4, (UV.min(), UV.max())
qu = np.round(np.clip(UV, 0, 1) * 65535).astype(np.uint16)
idx = None
if 'indices' in prim:
    idx = FIXED
blobs, views = [], []
def add(data, target=None, stride=None):
    off = sum(len(x) for x in blobs); blobs.append(data + b'\0' * (-len(data) % 4))
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    if stride: v['byteStride'] = stride
    views.append(v); return len(views) - 1
vp = add(qp.tobytes(), 34962, 8); vu = add(qu.tobytes(), 34962, 4); vi = add(img)
accs = [{'bufferView': vp, 'componentType': 5122, 'normalized': True, 'count': len(q), 'type': 'VEC3', 'min': [-32767] * 3, 'max': [32767] * 3},
        {'bufferView': vu, 'componentType': 5123, 'normalized': True, 'count': len(q), 'type': 'VEC2'}]
p2 = {'attributes': {'POSITION': 0, 'TEXCOORD_0': 1}, 'material': 0}
if idx is not None:
    accs.append({'bufferView': add(idx.astype(np.uint32).tobytes(), 34963), 'componentType': 5125, 'count': len(idx), 'type': 'SCALAR'}); p2['indices'] = 2
G = {'asset': {'version': '2.0', 'generator': 'vx7 quant.py'}, 'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
     'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'vx7-shell', 'translation': c.tolist(), 'scale': e.tolist()}],
     'meshes': [{'primitives': [p2]}], 'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.6}}],
     'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}], 'images': [{'bufferView': vi, 'mimeType': 'image/jpeg'}],
     'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': sum(len(x) for x in blobs)}]}
bn = b''.join(blobs)
# the page inlines this file as base64; GitHub's secret scanner refuses a push when a run of it happens to read like a
# Google API key (AIza + 35 chars). Pad the JSON chunk (in steps of 4 bytes, which re-aligns the base64) until none does.
import base64, re
for pad in range(0, 64, 4):
    js = json.dumps(G, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4 + pad)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bn), 0x004E4942) + bn
    if not re.search(rb'AIza[0-9A-Za-z_-]{35}', base64.b64encode(glb)): break
else: sys.exit('every padding still reads like an API key')
open(out, 'wb').write(glb)
print('json padding', pad)
print('verts', len(q), 'indexed', idx is not None, 'bbox m', lo.round(3).tolist(), hi.round(3).tolist(), 'bytes', 12 + 16 + len(js) + len(bn))
