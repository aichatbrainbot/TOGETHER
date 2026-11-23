import { spawn } from 'node:child_process';
import fs from 'node:fs';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:3001';

const candidates = [
  'cloudflared',
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
];

function resolveCloudflared() {
  for (const candidate of candidates) {
    if (candidate === 'cloudflared') continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'cloudflared';
}

const bin = resolveCloudflared();
console.log(`[TOGETHER? Tunnel] Starting free Cloudflare Quick Tunnel -> ${targetUrl}`);
console.log(`[TOGETHER? Tunnel] Copy the *.trycloudflare.com hostname into Discord Developer Portal -> Activities -> URL Mappings (PREFIX: /)`);

const child = spawn(bin, ['tunnel', '--url', targetUrl], {
  stdio: 'inherit',
  shell: bin === 'cloudflared',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
