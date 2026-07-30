-- ============================================================
-- Migration 009 — Assistant-Appro (utilisateur d'approvisionnement)
-- ============================================================

-- Ajouter can_provision aux responsables
ALTER TABLE responsables ADD COLUMN can_provision INTEGER NOT NULL DEFAULT 0;

-- Table des assignations d'agents aux assistants
-- Le superadmin sélectionne des agents et les assigne à un assistant-appro
CREATE TABLE IF NOT EXISTS assistant_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assistant_responsable_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  assigned_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assistant_responsable_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_assistant_assignments_assistant ON assistant_assignments(assistant_responsable_id);
CREATE INDEX IF NOT EXISTS idx_assistant_assignments_agent ON assistant_assignments(agent_id);
