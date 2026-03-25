-- Table de présence / sessions actives (heartbeat)
CREATE TABLE IF NOT EXISTS active_sessions (
  responsable_id INTEGER PRIMARY KEY,
  agent_id INTEGER,
  email TEXT,
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  is_viewer INTEGER NOT NULL DEFAULT 0,
  path TEXT,
  page_title TEXT,
  user_agent TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions(last_seen_at);
