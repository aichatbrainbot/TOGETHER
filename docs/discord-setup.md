# Discord Developer Portal & Test Server Launch Guide — TOGETHER? (Phase 1)

This step-by-step guide takes you from zero to launching **TOGETHER?** inside your own Discord test server using a 100% free local HTTPS tunnel (`cloudflared`), with zero paid services.

---

## Step 1: Create Your Discord Application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and sign in with your Discord account.
2. Click **New Application** (top right).
3. Enter the name **`TOGETHER?`**, accept the Terms, and click **Create**.

---

## Step 2: Copy Your OAuth2 Credentials into Local `.env`

1. In the left sidebar, open **OAuth2**.
2. Copy your **Client ID**.
3. Under **Client Secret**, click **Reset Secret** (or **Copy** if visible) and copy the secret.
   - **SECURITY:** Never share this secret, never prefix it with `VITE_`, and never commit `.env` to Git (`.env` is already listed in `.gitignore`).
4. Under **Redirects**, click **Add Redirect** and enter:
   ```text
   https://127.0.0.1
   ```
   Click **Save Changes**. *(Discord requires at least one valid redirect URI registered for Embedded App OAuth2 `authorize()` calls.)*
5. Copy `.env.example` to `.env` in `d:\darkcoin\.env` and paste your values:
   ```env
   VITE_DISCORD_CLIENT_ID=<YOUR_CLIENT_ID>
   DISCORD_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
   PORT=3001
   HOST=127.0.0.1
   SESSION_SECRET=<ANY_RANDOM_32_CHAR_STRING>
   ALLOW_DEV_AUTH=false
   ```

---

## Step 3: Enable Activities & Verify Entry Point Command

1. In the left sidebar, open **Activities** → **Settings**.
2. Toggle **Enable Activities** to **ON** and click **Save Changes**.
3. Open **Installation** (left sidebar):
   - Make sure **Guild Install** and/or **User Install** is enabled so you can install the Activity onto your private test server.
   - Copy the **Install Link** (choose *Discord Provided Link*), open it in your browser, and install **`TOGETHER?`** into your private Discord test server.
4. *(Automatic verification)* When Activities is enabled, Discord automatically provisions the default **`PRIMARY_ENTRY_POINT`** ("Launch") command so your app appears in Discord's **App Launcher** (**Start An Activity** button) inside your test server!

---

## Step 4: Start the Local Activity Server & Free HTTPS Tunnel

Using the built single-port mode keeps both frontend assets, `/api/token`, and `/ws` under **one** URL Mapping with zero Vite HMR WebSocket noise inside Discord:

1. **Terminal 1** — Build and start the Activity server (`http://127.0.0.1:3001`):
   ```powershell
   pnpm start:activity
   ```
2. **Terminal 2** — Start a free Cloudflare Quick Tunnel (no account or credit card required):
   ```powershell
   pnpm tunnel
   ```
3. Look in Terminal 2 for the generated HTTPS URL, e.g.:
   ```text
   https://random-words-example.trycloudflare.com
   ```
   Copy ONLY the hostname (without `https://`), e.g. `random-words-example.trycloudflare.com`.

---

## Step 5: Configure Discord URL Mapping

1. In the Discord Developer Portal, open **Activities** → **URL Mappings**.
2. Set the root mapping:
   - **PREFIX:** `/`
   - **TARGET:** `random-words-example.trycloudflare.com` *(your current `trycloudflare.com` hostname, with no `https://` prefix and no trailing slash)*
3. Click **Save Changes**.
   *(Note: Cloudflare Quick Tunnels generate a new hostname each time you restart `pnpm tunnel`, so update this single TARGET field whenever you start a fresh tunnel.)*

---

## Step 6: Launch & Verify Inside Your Discord Test Server (2 Discord Users)

1. In your Discord desktop/web client, make sure **Developer Mode** is enabled:
   - Discord Settings → **Advanced** → toggle **Developer Mode** ON.
   - *(If your app is unverified/in development, Developer Mode is required on any test account launching it in a server under 25 members.)*
2. Join a **Voice Channel** (or Text Channel) in your private test server.
3. Click the **App Launcher** icon (rocket / shapes icon) → select **`TOGETHER?`** → click **Launch**.
4. Verify on **User 1**:
   - The Activity iframe loads cleanly in dark theme (`#101116`).
   - Top badge reads **`DISCORD ACTIVITY`** (NOT `LOCAL PREVIEW`).
   - User 1's Discord display name, `@username`, avatar, `P1` badge, and `HOST` tag appear with green `Synced · XX ms` status.
5. On a **second Discord account** (another device, Discord Web in an incognito window, or a friend in your test server):
   - Click **Join Activity** on the active **`TOGETHER?`** session in that same channel.
6. Verify **Phase 1 Acceptance Criteria**:
   - Both users display the **exact same `Instance` ID**.
   - Both users see each other's Discord username, avatar, and `P1` / `P2` badges in real time.
   - Clicking **Mark Ready** on User 1 updates live on User 2 immediately.
   - Closing User 2's Activity shows `Reconnecting (30s grace)` on User 1; rejoining restores User 2's slot seamlessly.
