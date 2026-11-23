# TOGETHER?

An original browser-playable multiplayer 2D cooperative puzzle-platformer built primarily as a **Discord Activity** (`@discord/embedded-app-sdk`).

## Stack (Option A)
- **Shared Core (`packages/game-core`)**: Pure TypeScript protocol, session state, and deterministic simulation engine (Phase 2+).
- **Activity Frontend (`apps/web`)**: React + TypeScript + Vite + HTML5 Canvas2D dark-theme interface (`#101116` / `#1B1E29` / `#242838` / `#8B72FF` / `#54D6C5`).
- **Multiplayer Server (`apps/server`)**: Node.js + Fastify + `ws` authoritative server handling Discord OAuth2 token exchange (`/api/token`), `instanceId`-keyed multiplayer rooms, and proxied WebSockets (`/.proxy/ws`).
- **Zero Paid AI APIs**: 100% deterministic logic and open-source tooling.

## Local Quickstart
```bash
pnpm install
cp .env.example .env
# Fill VITE_DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env (never commit .env!)
pnpm test
pnpm start:activity
```

In a second terminal, expose locally via free Cloudflare Quick Tunnel:
```bash
pnpm tunnel
```

See [docs/discord-setup.md](./docs/discord-setup.md) for step-by-step Discord Developer Portal setup.

## Hosting Note (WebSockets Required)
Because multiplayer synchronization requires persistent WebSockets (`/.proxy/ws`), standard serverless platforms like Vercel cannot host the WebSocket game server. Use [render.yaml](./render.yaml) on **Render Free Web Service** (no credit card required, full WebSocket support) or self-host with Node.js.
