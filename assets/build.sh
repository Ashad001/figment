#!/usr/bin/env bash
# Concatenate src/*.js into the single code.js a Figma plugin loads.
# Order is for humans — function declarations hoist across the whole bundle.
set -euo pipefail
cd "$(dirname "$0")"
cat src/01-foundation.js src/02-assets.js src/03-components.js \
    src/04-screens.js src/05-main.js > code.js
node --check code.js
printf 'built code.js — %s bytes\n' "$(wc -c < code.js | tr -d ' ')"
