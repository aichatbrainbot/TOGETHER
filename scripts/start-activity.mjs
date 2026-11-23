import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(rootDir, 'apps', 'server', 'dist', 'index.js');

const child = spawn(process.execPath, [serverEntry], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    SERVE_STATIC: 'true',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
