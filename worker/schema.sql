-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Ledger + holds
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user_time ON credit_ledger(user_id, created_at);

CREATE TABLE IF NOT EXISTS credit_holds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,          -- HELD|CAPTURED|RELEASED|EXPIRED
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Payments (stub – redo för CCBill/Epoch webhook)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  credits_granted INTEGER NOT NULL,
  status TEXT NOT NULL,          -- PENDING|SETTLED|FAILED
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider, provider_ref);

-- Characters & episodes
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  archetype_key TEXT,
  traits_json TEXT,
  voice_preset TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_char_user ON characters(user_id);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT,
  episode_no INTEGER NOT NULL,
  level INTEGER NOT NULL,
  lang TEXT NOT NULL,
  tldr TEXT NOT NULL,
  text_r2_url TEXT NOT NULL,
  tts_r2_url TEXT,
  words INTEGER NOT NULL,
  tts_seconds INTEGER,
  cost_credits INTEGER NOT NULL,
  model_provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ep_user_char ON episodes(user_id, character_id, episode_no);

-- Archetypes & cache
CREATE TABLE IF NOT EXISTS archetypes (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tags TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cache_entries (
  key TEXT PRIMARY KEY,
  level INTEGER NOT NULL,
  lang TEXT NOT NULL,
  voice_preset TEXT,
  text_r2_key TEXT NOT NULL,
  tts_r2_key TEXT,
  words INTEGER NOT NULL,
  tts_seconds INTEGER,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Jobs
CREATE TABLE IF NOT EXISTS gen_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  prompt_raw TEXT NOT NULL,
  prompt_norm TEXT NOT NULL,
  archetype_key TEXT,
  character_id TEXT,
  continue_episode INTEGER,
  level INTEGER NOT NULL,
  quote_id TEXT NOT NULL,
  hold_id TEXT,
  status TEXT NOT NULL,     -- QUEUED|RUNNING|DONE|FAILED
  error TEXT,
  cost_credits INTEGER,
  cache_key TEXT,
  model_provider TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idem ON gen_jobs(user_id, idempotency_key);
