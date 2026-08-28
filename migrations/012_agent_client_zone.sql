-- ============================================================
-- Migration 012 — Colonnes Client et Zone sur les agents
-- ============================================================

-- Client pour lequel l'agent travaille (ex: "Divers client STHIC", "Projet HTC")
ALTER TABLE agents ADD COLUMN client TEXT;

-- Zone de compétence de l'agent
ALTER TABLE agents ADD COLUMN zone TEXT;
