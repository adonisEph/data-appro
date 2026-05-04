export interface Env {
  DB: D1Database;
  AIRTEL_CLIENT_ID: string;
  AIRTEL_CLIENT_SECRET: string;
  AIRTEL_PIN: string;
  AIRTEL_BASE_URL: string;
  AIRTEL_COUNTRY_CODE: string;
  AIRTEL_CURRENCY: string;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

export type Role = 'technicien' | 'responsable_junior' | 'responsable_senior' | 'manager';
export type StatutCampagne = 'brouillon' | 'en_cours' | 'terminee' | 'partielle' | 'annulee';
export type StatutTransaction = 'en_attente' | 'envoye' | 'confirme' | 'echec' | 'double_detected';
export type OptionEnvoi = 'argent';
export type ModeCampagne = 'auto' | 'manuel';

export interface Agent {
  id: number;
  nom: string;
  prenom: string;
  telephone: string;
  role: Role;              // champ technique interne (pour les quotas par défaut)
  role_label: string | null; // vrai métier de l'agent, libre et indépendant
  quota_gb: number;        // assigné indépendamment du rôle
  forfait_label: string | null;
  prix_cfa: number;
  airtel_bundle_id: string | null;
  actif: number;
  created_at: string;
  updated_at: string;
}

export interface RoleMetier {
  id: number;
  label: string;
  description: string | null;
  actif: number;
  created_at: string;
}

export interface Responsable {
  id: number;
  agent_id: number;
  email: string;
  is_super_admin: number;
  is_viewer: number;
  can_import_agents: number;
  can_launch_campagne: number;
  can_view_historique: number;
  can_manage_users: number;
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
  mode: ModeCampagne;
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
  option_used: 'argent' | 'forfait';
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

// Quotas par défaut (fallback si quota_gb non défini manuellement)
export const ROLE_QUOTAS: Record<Role, number> = {
  technicien: 6.5,
  responsable_junior: 14,
  responsable_senior: 30,
  manager: 45,
};

export const MONTANTS_FCFA: Record<Role, number> = {
  technicien: 5_500,
  responsable_junior: 9_000,
  responsable_senior: 15_000,
  manager: 22_000,
};

export interface JWTPayload {
  sub: string;
  email: string;
  agent_id: number;
  is_super_admin: boolean;
  is_viewer: boolean;
  can_import_agents: boolean;
  can_launch_campagne: boolean;
  can_view_historique: boolean;
  can_manage_users: boolean;
  iat: number;
  exp: number;
}
