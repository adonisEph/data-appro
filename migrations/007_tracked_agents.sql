-- ============================================================
-- Migration 007 — Tracked agents (Super Admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS tracked_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  superadmin_responsable_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(superadmin_responsable_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_tracked_agents_superadmin ON tracked_agents(superadmin_responsable_id);
CREATE INDEX IF NOT EXISTS idx_tracked_agents_agent ON tracked_agents(agent_id);
