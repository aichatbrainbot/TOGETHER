# TOGETHER? — Architecture Decisions (Discord Activity First)

## ADR-001: Discord Activity as Primary Platform (Option A Stack)
- **Status:** Approved
- **Context:** TOGETHER? launches directly from Discord's **Start An Activity / App Launcher** and runs inside Discord's embedded iframe across Desktop, Web, and Mobile.
- **Decision:** Keep the Option A stack adapted strictly for Discord Activities:
  - **`packages/game-core`** — Pure zero-DOM TypeScript shared protocol, session models, and (starting in Phase 2) deterministic 60 Hz 2D cooperative platformer physics engine.
  - **`apps/web`** — React + TypeScript + Vite dark-theme Discord Activity frontend integrating `@discord/embedded-app-sdk` and (starting in Phase 2) an HTML5 Canvas2D pixel-art renderer.
  - **`apps/server`** — Node.js + Fastify + `ws` authoritative multiplayer server handling Discord OAuth2 token exchange (`/api/token`), server-side identity verification, `instanceId`-keyed multiplayer rooms, and WebSocket synchronization.
- **Consequences:**
  - Single TypeScript physics & protocol source of truth across server and browser client.
  - Lightweight bundle loads rapidly inside Discord Desktop, Web, and Mobile iframes with no COOP/COEP `SharedArrayBuffer` headaches.
  - No standalone game website or separate Discord bot is required; launching uses Discord's native **Entry Point Command (`PRIMARY_ENTRY_POINT`)**.

## ADR-002: Zero Paid AI APIs & Zero Paid Services
- **Status:** Mandatory
- **Decision:** All game mechanics, puzzle rules, deterministic procedural generation, audio synthesis, and pixel-art assets operate 100% locally/deterministically without OpenAI, Claude, Gemini, or any paid external API. Local HTTPS testing uses free Cloudflare Quick Tunnels (`cloudflared`), and future free-tier deployment targets remain Cloudflare Pages / Render Free / Neon Free (none deployed yet).

## ADR-003: Discord Proxy & Single-Origin URL Mapping (`/.proxy`)
- **Status:** Mandatory for Discord CSP Compliance
- **Decision:** Inside Discord (`https://<CLIENT_ID>.discordsays.com`), all client HTTP calls route to `/.proxy/api/*` and WebSockets route to `wss://<host>/.proxy/ws`.
  - In development, Vite proxies `/api` and `/ws` (`ws: true`) to `apps/server` (`127.0.0.1:3001`), so a **single** Discord URL Mapping (`/` → tunnel domain) serves both the frontend and backend without CSP violations.
  - In production builds, `apps/server` serves the built `apps/web/dist` static bundle, `/api/*`, and `/ws` from the same origin.

## ADR-004: Server-Side Identity Verification & Secret Isolation
- **Status:** Mandatory
- **Decision:** `DISCORD_CLIENT_SECRET` exists strictly on `apps/server` (never prefixed with `VITE_`, never bundled into `apps/web`). On Activity boot, `apps/server` exchanges the OAuth2 `code` at `https://discord.com/api/oauth2/token`, fetches verified user details from `https://discord.com/api/users/@me`, and issues an HMAC-SHA256 signed WebSocket session token bound to the verified Discord user ID.

## Visual Identity Tokens (Dark Theme)
- Background: `#101116`
- Panels: `#1B1E29`
- Secondary Surfaces: `#242838`
- Primary Accent: `#8B72FF`
- Secondary Accent: `#54D6C5`
- Text: `#E6EAF2` (soft off-white, never `#FFFFFF`), secondary `#939BB2`
