-- ============================================================
-- Migration 010 — Portail Agent (consultation par numéro)
-- ============================================================

-- Table des connexions agents au portail
CREATE TABLE IF NOT EXISTS agent_portal_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  telephone TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_portal_logins_agent ON agent_portal_logins(agent_id);
CREATE INDEX IF NOT EXISTS idx_portal_logins_created ON agent_portal_logins(created_at);
