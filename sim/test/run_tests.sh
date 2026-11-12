#!/bin/sh
# Cross-checks the JS encoder, Python encoder/decoder and C decoder.
set -e
cd "$(dirname "$0")"
node gen_frames.js
python3 -I check_python.py
node -e "
const DBA=require('../lib/dba.js'),fs=require('fs');
(async()=>{const j=fs.readFileSync('out/js.dba');for(const f of ['py.dbaz','py.dbal']){const r=await DBA.decompress(fs.readFileSync('out/'+f));if(Buffer.compare(Buffer.from(r),j))throw new Error('js could not read python '+f)}console.log('js: reads python DBAZ and DBAL')})().catch(e=>{console.error(e);process.exit(1)})"
cc -O2 -Wall -Wextra -I../player test_player_wrap.c ../player/dba_player.c ../player/lzma_dec.c -o out/test_player
./out/test_player out/js.dba > out/c_frames.raw 2> out/c_log.txt
cmp out/c_frames.raw out/frames.raw && echo "c: decoder output matches source frames"
for f in js.dbal py.dbal; do
  ./out/test_player out/$f > out/c_frames.raw 2>> out/c_log.txt
  cmp out/c_frames.raw out/frames.raw && echo "c: $f (LZMA) unpacks to the source frames"
done
cc -O2 -Wall -Wextra -I../player ../player/test/test_lzma.c ../player/lzma_dec.c -o out/test_lzma
python3 -I check_lzma.py
# Pillow path: PNG round trip through the CLI
python3 -I ../tools/dba.py decode out/js.dba -o out/png >/dev/null
python3 -I ../tools/dba.py encode out/png -o out/from_png.dba --fps 25 >/dev/null
python3 -I - <<'PY'
import os, struct, sys
sys.path.insert(0, '../tools'); import dba
a = dba.decode(open('out/js.dba','rb').read()); b = dba.decode(open('out/from_png.dba','rb').read())
assert [f['pixels'] for f in a['frames']] == [f['pixels'] for f in b['frames']], 'PNG round trip changed pixels'
print('python: PNG export/import round trip OK')
PY
echo "all tests passed"
