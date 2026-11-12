import sys, os, numpy as np, torch
from PIL import Image
from transformers import AutoModelForImageSegmentation
from torchvision import transforms
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int)
bg = a[5:40, 5:40].reshape(-1, 3).mean(0)
fg = np.abs(a - bg).sum(2) > 45
cols = fg[: int(a.shape[0] * 0.9)].sum(0) > 2          # ignore floor shading at the bottom
runs, s = [], None
for x, c in enumerate(cols):
    if c and s is None: s = x
    if not c and s is not None:
        runs.append((s, x)); s = None
if s is not None: runs.append((s, len(cols)))
# merge runs separated by < 40 px into figures
figs = []
for r in runs:
    if figs and r[0] - figs[-1][1] < 40: figs[-1] = (figs[-1][0], r[1])
    else: figs.append(r)
figs = [f for f in figs if f[1] - f[0] > 150]
print('figures', figs)
dev = 'mps'
model = AutoModelForImageSegmentation.from_pretrained('ZhengPeng7/BiRefNet', trust_remote_code=True).to(dev).float().eval()
tf = transforms.Compose([transforms.Resize((1024, 1024)), transforms.ToTensor(), transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
names = ['front', 'right', 'back']
try:
    for name, (x0, x1) in zip(names, figs):
        x0, x1 = max(0, x0 - 30), min(a.shape[1], x1 + 30)
        crop = im.crop((x0, 0, x1, im.height))
        with torch.no_grad():
            m = model(tf(crop).unsqueeze(0).to(dev))[-1].sigmoid().cpu()[0, 0]
        m = transforms.ToPILImage()(m).resize(crop.size)
        rgba = crop.copy(); rgba.putalpha(m)
        side = max(rgba.size); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
        sq.save(os.path.join(out, name + '.png'))
        al = np.asarray(m) > 128
        print(name, crop.size, 'opaque %.1f%%' % (100 * al.mean()))
finally:
    del model; torch.mps.empty_cache()
