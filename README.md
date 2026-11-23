# TOGETHER?

An original multiplayer 2D cooperative puzzle-platformer built specifically for **Discord Activities** (`@discord/embedded-app-sdk`).

## Highlights
- **Discord Activity First:** Launches directly from Discord's **App Launcher / Start An Activity** across Desktop, Web, Mobile, and Picture-in-Picture (PIP), syncing players automatically through `discordSdk.instanceId` and Discord's `/.proxy` reverse proxy.
- **Full-Screen Dark Pixel-Art Experience:** Premium dark theme (`#101116` / `#1B1E29` / `#242838` / `#8B72FF` / `#54D6C5`), 60 FPS animated dark citadel Game Menu featuring your live connected squad, and edge-to-edge full-screen gameplay.
- **Original Cooperative Mechanics (2–8 Players + Solo Practice):**
  - **Chamber 01 — Synchrony (Cooperation):** Player head-stacking, energy bridge hold/lock switches, and simultaneous dual vault pressure plates.
  - **Chamber 02 — Cadence (Timing):** Horizontal & vertical moving platforms, 5-second timed bridges, collectible security keys, and locked laser gates.
  - **Chamber 03 — Leverage (Teamwork):** Light (`×1`) & heavy cooperative (`×2` pushers) crates, switch-powered cargo lifts, crate climbing, and key gates.
  - **Procedural Lab (Zero AI):** Deterministic `mulberry32` seeded cooperative chamber generator + challenge modifiers (`Standard`, `Low Gravity`, `Speed Run`).
- **Multiplayer & Polish:**
  - Server-authoritative 60 Hz physics (`@together/game-core`), 30 Hz snapshots, client smoothing, 30s disconnect grace window, automatic host migration.
  - Quick co-op emote pings (`1–4`), procedural Web Audio SFX, Gamepad API + mobile touch controls, Leaderboard & Player Profiles, and Accessibility options (Colorblind Shapes, High-Contrast Outlines, Reduced Motion).
- **Zero Paid AI APIs:** 100% deterministic logic, original procedural artwork/audio, and open-source libraries.

## Workspace Layout
- `packages/game-core` — Shared deterministic 60 Hz physics engine, Chambers 01–03, deterministic procedural generator, and Zod wire protocol.
- `apps/server` — Fastify + `ws` authoritative multiplayer server, Discord OAuth2 `/api/token` verification, HMAC session tokens, and leaderboard/profile persistence (`data/stats.json`).
- `apps/web` — React + TypeScript + Vite + HTML5 Canvas2D Discord Activity client.
- `tests/` — Vitest unit tests, multiplayer WebSocket integration tests, and 8-player concurrent stress test.
- `docs/` — [Plan](./docs/plan.md), [Architecture](./docs/architecture.md), [Networking](./docs/networking.md), [Discord Setup](./docs/discord-setup.md), [Deployment](./docs/deployment.md), and [PostgreSQL Schema](./docs/postgres-schema.sql).

## Quickstart
```bash
pnpm install
cp .env.example .env
# Add VITE_DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET to .env (never commit .env!)
pnpm build
pnpm test
pnpm start:activity
```

Expose locally for free (no account or credit card required):
```bash
pnpm tunnel
```

Then configure Discord Developer Portal following [docs/discord-setup.md](./docs/discord-setup.md).
