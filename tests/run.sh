#!/bin/sh
# Serve the built artifact and run the smoke suites.
# Requires: node + a Chromium binary (path via PLAYWRIGHT_BROWSERS_PATH
# or the executablePath in the suites). playwright-core is fetched on
# first run. Suites print JSON result objects; inspect for regressions.
cd "$(dirname "$0")/.." || exit 1
[ -d node_modules/playwright-core ] || npm install --no-save --no-package-lock playwright-core || exit 1
node build-engine.mjs || exit 1
cd dist || exit 1
python3 -m http.server 8482 >/dev/null 2>&1 &
SRV=$!
sleep 1
cd ../tests
for t in smoke-*.mjs; do
  echo "== $t"
  node "$t"
done
kill $SRV 2>/dev/null
