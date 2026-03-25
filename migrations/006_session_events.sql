CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  responsable_id INTEGER,
  agent_id INTEGER,
  email TEXT,
  event_type TEXT NOT NULL,
  path TEXT,
  page_title TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_events_created_at ON session_events(created_at);
CREATE INDEX IF NOT EXISTS idx_session_events_email ON session_events(email);
CREATE INDEX IF NOT EXISTS idx_session_events_responsable ON session_events(responsable_id);
