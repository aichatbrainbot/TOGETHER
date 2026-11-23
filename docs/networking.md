# TOGETHER? — Discord Activity Networking & Session Protocol

## Transport & Routing
- **Inside Discord:**
  - REST API: `POST /.proxy/api/token`, `GET /.proxy/api/health`, `GET /.proxy/api/leaderboard`, `GET /.proxy/api/profile/:userId`
  - WebSocket: `wss://${window.location.host}/.proxy/ws`
- **Local Browser Preview (outside Discord, `ALLOW_DEV_AUTH=true` only):**
  - REST API: `POST /api/dev-token`, `GET /api/leaderboard`, `GET /api/profile/:userId`
  - WebSocket: `ws://${window.location.host}/ws`

## Session Identity & Authority
- Rooms are keyed by Discord's shared `discordSdk.instanceId` (`2–8` players, plus honest **Solo Practice** when 1 player tests alone).
- Server simulates active chambers at a fixed **60 Hz** (`DT = 1/60 s`) using `@together/game-core` and broadcasts authoritative `game_snapshot` frames at **30 Hz** (with immediate flushes for key events like `bridge_lock`, `key_pickup`, `gate_unlock`, `door_unlock`, `respawn`, `level_complete`).
- Clients send **only validated input bitmasks** (`LEFT=1, RIGHT=2, JUMP=4`) tagged with monotonic `seq`—never positions or win claims.

## Wire Messages (`@together/game-core`, Zod-Validated)

### Client → Server (`C2SMessage`)
- `join_instance`: `{ instanceId, channelId?, guildId?, sessionToken }`
- `set_ready`: `{ ready }`
- `select_level`: `{ levelId, proceduralSeed?, modifier? }` (Host only)
- `start_game`: `{ levelId?, proceduralSeed?, modifier? }` (Host only)
- `input`: `{ seq, buttons }` (bitmask `0..7`)
- `swap_solo_puppet`: swaps active character in 1-player Solo Practice mode
- `send_emote`: `{ emote: 'stack' | 'wait' | 'go' | 'nice' }` (rate-limited 500ms/player)
- `restart_level`: resets active chamber for all participants
- `return_lobby`: returns room to main menu (Host only)
- `ping`: `{ clientTime }`

### Server → Client (`S2CMessage`)
- `welcome`: `{ playerId, reconnected, room, world? }`
- `room_state`: `{ reason, room }` (includes `selectedLevelId`, `modifier`, `players`, `sessionClears`)
- `game_snapshot`: `{ serverTime, world, events }`
- `player_emote`: `{ playerId, emote, serverTime }`
- `pong`: `{ clientTime, serverTime }`
- `error`: `{ code, message }`

## Disconnects, Reconnects & Host Migration
- Unexpected disconnects keep the player's slot in a translucent non-blocking ghost state for **30 seconds** (`DISCONNECT_GRACE_MS = 30_000`) and return any carried security key cleanly to its spawn pad so teammates are never soft-locked.
- Host authority automatically migrates to the earliest-joined remaining connected player if the Host drops.
- Reconnecting within 30 seconds restores the exact player slot, color, badge, and active body seamlessly.
