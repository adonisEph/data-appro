-- ============================================================
-- Migration 003 — Dissociation rôle métier / quota data
--                + Utilisateur lecteur
-- ============================================================

-- Table des rôles métier (indépendants du quota data)
CREATE TABLE IF NOT EXISTS roles_metier (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT    NOT NULL UNIQUE,   -- ex: "Ingénieur Réseau", "Comptable"
  description TEXT,
  actif       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Insérer les rôles métier de base (à adapter)
INSERT OR IGNORE INTO roles_metier (label, description) VALUES
  ('Technicien',          'Agent technique terrain'),
  ('Responsable Junior',  'Responsable junior de secteur'),
  ('Responsable Sénior',  'Responsable sénior de secteur'),
  ('Manager',             'Manager / Directeur');

-- Ajouter role_label sur les agents (vrai métier, libre)
ALTER TABLE agents ADD COLUMN role_label TEXT;

-- Initialiser role_label depuis l'ancien champ role
UPDATE agents SET role_label = CASE
  WHEN role = 'technicien'         THEN 'Technicien'
  WHEN role = 'responsable_junior' THEN 'Responsable Junior'
  WHEN role = 'responsable_senior' THEN 'Responsable Sénior'
  WHEN role = 'manager'            THEN 'Manager'
  ELSE role
END;

-- Ajouter is_viewer aux responsables
ALTER TABLE responsables ADD COLUMN is_viewer INTEGER NOT NULL DEFAULT 0;
