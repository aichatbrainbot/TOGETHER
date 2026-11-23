import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  port: number;
  host: string;
  discordClientId: string;
  discordClientSecret: string;
  sessionSecret: string;
  allowDevAuth: boolean;
  serveStaticDir: string | null;
  disconnectGraceMs: number;
}

function loadEnvFileIfPresent(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, '../../..');
  loadEnvFileIfPresent(path.join(repoRoot, '.env'));

  const port = Number(process.env.PORT ?? 3001);
  const host =
    process.env.HOST ?? (process.env.NODE_ENV === 'production' || process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
  const discordClientId = (process.env.VITE_DISCORD_CLIENT_ID ?? '').trim();
  const discordClientSecret = (process.env.DISCORD_CLIENT_SECRET ?? '').trim();

  const rawSessionSecret = (process.env.SESSION_SECRET ?? '').trim();
  const sessionSecret =
    rawSessionSecret && rawSessionSecret !== 'change_this_to_a_random_secret_in_production'
      ? rawSessionSecret
      : crypto.randomBytes(32).toString('hex');

  const allowDevAuth =
    process.env.ALLOW_DEV_AUTH !== undefined
      ? process.env.ALLOW_DEV_AUTH.toLowerCase() === 'true'
      : process.env.NODE_ENV !== 'production';

  const webDistPath = path.join(repoRoot, 'apps', 'web', 'dist');
  const serveStaticDir =
    process.env.SERVE_STATIC === 'true' && fs.existsSync(webDistPath) ? webDistPath : null;

  return {
    port: Number.isFinite(port) && port >= 0 ? port : 3001,
    host,
    discordClientId,
    discordClientSecret,
    sessionSecret,
    allowDevAuth,
    serveStaticDir,
    disconnectGraceMs: 30_000,
    ...overrides,
  };
}
