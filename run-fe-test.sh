#!/bin/bash
cd /home/shyam/personal/lifeflow
node --test --test-force-exit tests/focus-edges.test.js > /home/shyam/personal/lifeflow/fe-results.txt 2>&1
python3 -c "
lines = open('/home/shyam/personal/lifeflow/fe-results.txt').readlines()
fails = [l.strip()[:150] for l in lines if l.strip().startswith('not ok') and 'subtestsFailed' not in l.strip()]
out = []
out.append('FAILURES: ' + str(len(fails)))
for f in fails: out.append(f)
for l in lines:
    s = l.strip()
    if s.startswith('# tests') or s.startswith('# pass') or s.startswith('# fail'):
        out.append(s)
open('/home/shyam/personal/lifeflow/fe-summary.txt', 'w').write(chr(10).join(out) + chr(10))
"
echo "SCRIPT_DONE"
