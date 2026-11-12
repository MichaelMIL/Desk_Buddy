"""Make .lzma streams with Python's lzma module (xz) in several settings and check that the
C decoder (out/test_lzma, built from player/lzma_dec.c) reproduces the input of each."""
import lzma, os, random, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, 'out', 'lzma')
os.makedirs(out, exist_ok=True)
rng = random.Random(1)
inputs = {
    'frames': open(os.path.join(here, 'out', 'js.dba'), 'rb').read(),       # real DBA1 data
    'random': bytes(rng.getrandbits(8) for _ in range(40000)),               # incompressible
    'zeros': bytes(70000),                                                   # one long run
    'text': open(os.path.join(here, '..', 'ANIMATIONS.md'), 'rb').read(),
    'tiny': b'ab',
}
settings = [dict(lc=0, lp=1, pb=1, preset=9 | lzma.PRESET_EXTREME),          # what dba.py writes
            dict(lc=3, lp=0, pb=2, preset=9 | lzma.PRESET_EXTREME),          # xz's defaults
            dict(lc=1, lp=3, pb=4, preset=1), dict(lc=4, lp=0, pb=0, preset=6)]
fails = 0
for name, data in inputs.items():
    exp = os.path.join(out, name + '.bin')
    open(exp, 'wb').write(data)
    for k, st in enumerate(settings):
        z = os.path.join(out, '%s.%d.lzma' % (name, k))
        open(z, 'wb').write(lzma.compress(data, format=lzma.FORMAT_ALONE, filters=[dict(id=lzma.FILTER_LZMA1, dict_size=1 << 20, **st)]))
        r = subprocess.run([os.path.join(here, 'out', 'test_lzma'), z, exp], capture_output=True, text=True)
        if r.returncode:
            fails += 1
            print(r.stdout.strip() or 'FAIL %s (exit %d)' % (z, r.returncode))
if fails:
    sys.exit('c: LZMA decoder failed %d of %d streams' % (fails, len(inputs) * len(settings)))
print('c: LZMA decoder reproduces %d xz streams (4 settings, corrupt input handled)' % (len(inputs) * len(settings)))
