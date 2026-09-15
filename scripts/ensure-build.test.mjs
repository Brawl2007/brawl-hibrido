import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('ignora datas futuras, mas detecta conteúdo alterado e assets em falta', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brawl-build-'));
  try {
    for (const dir of ['scripts', 'shared', 'dist/public/assets']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.copyFileSync(new URL('./ensure-build.mjs', import.meta.url), path.join(root, 'scripts/ensure-build.mjs'));
    fs.writeFileSync(path.join(root, 'dist/index.js'), '// bundle');
    fs.writeFileSync(path.join(root, 'dist/public/index.html'), '<script src="/assets/app.js"></script>');
    fs.writeFileSync(path.join(root, 'dist/public/assets/app.js'), '// app');
    const source = path.join(root, 'shared/version.ts');
    fs.writeFileSync(source, 'v54');
    // Um rebuild inesperado deve falhar neste projeto de teste.
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'node -e "process.exit(23)"' } }));
    const run = (...args) => execFileSync(process.execPath, ['scripts/ensure-build.mjs', ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, SKIP_BUILD_CHECK: '0' } });
    run('--stamp');
    const future = new Date(Date.now() + 24 * 3600000);
    fs.utimesSync(source, future, future);
    assert.match(run(), /está atualizado/);
    fs.writeFileSync(source, 'changed');
    assert.throws(() => run(), error => /conteúdo do código difere/.test(error.stdout));
    run('--stamp');
    assert.match(run(), /está atualizado/);
    fs.unlinkSync(path.join(root, 'dist/public/assets/app.js'));
    assert.throws(() => run(), error => /ficheiros que não existem/.test(error.stdout));
    assert.throws(() => run('--stamp'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
