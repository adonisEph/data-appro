-- ============================================================
-- Migration 013 — Index de performance (réduction du quota D1
-- "rows read" : les endpoints listes/stats scannaient les tables
-- entières à chaque appel)
-- ============================================================

-- /api/agents : filtres actif + tris nom/prenom
CREATE INDEX IF NOT EXISTS idx_agents_actif_nom       ON agents(actif, nom, prenom);
CREATE INDEX IF NOT EXISTS idx_agents_actif_created   ON agents(actif, created_at);
-- Backfill "agents supprimés" de GET /campagnes/:id (actif=0 + updated_at > cutoff)
CREATE INDEX IF NOT EXISTS idx_agents_actif_updated   ON agents(actif, updated_at);

-- /api/campagnes/:id : NOT EXISTS / DISTINCT agent_id / lookups manuels
CREATE INDEX IF NOT EXISTS idx_transactions_camp_agent_statut ON transactions(campagne_id, agent_id, statut);
-- eligible-agents : MAX(confirme_le) pré-agrégé par agent
CREATE INDEX IF NOT EXISTS idx_transactions_statut_agent      ON transactions(statut, agent_id);
