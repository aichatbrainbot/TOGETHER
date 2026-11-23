# TOGETHER? — Complete Execution Plan (Phases 1–5)

## Status Overview

| Phase | Milestone | Status |
|---|---|---|
| **Phase 1** | Minimal Discord Activity (`@discord/embedded-app-sdk`, OAuth2 `/.proxy/api/token`, `instanceId` WebSocket sync) verified live inside Discord with 3 real Discord users | Completed & Verified |
| **Phase 2** | Playable dark-theme Pixel-Art Chamber 01, 60 Hz server-authoritative physics, head-stacking, switches, full-screen Canvas2D stage, animated Game Menu, Solo Practice mode | Completed & Verified |
| **Phase 3** | Full 2–8 player real-time sync polish, quick co-op emote pings, pause/settings overlay, per-player stats & session scoreboard, zero-jitter reconciliation | Executing Now |
| **Phase 4** | Expanded cooperative mechanics (Moving Platforms, Pushable ×1/×2 Crates, Keys & Locked Gates, Timed Bridges, Challenge Modifiers), 3 Original Chambers + Deterministic Procedural Chamber Generator (Zero AI), Local Persistent Leaderboard & Player Profiles | Executing Now |
| **Phase 5** | Accessibility (Colorblind Player Shapes, Reduced Motion, High-Contrast Outlines, Gamepad API + Mobile Touch), 8-Player Automated Stress Tests, Live Desktop & Mobile Browser Audit, Docker Compose & Free-Tier Deployment Guide + PostgreSQL Schema | Executing Now |

---

## Technical Architecture Commitments
1. **Discord Activity First:** Runs natively inside Discord Desktop, Web, Mobile, and PIP via `@discord/embedded-app-sdk` and `/.proxy` URL Mapping.
2. **Zero Paid AI APIs:** 100% deterministic TypeScript simulation, rule-based puzzle logic, seeded `mulberry32` procedural chamber generation, original procedural Canvas2D pixel art, and Web Audio API synthesis.
3. **Single Source of Truth:** All physics (`packages/game-core`) run identically at fixed 60 Hz on Node.js (`apps/server`) and are validated server-side; clients send only compact input bitmasks.
4. **Honest Quality Bar:** Zero fake buttons, zero mocked multiplayer claims, full automated unit + 8-player WebSocket stress tests, and verified responsive UI before completion.

---

## Phase 3–5 Feature Breakdown

### 1. Shared Cooperative Engine (`packages/game-core`)
- **Moving Platforms:** Waypoint-based deterministic oscillation/patrol carrying riders (players and crates) cleanly in X and Y.
- **Pushable Crates (`×1` & `×2`):** Gravity, wall/platform collisions, standable tops, switch activation by weight, and multi-player push threshold (`requiredPushers: 2` scales automatically to `1` in Solo Practice so solo players never soft-lock).
- **Keys & Locked Gates:** Collectible floating keys that trail the carrier, reset cleanly on hazard fall, and permanently unlock linked gates.
- **Timed Bridges & Hold/Latch/Vault Switches:** Visual draining timer bar on timed bridges for crisp timing coordination.
- **Deterministic Procedural Mode:** Seeded `mulberry32` generator creating mathematically solvable bonus cooperative chambers (`procedural:<seed>`).
- **Challenge Modifiers:** `standard`, `low_gravity`, `speed_run` (par-time GOLD/SILVER/BRONZE medal thresholds).

### 2. Three Original Hand-Crafted Chambers + Procedural Mode
- **Chamber 01 — Synchrony (Cooperation):** Head-stacking to High Ledge → Energy Bridge Hold + Lock → Simultaneous Dual Vault Plates → All-Players Exit.
- **Chamber 02 — Cadence (Timing):** Twin Moving Platforms over energy chasms → Timed Bridge Relay → Upper Key Alcove → Unlock East Security Gate → All-Players Exit.
- **Chamber 03 — Leverage (Teamwork):** Light Crate (`×1`) holds Elevator Relay → Heavy Co-op Crate (`×2` pushers) onto Weight Plate opens Vault Key → Unlock Final Gate → All-Players Exit.
- **Chamber ∞ — Procedural Lab (Deterministic Seed):** Infinite replayable seeded chambers generated with zero AI.

### 3. Server, Stats & 8-Player Resiliency (`apps/server`)
- Multi-chamber selection, "Next Chamber" progression, challenge modifier selection, and live co-op Emote Pings (`Stack!`, `Wait!`, `Go!`, `Nice!`).
- Persistent local JSON `StatsStore` (`data/stats.json`, gitignored) recording verified chamber clear times, medals, squad rosters, and per-player lifetime stats (`GET /.proxy/api/leaderboard` and `GET /.proxy/api/profile/:userId`), with clean storage interface ready for PostgreSQL (`docs/postgres-schema.sql`).
- Automated 8-player concurrent WebSocket stress test verifying stability, latency, disconnect grace, and host migration.

### 4. Client Polish, Accessibility & Deployment (`apps/web`, `docs/`)
- Full-screen (`100vw × 100dvh`) pixel-art renderer for all new entities, colorblind shape emblems (`P1`–`P8`), high-contrast option, Gamepad API controller support, quick in-game Pause/Settings overlay (`Esc`), and floating emote bubbles.
- Full Game Menu drawers: `Play`, `Squad Lobby`, `Chambers` (all 3 + Procedural Seed + Modifiers), `Leaderboard & Profile`, `Settings`, `How to Play`.
- Production-ready `Dockerfile`, `docker-compose.yml`, `docs/postgres-schema.sql`, and `docs/deployment.md`.
