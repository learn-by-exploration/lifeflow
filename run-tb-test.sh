#!/bin/bash
cd /home/shyam/personal/lifeflow
node --test --test-force-exit tests/task-boundaries.test.js 2>&1 | grep -E "^\s*(ok |not ok |# tests|# pass|# fail)" > /home/shyam/personal/lifeflow/tb-results.txt
echo "DONE_EXIT=$?" >> /home/shyam/personal/lifeflow/tb-results.txt
