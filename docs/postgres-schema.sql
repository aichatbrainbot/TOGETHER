-- TOGETHER? — PostgreSQL Schema (Ready for Neon Free or Docker PostgreSQL 16)
-- Zero external AI services required.

CREATE TABLE IF NOT EXISTS players (
  discord_user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  chambers_cleared INTEGER NOT NULL DEFAULT 0,
  medals_gold INTEGER NOT NULL DEFAULT 0,
  medals_silver INTEGER NOT NULL DEFAULT 0,
  medals_bronze INTEGER NOT NULL DEFAULT 0,
  switches_triggered INTEGER NOT NULL DEFAULT 0,
  keys_collected INTEGER NOT NULL DEFAULT 0,
  total_respawns INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chamber_clears (
  id UUID PRIMARY KEY,
  instance_id TEXT NOT NULL,
  level_id TEXT NOT NULL,
  level_name TEXT NOT NULL,
  modifier TEXT NOT NULL DEFAULT 'standard',
  completion_time_ms INTEGER NOT NULL CHECK (completion_time_ms >= 0),
  respawn_count INTEGER NOT NULL DEFAULT 0 CHECK (respawn_count >= 0),
  medal TEXT NOT NULL CHECK (medal IN ('gold', 'silver', 'bronze')),
  player_count INTEGER NOT NULL CHECK (player_count BETWEEN 1 AND 8),
  player_names TEXT[] NOT NULL,
  solo_practice BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chamber_clears_level_time
  ON chamber_clears (level_id, completion_time_ms ASC, respawn_count ASC);

CREATE TABLE IF NOT EXISTS player_best_times (
  discord_user_id TEXT NOT NULL REFERENCES players(discord_user_id) ON DELETE CASCADE,
  level_id TEXT NOT NULL,
  best_time_ms INTEGER NOT NULL CHECK (best_time_ms >= 0),
  best_medal TEXT NOT NULL CHECK (best_medal IN ('gold', 'silver', 'bronze')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_user_id, level_id)
);
