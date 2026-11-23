import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(rootDir, 'apps', 'server', 'dist', 'index.js');
const webIndex = path.join(rootDir, 'apps', 'web', 'dist', 'index.html');

function resolveCloudflared() {
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'cloudflared';
}

function copyToClipboard(text) {
  if (process.platform !== 'win32') return false;
  try {
    const res = spawnSync('clip', [], { input: text, encoding: 'utf8' });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function waitForHealth(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  const skipBuild = process.argv.includes('--no-build');
  const needsBuild = !skipBuild || !fs.existsSync(serverEntry) || !fs.existsSync(webIndex);

  if (needsBuild) {
    console.log('\n[TOGETHER?] Building all packages...');
    const buildRes = spawnSync('pnpm', ['build'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });
    if (buildRes.status !== 0) {
      console.error('[TOGETHER?] Build failed. Aborting launch.');
      process.exit(buildRes.status ?? 1);
    }
  }

  const port = Number(process.env.PORT ?? 3001);
  console.log(`\n[TOGETHER?] Starting Activity Server on http://127.0.0.1:${port} ...`);

  const serverChild = spawn(process.execPath, [serverEntry], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      SERVE_STATIC: 'true',
    },
  });

  let tunnelChild = null;
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[TOGETHER?] Stopping server and Cloudflare Tunnel...');
    if (tunnelChild && !tunnelChild.killed) tunnelChild.kill();
    if (serverChild && !serverChild.killed) serverChild.kill();
    setTimeout(() => process.exit(0), 300);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  serverChild.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[TOGETHER?] Server exited unexpectedly (code ${code ?? 0}).`);
      shutdown();
    }
  });

  const healthy = await waitForHealth(port);
  if (!healthy) {
    console.error('[TOGETHER?] Server did not become healthy in time.');
    shutdown();
    return;
  }

  const cfBin = resolveCloudflared();
  console.log('[TOGETHER?] Opening free Cloudflare Quick Tunnel...');

  tunnelChild = spawn(cfBin, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: cfBin === 'cloudflared',
  });

  let bannerPrinted = false;
  const onTunnelData = (chunk) => {
    const text = chunk.toString('utf8');
    const match = text.match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/i);
    if (match && !bannerPrinted) {
      bannerPrinted = true;
      const host = match[1];
      const copied = copyToClipboard(host);
      console.log('\n====================================================================');
      console.log('  TOGETHER? IS LIVE! (Server + Cloudflare Tunnel running together)');
      console.log('====================================================================');
      console.log(`  Discord URL Mapping TARGET (PREFIX: /):`);
      console.log(`  -->  ${host}`);
      if (copied) {
        console.log('  [Copied to clipboard automatically! Press Ctrl+V in Discord Portal]');
      }
      console.log('--------------------------------------------------------------------');
      console.log('  Press Ctrl+C in this window to stop EVERYTHING cleanly.');
      console.log('====================================================================\n');
    }
  };

  tunnelChild.stdout.on('data', onTunnelData);
  tunnelChild.stderr.on('data', onTunnelData);

  tunnelChild.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[TOGETHER?] Tunnel exited unexpectedly (code ${code ?? 0}).`);
      shutdown();
    }
  });
}

main().catch((err) => {
  console.error('[TOGETHER?] Launch error:', err);
  process.exit(1);
});
