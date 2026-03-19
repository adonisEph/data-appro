-- ============================================================
-- Migration 002 — Super Admin & CRUD complet agents
-- ============================================================

-- Ajouter is_super_admin à responsables
ALTER TABLE responsables ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;

-- Ajouter droits granulaires aux responsables
ALTER TABLE responsables ADD COLUMN can_import_agents INTEGER NOT NULL DEFAULT 1;
ALTER TABLE responsables ADD COLUMN can_launch_campagne INTEGER NOT NULL DEFAULT 1;
ALTER TABLE responsables ADD COLUMN can_view_historique INTEGER NOT NULL DEFAULT 1;
ALTER TABLE responsables ADD COLUMN can_manage_users INTEGER NOT NULL DEFAULT 0;

-- Le premier responsable (id=1) devient super admin
UPDATE responsables SET 
  is_super_admin = 1,
  can_manage_users = 1
WHERE id = 1;
