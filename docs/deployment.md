# Deployment & Hosting Guide — TOGETHER? (Zero Paid AI & Budget-Transparent)

**TOGETHER?** requires **persistent WebSockets (`/.proxy/ws`)** for real-time 60 Hz authoritative multiplayer synchronization. Standard serverless-only platforms (such as Vercel Serverless Functions) cannot host long-lived WebSocket rooms.

---

## Option 1: Zero-Cost Self-Hosting on Your PC + Cloudflare Tunnel (Recommended — \$0, No Credit Card)

This option requires **no credit card, no subscriptions, and zero cold starts**, and works for friends worldwide inside Discord whenever your machine is on.

### Quick Start (Quick Tunnel — no Cloudflare account needed)
1. Ensure `.env` exists in the repo root (copied from `.env.example`, never committed to Git) with your `VITE_DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `SESSION_SECRET`.
2. Terminal 1 — Build and start the single-origin Activity server:
   ```powershell
   pnpm start:activity
   ```
3. Terminal 2 — Start the free Cloudflare Quick Tunnel:
   ```powershell
   pnpm tunnel
   ```
4. Copy the generated `*.trycloudflare.com` hostname (without `https://`) into **Discord Developer Portal → Activities → URL Mappings** (`PREFIX: /`).

### Upgrade to a Permanent Free Domain (Cloudflare Named Tunnel)
If you own a domain on a free Cloudflare account, a **Named Tunnel** (`cloudflared tunnel create together`) gives you a **permanent hostname** (e.g. `together.yourdomain.com`) that never changes across restarts—still \$0, no credit card needed for Cloudflare Tunnel!

---

## Option 2: Self-Host with Docker Compose (Any Linux/Windows Machine or Free VPS)

Run the full Activity server (and optional PostgreSQL 16) in containers:
```bash
# Activity server + local JSON leaderboard persistence (data/stats.json)
docker compose up -d --build

# Optional: also start PostgreSQL 16 initialized with docs/postgres-schema.sql
docker compose --profile postgres up -d --build
```

Verify health:
```bash
curl http://127.0.0.1:3001/api/health
```

---

## Option 3: Free-Tier Cloud Provider Comparison (Transparent Limits & Card Rules)

| Layer | Provider | Free-Tier Limits | Credit Card Required? | Notes |
|---|---|---|---|---|
| **WebSocket Game Server + Static Frontend** | **Local PC + `cloudflared`** | Unlimited, 0 ms cold start | **No** | Best zero-card option for Discord Activities development & friend groups. |
| **WebSocket Game Server + Static Frontend** | **Render Free Web Service** ([render.yaml](../render.yaml)) | 512 MB RAM, full WebSockets, 5 GB egress/mo, sleeps after 15 min idle (30–50s wake) | **May prompt card verification** on some new accounts/regions | Check before relying on it if you have no card. |
| **24/7 Container VPS** | **Oracle Cloud Always Free** | Up to 4 ARM OCPUs, 24 GB RAM | **Yes** (bank-issued card required; rejects prepaid) | Ideal 24/7 Docker Compose host if you have an eligible card. |
| **PostgreSQL Database** | **Neon Free Tier** | 1 GB storage, 100 CU-hrs/mo, auto-wakes from idle | **No** | Apply [postgres-schema.sql](./postgres-schema.sql) when scaling beyond local `data/stats.json`. |
| **Static Frontend Only** | **Cloudflare Pages** | Unlimited bandwidth, global CDN | **No** | Cannot host the WebSocket game server by itself; pair with a WebSocket backend via Discord URL Mappings. |

---

## Discord Developer Portal Production Checklist

1. **OAuth2 → Redirects:** Keep `https://127.0.0.1` registered.
2. **OAuth2 → Client Secret:** Stored ONLY as a server environment variable (`DISCORD_CLIENT_SECRET`), never prefixed with `VITE_`, never committed to Git.
3. **Activities → URL Mappings:** Map `PREFIX: /` → your active HTTPS hostname (no `https://`, no trailing slash).
4. **Activities → Settings:**
   - **Enable Activities:** ON
   - **Maximum Participants:** `8`
   - **Supported Platforms:** `Web`, `iOS`, `Android`
5. **Security Verification:** Confirm `ALLOW_DEV_AUTH=false` in production and run `pnpm test` before every release (includes an automated secret-leak scan of `apps/web/dist`).
