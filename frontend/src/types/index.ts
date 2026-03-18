// ============================================================
// Types partagés Frontend
// ============================================================

export type Role = 'technicien' | 'responsable_junior' | 'responsable_senior' | 'manager';
export type StatutCampagne = 'brouillon' | 'en_cours' | 'terminee' | 'partielle' | 'annulee';
export type StatutTransaction = 'en_attente' | 'envoye' | 'confirme' | 'echec' | 'double_detected';
export type OptionEnvoi = 'argent';

export const ROLE_LABELS: Record<Role, string> = {
  technicien: 'Technicien',
  responsable_junior: 'Resp. Junior',
  responsable_senior: 'Resp. Sénior',
  manager: 'Manager',
};

export const ROLE_QUOTAS: Record<Role, number> = {
  technicien: 6.5,
  responsable_junior: 14,
  responsable_senior: 30,
  manager: 45,
};

export const STATUT_LABELS: Record<StatutCampagne, string> = {
  brouillon: 'Brouillon',
  en_cours: 'En cours',
  terminee: 'Terminée',
  partielle: 'Partielle',
  annulee: 'Annulée',
};

export const TX_STATUT_LABELS: Record<StatutTransaction, string> = {
  en_attente: 'En attente',
  envoye: 'Envoyé',
  confirme: 'Confirmé',
  echec: 'Échec',
  double_detected: 'Doublon',
};

export interface Agent {
  id: number;
  nom: string;
  prenom: string;
  telephone: string;
  role: Role;
  quota_gb: number;
  actif: number;
  created_at: string;
}

export interface Campagne {
  id: number;
  mois: string;
  budget_fcfa: number;
  compte_source: string;
  responsable_id: number;
  responsable_email?: string;
  responsable_nom?: string;
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
  nom?: string;
  prenom?: string;
  role?: Role;
  telephone: string;
  montant_fcfa: number | null;
  forfait_code: string | null;
  option_used: 'argent';
  statut: StatutTransaction;
  airtel_transaction_id: string | null;
  airtel_reference: string | null;
  airtel_status: string | null;
  airtel_message: string | null;
  airtel_raw_response: string | null;
  accuse_recu_le: string | null;
  tente_le: string;
  confirme_le: string | null;
  nb_tentatives: number;
}

export interface DashboardStats {
  total_agents: number;
  total_campagnes: number;
  last_campagne: Campagne | null;
  transactions_par_statut: Array<{ statut: string; n: number }>;
}

export interface User {
  nom: string;
  prenom: string;
  email: string;
}
