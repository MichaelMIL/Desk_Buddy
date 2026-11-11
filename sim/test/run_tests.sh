#!/bin/sh
# Cross-checks the JS encoder, Python encoder/decoder and C decoder.
set -e
cd "$(dirname "$0")"
node gen_frames.js
python3 -I check_python.py
node -e "
const DBA=require('../lib/dba.js'),fs=require('fs');
DBA.decompress(fs.readFileSync('out/py.dbaz')).then(r=>{const j=fs.readFileSync('out/js.dba');if(Buffer.compare(Buffer.from(r),j))throw new Error('js could not inflate python DBAZ');console.log('js: inflate of python DBAZ OK')}).catch(e=>{console.error(e);process.exit(1)})"
cc -O2 -Wall -Wextra -I../player test_player_wrap.c ../player/dba_player.c -o out/test_player
./out/test_player out/js.dba > out/c_frames.raw 2> out/c_log.txt
cmp out/c_frames.raw out/frames.raw && echo "c: decoder output matches source frames"
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
