"""Compare the Python encoder/decoder against the JS output in out/."""
import json, os, struct, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
import dba

out = os.path.join(os.path.dirname(__file__), 'out')
raw = open(os.path.join(out, 'frames.raw'), 'rb').read()
delays = json.load(open(os.path.join(out, 'delays.json')))
js = open(os.path.join(out, 'js.dba'), 'rb').read()

n = 240 * 240
frames = [list(struct.unpack_from('<%dH' % n, raw, i * n * 2)) for i in range(len(raw) // (n * 2))]
assert len(frames) == len(delays)

py = dba.encode(frames, delays, loop=True)
assert py == js, 'python encoder output differs from js encoder (%d vs %d bytes)' % (len(py), len(js))

dec = dba.decode(js)
shown = dba.pictures(dec)
assert len(shown) == len(frames) and len(dec['frames']) > len(frames), 'expected split records'
for i, f in enumerate(shown):
    assert f['pixels'] == frames[i], 'python decode mismatch at frame %d' % i
    assert f['delay'] == delays[i]
assert dba.encode(frames, delays, loop=True, split=False) != py, 'split=False should differ'
open(os.path.join(out, 'py.dba'), 'wb').write(py)
print('python: encoder matches js byte-for-byte, decoder round trip OK (%d bytes)' % len(py))

# DBAZ and DBAL: python reads the js containers, and js (and C) must read python's
jsz = open(os.path.join(out, 'js.dbaz'), 'rb').read()
assert dba.decompress(jsz) == js, 'python could not inflate the js DBAZ to the same bytes'
pyz = dba.compress(js, 'zlib')
assert pyz[:4] == b'DBAZ' and dba.decompress(pyz) == js
assert dba.decode(pyz)['frames'][3]['pixels'] == dec['frames'][3]['pixels'], 'decode() should accept DBAZ'
open(os.path.join(out, 'py.dbaz'), 'wb').write(pyz)
jsl = open(os.path.join(out, 'js.dbal'), 'rb').read()
assert dba.decompress(jsl) == js, 'python could not read the js DBAL (LZMA) to the same bytes'
pyl = dba.compress(js)
assert pyl[:4] == b'DBAL' and dba.decompress(pyl) == js
open(os.path.join(out, 'py.dbal'), 'wb').write(pyl)
print('python: reads js DBAZ and DBAL, own DBAZ %d bytes, DBAL %d bytes (js DBAL %d)' % (len(pyz), len(pyl), len(jsl)))
