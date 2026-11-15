#!/usr/bin/env bash
# Офлайн-превью без Vite (на случай, если нативные биндинги Vite/TS 7 не установлены).
# Нужен любой TypeScript ≤ 6 с JS-API (TS_PATH=/путь/к/typescript.js), Python 3 для сервера:
#   scripts/offline-preview/build.sh && python3 scripts/offline-preview/devserver.py . 8731 → http://localhost:8731/preview.html
# Офлайн dev-сборка без Vite: TS → dist-dev/*.js, preview.html генерируется из index.html.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
rm -rf dist-dev
node "$HERE/compile_dev.mjs" src dist-dev > /tmp/compile.log
python3 - <<'EOF'
import re
html = open('index.html', encoding='utf-8').read()
importmap = '''<script type="importmap">
{ "imports": {
  "three": "/node_modules/three/build/three.module.js",
  "three/examples/jsm/": "/node_modules/three/examples/jsm/",
  "three/addons/": "/node_modules/three/examples/jsm/",
  "astronomy-engine": "/node_modules/astronomy-engine/esm/astronomy.js",
  "satellite.js": "/node_modules/satellite.js/dist/index.js",
  "@tweenjs/tween.js": "/node_modules/@tweenjs/tween.js/dist/tween.esm.js"
} }
</script>
<script>
  window.__errs = [];
  window.addEventListener('error', function (e) { window.__errs.push(String(e.message || (e.target && (e.target.src || e.target.href)))); }, true);
  window.addEventListener('unhandledrejection', function (e) { window.__errs.push('REJ ' + (e.reason && e.reason.stack || e.reason)); });
</script>'''
html = html.replace('</head>', importmap + '\n</head>', 1)
html = re.sub(r'<script type="module" src="/src/main.ts"></script>', '<script type="module" src="/dist-dev/main.js"></script>', html)
open('preview.html', 'w', encoding='utf-8').write(html)
EOF
echo "ok: $(ls dist-dev | wc -l) modules"
