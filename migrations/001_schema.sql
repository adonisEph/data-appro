-- ============================================================
-- DATA APPROVISIONNEMENT — Schéma D1 (Cloudflare SQLite)
-- Migration 001 — Schéma initial
-- ============================================================

-- Agents (200 employés)
CREATE TABLE IF NOT EXISTS agents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nom             TEXT    NOT NULL,
  prenom          TEXT    NOT NULL,
  telephone       TEXT    NOT NULL UNIQUE,  -- format: 242XXXXXXXXX
  role            TEXT    NOT NULL CHECK (role IN ('technicien', 'responsable_junior', 'responsable_senior', 'manager')),
  quota_gb        REAL    NOT NULL,          -- quota calculé depuis le forfait
  forfait_label   TEXT,                      -- ex: "6.5GB" tel que dans le fichier Excel
  prix_cfa        REAL    NOT NULL DEFAULT 0, -- prix du forfait en FCFA
  airtel_bundle_id TEXT,                     -- code bundle Airtel ex: "DATA_6500MB_30J"
  actif           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Responsables Data Appro (sous-ensemble des agents)
CREATE TABLE IF NOT EXISTS responsables (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    INTEGER NOT NULL REFERENCES agents(id),
  email       TEXT    NOT NULL UNIQUE,
  password_hash TEXT  NOT NULL,
  actif       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Campagnes mensuelles
CREATE TABLE IF NOT EXISTS campagnes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mois            TEXT    NOT NULL,   -- format: YYYY-MM
  budget_fcfa     REAL    NOT NULL,
  compte_source   TEXT    NOT NULL,   -- numéro Airtel Money source
  responsable_id  INTEGER NOT NULL REFERENCES responsables(id),
  statut          TEXT    NOT NULL DEFAULT 'brouillon'
                  CHECK (statut IN ('brouillon', 'en_cours', 'terminee', 'partielle', 'annulee')),
  option_envoi    TEXT    NOT NULL DEFAULT 'forfait'
                  CHECK (option_envoi IN ('argent')),
  total_agents    INTEGER NOT NULL DEFAULT 0,
  agents_ok       INTEGER NOT NULL DEFAULT 0,
  agents_echec    INTEGER NOT NULL DEFAULT 0,
  lance_le        TEXT,
  termine_le      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mois)    -- une seule campagne par mois
);

-- Transactions individuelles (1 ligne = 1 agent approvisionné)
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  campagne_id     INTEGER NOT NULL REFERENCES campagnes(id),
  agent_id        INTEGER NOT NULL REFERENCES agents(id),
  telephone       TEXT    NOT NULL,
  montant_fcfa    REAL,               -- si option "argent"
  -- forfait_code supprimé : Airtel CG n'expose pas d'API bundle
  option_used     TEXT    NOT NULL CHECK (option_used IN ('forfait', 'argent')),
  statut          TEXT    NOT NULL DEFAULT 'en_attente'
                  CHECK (statut IN ('en_attente', 'envoye', 'confirme', 'echec', 'double_detected')),
  -- Airtel API response
  airtel_transaction_id   TEXT,
  airtel_reference        TEXT,
  airtel_status           TEXT,
  airtel_message          TEXT,
  airtel_raw_response     TEXT,       -- JSON brut pour audit complet
  -- Accusé réception
  accuse_recu_le  TEXT,
  accuse_raw      TEXT,               -- JSON brut du callback/webhook
  -- Timestamps
  tente_le        TEXT    NOT NULL DEFAULT (datetime('now')),
  confirme_le     TEXT,
  nb_tentatives   INTEGER NOT NULL DEFAULT 1
);

-- Logs d'audit (toutes les actions système)
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campagne_id   INTEGER REFERENCES campagnes(id),
  agent_id      INTEGER REFERENCES agents(id),
  responsable_id INTEGER REFERENCES responsables(id),
  action        TEXT    NOT NULL,
  details       TEXT,                 -- JSON
  ip_address    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Index de performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_agents_telephone   ON agents(telephone);
CREATE INDEX IF NOT EXISTS idx_agents_role        ON agents(role);
CREATE INDEX IF NOT EXISTS idx_transactions_camp  ON transactions(campagne_id);
CREATE INDEX IF NOT EXISTS idx_transactions_agent ON transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_statut ON transactions(statut);
CREATE INDEX IF NOT EXISTS idx_campagnes_mois     ON campagnes(mois);
CREATE INDEX IF NOT EXISTS idx_audit_campagne     ON audit_logs(campagne_id);

-- ============================================================
-- Données initiales — Quotas par rôle
-- (utilisées côté Worker pour calcul auto)
-- ============================================================
CREATE TABLE IF NOT EXISTS role_quotas (
  role      TEXT PRIMARY KEY,
  quota_gb  REAL NOT NULL,
  label     TEXT NOT NULL
);

INSERT OR REPLACE INTO role_quotas VALUES
  ('technicien',          6.5,  'Technicien'),
  ('responsable_junior',  14.0, 'Responsable Junior'),
  ('responsable_senior',  30.0, 'Responsable Sénior'),
  ('manager',             45.0, 'Manager');
