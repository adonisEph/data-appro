-- ============================================================
-- Migration 011 — Réclamations agents (portail)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_reclamations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  telephone TEXT NOT NULL,
  sujet TEXT NOT NULL,
  message TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'ouvert',
  admin_response TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reclamations_agent ON agent_reclamations(agent_id);
CREATE INDEX IF NOT EXISTS idx_reclamations_statut ON agent_reclamations(statut);
CREATE INDEX IF NOT EXISTS idx_reclamations_created ON agent_reclamations(created_at);
