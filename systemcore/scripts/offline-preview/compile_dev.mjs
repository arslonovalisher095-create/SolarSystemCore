// Пакетная транспиляция src/*.ts -> dist-dev/*.js для офлайн dev-превью (TS7 в node_modules
// проекта — только нативный Go-компилятор без win-биндинга под linux; глобальный TS 6.0.2
// ещё содержит чистый JS transpileModule — используем его только для эрайзинга типов,
// финальная сборка всё равно должна идти через `npm run build` (Vite/Rolldown) на обычной машине).
const ts = (await import(process.env.TS_PATH || '/opt/node22/lib/node_modules/typescript/lib/typescript.js')).default;
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'src';
const OUT = process.argv[3] || 'dist-dev';

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const files = walk(SRC);
fs.mkdirSync(OUT, { recursive: true });
for (const file of files) {
  const rel = path.relative(SRC, file);
  const outFile = path.join(OUT, rel.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const src = fs.readFileSync(file, 'utf8');
  const res = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.None,
    },
    fileName: file,
  });
  // Браузер не умеет `import './x.css'` как ES-модуль (это работает только через сборщик,
  // Vite/Rolldown превращает его в side-effect на build time) — вырезаем такие импорты только
  // в dev-превью; исходники не трогаем, настоящая сборка (`npm run build`) обработает их как обычно.
  // CSS-импорт → вставка <link> (в dev-превью нет сборщика)
  // Порядок важен: импорт заменяется импортом крошечного модуля, который вставляет <link> — как в Vite, по порядку импортов
  let patched = res.outputText.replace(/^\s*import\s+["']([^"']+\.css)["'];?\s*$/gm, (_m, p) => {
    const href = '/' + path.posix.join(path.relative('.', path.dirname(file)).split(path.sep).join('/'), p);
    const modName = href.replace(/[^a-z0-9]+/gi, '_') + '.js';
    fs.mkdirSync(path.join(OUT, '__css'), { recursive: true });
    fs.writeFileSync(path.join(OUT, '__css', modName), `const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ${JSON.stringify(href)}; document.head.appendChild(l);\n`);
    return `import '/dist-dev/__css/${modName}';`;
  });
  // Нативные ES-модули в браузере требуют явного расширения у относительных путей —
  // бандлер (Vite) разрешает './bodies' сам, голый <script type=module> — нет.
  patched = patched.replace(/from\s+(['"])(\.\.?\/[^'"]+?)\1/g, (m, q, p) => (/\.(js|mjs|json|css)$/.test(p) ? m : `from ${q}${p}.js${q}`));
  fs.writeFileSync(outFile, patched);
  console.log('ok', rel);
}
console.log(`Compiled ${files.length} files -> ${OUT}`);
