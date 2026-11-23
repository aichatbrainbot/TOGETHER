# TOGETHER? — Discord Activity Networking & Session Protocol

## Transport & Routing
- **Inside Discord:**
  - REST API: `POST /.proxy/api/token`, `GET /.proxy/api/health`
  - WebSocket: `wss://${window.location.host}/.proxy/ws`
- **Local Browser Dev Harness (outside Discord):**
  - REST API: `POST /api/dev-token` (only enabled when `ALLOW_DEV_AUTH=true` on server)
  - WebSocket: `ws://${window.location.host}/ws`

## Session Identity (`discordSdk.instanceId`)
- Discord assigns every Activity launch a shared `instanceId`.
- All Discord users who launch or click **Join Activity** in the same Voice Channel, Text Channel, or DM receive the **exact same `instanceId`**.
- `apps/server` maps each `instanceId` to a single authoritative `ActivityRoom` (2–8 players).
- First verified user connecting to an `instanceId` becomes the room **Host**. If the Host disconnects or leaves, host authority automatically migrates to the next connected player.

## Authentication Flow
1. Client initializes `new DiscordSDK(VITE_DISCORD_CLIENT_ID)` and waits for `await discordSdk.ready()`.
2. Client calls `discordSdk.commands.authorize({ client_id, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] })`.
3. Client sends `{ code }` to `POST /.proxy/api/token`.
4. Server exchanges `code` with `https://discord.com/api/oauth2/token` using `DISCORD_CLIENT_SECRET`, queries `https://discord.com/api/users/@me`, and returns:
   - `access_token` (passed to `discordSdk.commands.authenticate({ access_token })`)
   - `user` (`{ id, username, globalName, avatarUrl }`)
   - `sessionToken` (HMAC-SHA256 signed token verified on WebSocket join)
5. Client subscribes to `Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` and `Events.ACTIVITY_LAYOUT_MODE_UPDATE`, then opens the WebSocket and sends `join_instance` with `{ instanceId, channelId, guildId, sessionToken }`.

## Wire Messages (`@together/game-core`, Zod-Validated)

### Client → Server (`C2SMessage`)
- `join_instance`: `{ type, instanceId, channelId, guildId, sessionToken }` — Joins or reconnects to the shared Activity instance room.
- `set_ready`: `{ type, ready }` — Toggles participant ready status in the Phase 1 Activity lobby.
- `ping`: `{ type, clientTime }` — Latency / heartbeat check.

### Server → Client (`S2CMessage`)
- `welcome`: `{ type, playerId, room }` — Confirms verified join/reconnect and delivers current room snapshot.
- `room_state`: `{ type, room }` — Broadcast whenever any participant joins, toggles ready, disconnects, reconnects, leaves, or host migrates.
- `pong`: `{ type, clientTime, serverTime }` — Heartbeat/RTT echo.
- `error`: `{ type, code, message }` — Structured protocol or capacity error (e.g. `ROOM_FULL`, `UNAUTHORIZED`, `INVALID_MESSAGE`).

## Disconnect & Reconnect Handling
- When a player's WebSocket closes unexpectedly, their slot (color, slot index, username, avatar) is retained in a `disconnected` state for a **30-second grace period** (`DISCONNECT_GRACE_MS = 30_000`).
- If the same verified Discord user reconnects to the same `instanceId` within 30 seconds, their exact slot and state restore seamlessly with `reconnected: true`.
- After 30 seconds without reconnect, the slot is cleaned up and remaining participants receive an updated `room_state`. Empty rooms are garbage-collected cleanly.
