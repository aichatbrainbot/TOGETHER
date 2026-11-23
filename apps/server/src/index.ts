import { createActivityServer } from './server.js';

async function main() {
  const server = await createActivityServer({ logger: false });
  const { port } = await server.start();

  const discordStatus =
    server.config.discordClientId && server.config.discordClientSecret
      ? 'CONFIGURED'
      : 'MISSING CREDENTIALS (set VITE_DISCORD_CLIENT_ID & DISCORD_CLIENT_SECRET in .env)';

  console.log(`[TOGETHER? Server] Listening on http://${server.config.host}:${port}`);
  console.log(`[TOGETHER? Server] WebSocket endpoints: /ws and /.proxy/ws`);
  console.log(`[TOGETHER? Server] Discord OAuth2: ${discordStatus}`);
  console.log(`[TOGETHER? Server] Local Dev Auth: ${server.config.allowDevAuth ? 'ENABLED' : 'DISABLED'}`);
  if (server.config.serveStaticDir) {
    console.log(`[TOGETHER? Server] Serving built Activity bundle from: ${server.config.serveStaticDir}`);
  }

  const shutdown = async () => {
    console.log('\n[TOGETHER? Server] Shutting down cleanly...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[TOGETHER? Server] Fatal startup error:', err);
  process.exit(1);
});
