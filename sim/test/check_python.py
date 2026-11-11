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
assert len(dec['frames']) == len(frames)
for i, f in enumerate(dec['frames']):
    assert f['pixels'] == frames[i], 'python decode mismatch at frame %d' % i
    assert f['delay'] == delays[i]
open(os.path.join(out, 'py.dba'), 'wb').write(py)
print('python: encoder matches js byte-for-byte, decoder round trip OK (%d bytes)' % len(py))

# DBAZ: python inflates the js container, and js must be able to read python's
jsz = open(os.path.join(out, 'js.dbaz'), 'rb').read()
assert dba.decompress(jsz) == js, 'python could not inflate the js DBAZ to the same bytes'
pyz = dba.compress(js)
assert dba.decompress(pyz) == js
assert dba.decode(pyz)['frames'][3]['pixels'] == frames[3], 'decode() should accept DBAZ'
open(os.path.join(out, 'py.dbaz'), 'wb').write(pyz)
print('python: DBAZ inflate of js output OK, own DBAZ %d bytes' % len(pyz))
