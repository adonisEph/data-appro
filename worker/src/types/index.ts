// ============================================================
// Types — Bindings Cloudflare & modèles métier
// Airtel CG : envoi d'argent uniquement (pas de bundle API)
// ============================================================

export interface Env {
  DB: D1Database;
  // Auth Airtel
  AIRTEL_CLIENT_ID: string;
  AIRTEL_CLIENT_SECRET: string;
  // Disbursement v3
  // PIN Airtel Money EN CLAIR — chiffré dynamiquement avec la clé RSA publique
  // Le chiffrement RSA+AES est géré automatiquement dans services/airtel.ts
  AIRTEL_PIN: string;
  // Config
  AIRTEL_BASE_URL: string;
  AIRTEL_COUNTRY_CODE: string;
  AIRTEL_CURRENCY: string;
  // JWT
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

// --- Modèles DB ---

export type Role = 'technicien' | 'responsable_junior' | 'responsable_senior' | 'manager';
export type StatutCampagne = 'brouillon' | 'en_cours' | 'terminee' | 'partielle' | 'annulee';
export type StatutTransaction = 'en_attente' | 'envoye' | 'confirme' | 'echec' | 'double_detected';
// Uniquement "argent" désormais — Airtel CG n'expose pas d'API bundle
export type OptionEnvoi = 'argent';

export interface Agent {
  id: number;
  nom: string;
  prenom: string;
  telephone: string;
  role: Role;
  quota_gb: number;
  forfait_label: string | null;
  prix_cfa: number;
  airtel_bundle_id: string | null;
  actif: number;
  created_at: string;
  updated_at: string;
}

export interface Responsable {
  id: number;
  agent_id: number;
  email: string;
  actif: number;
  created_at: string;
}

export interface Campagne {
  id: number;
  mois: string;
  budget_fcfa: number;
  compte_source: string;
  responsable_id: number;
  statut: StatutCampagne;
  option_envoi: OptionEnvoi;
  total_agents: number;
  agents_ok: number;
  agents_echec: number;
  lance_le: string | null;
  termine_le: string | null;
  created_at: string;
}

export interface Transaction {
  id: number;
  campagne_id: number;
  agent_id: number;
  telephone: string;
  montant_fcfa: number | null;
  option_used: 'argent';
  statut: StatutTransaction;
  airtel_transaction_id: string | null;
  airtel_reference: string | null;
  airtel_status: string | null;
  airtel_message: string | null;
  airtel_raw_response: string | null;
  accuse_recu_le: string | null;
  accuse_raw: string | null;
  tente_le: string;
  confirme_le: string | null;
  nb_tentatives: number;
}

// --- Quotas par rôle (GB) ---
export const ROLE_QUOTAS: Record<Role, number> = {
  technicien:          6.5,
  responsable_junior:  14,
  responsable_senior:  30,
  manager:             45,
};

// --- Montants en FCFA par rôle ---
// Source : fichier Excel PRIX CFA (à vérifier avec direction)
// Ces valeurs sont écrasées par le prix_cfa stocké sur chaque agent
export const MONTANTS_FCFA: Record<Role, number> = {
  technicien:          5_500,
  responsable_junior:  9_000,
  responsable_senior:  15_000,
  manager:             22_000,
};

// --- JWT payload ---
export interface JWTPayload {
  sub: string;
  email: string;
  agent_id: number;
  iat: number;
  exp: number;
}
