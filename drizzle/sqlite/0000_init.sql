CREATE TABLE IF NOT EXISTS frame_documents (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  resolution_width INTEGER NOT NULL DEFAULT 1920,
  resolution_height INTEGER NOT NULL DEFAULT 1080,
  screen_width_mm INTEGER,
  screen_height_mm INTEGER
);
CREATE TABLE IF NOT EXISTS frame_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content_sources (
  id TEXT PRIMARY KEY,
  frame_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS display_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frame_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  rule_id TEXT,
  layout_id TEXT NOT NULL,
  shown_at INTEGER NOT NULL,
  score REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS display_history_unique ON display_history(frame_id, decision_id, shown_at);
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'local'
);
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  cursor TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_revision INTEGER NOT NULL,
  remote_revision INTEGER NOT NULL,
  local_payload TEXT,
  remote_payload TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  device_token_hash TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
