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
lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2; e = (hi - lo) / 2
q = np.round((P - c) / e * 32767).astype(np.int16)
qp = np.zeros((len(q), 4), np.int16); qp[:, :3] = q                      # 8-byte stride
assert UV.min() >= -1e-4 and UV.max() <= 1 + 1e-4, (UV.min(), UV.max())
qu = np.round(np.clip(UV, 0, 1) * 65535).astype(np.uint16)
idx = None
if 'indices' in prim:
    ia = j['accessors'][prim['indices']]; idx = np.frombuffer(view(ia['bufferView']), dtype=np.uint32 if ia['componentType'] == 5125 else np.uint16, count=ia['count'])
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
js = json.dumps(G, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
bn = b''.join(blobs)
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(bn), 0x004E4942)); f.write(bn)
print('verts', len(q), 'indexed', idx is not None, 'bbox m', lo.round(3).tolist(), hi.round(3).tolist(), 'bytes', 12 + 16 + len(js) + len(bn))
