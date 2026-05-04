import type { Agent, Campagne, Transaction, DashboardStats, Responsable, User, RoleMetier } from '../types';

const BASE = 'https://data-appro-worker.jamesdjimby.workers.dev/api';

function getToken() { return localStorage.getItem('appro_token'); }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> ?? {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) { localStorage.removeItem('appro_token'); localStorage.removeItem('appro_user'); window.location.href = '/login'; throw new Error('Session expirée'); }
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  changePassword: (old_password: string, new_password: string) =>
    request<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ old_password, new_password }) }),
};

// Rôles métier
export const rolesMetierApi = {
  list:   () => request<{ roles: RoleMetier[] }>('/roles-metier'),
  create: (label: string, description?: string) =>
    request<{ ok: boolean; id: number }>('/roles-metier', { method: 'POST', body: JSON.stringify({ label, description }) }),
  update: (id: number, data: Partial<RoleMetier>) =>
    request<{ ok: boolean }>(`/roles-metier/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/roles-metier/${id}`, { method: 'DELETE' }),
};

// Agents
export const agentsApi = {
  list:   () => request<{ agents: Agent[]; total: number }>('/agents'),
  get:    (id: number) => request<{ agent: Agent }>(`/agents/${id}`),
  qualityCheck: () => request<{ phone_duplicates: Array<{ telephone: string; agents: Array<{ id: number; nom: string; prenom: string; actif: number }> }>; name_duplicates: Array<{ nom: string; prenom: string; agents: Array<{ id: number; telephone: string; actif: number }> }>; invalid_phones: Array<{ id: number; nom: string; prenom: string; telephone: string; actif: number }>; summary: { phone_duplicates: number; name_duplicates: number; invalid_phones: number; total_agents: number } }>(`/agents/quality-check`),
  create: (data: Partial<Agent>) =>
    request<{ ok: boolean; agent: Agent }>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  import: (agents: Array<Partial<Agent>>) =>
    request<{ imported: number; skipped: number; errors: string[] }>('/agents/import', { method: 'POST', body: JSON.stringify({ agents }) }),
  update: (id: number, data: Partial<Agent>) =>
    request<{ ok: boolean; agent: Agent }>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),
};

// Utilisateurs
type UpdateUserPayload = {
  email?: string;
  is_viewer?: boolean;
  actif?: boolean;
  can_import_agents?: boolean;
  can_launch_campagne?: boolean;
  can_view_historique?: boolean;
  can_manage_users?: boolean;
};

export const usersApi = {
  list:   () => request<{ users: Responsable[] }>('/users'),
  create: (data: {
    agent_id: number; email: string; password: string;
    is_viewer?: boolean;
    can_import_agents?: boolean; can_launch_campagne?: boolean;
    can_view_historique?: boolean; can_manage_users?: boolean;
  }) => request<{ ok: boolean; user_id: number }>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateDroits: (id: number, data: UpdateUserPayload) =>
    request<{ ok: boolean }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id: number, new_password: string) =>
    request<{ ok: boolean }>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password }) }),
  forceLogout: (id: number) =>
    request<{ ok: boolean; had_active_session: boolean }>(`/users/${id}/force-logout`, { method: 'POST' }),
};

// Campagnes
export const campagnesApi = {
  list:   () => request<{ campagnes: Campagne[] }>('/campagnes'),
  get:    (id: number) => request<{ campagne: Campagne; transactions: Transaction[]; metrics?: { confirmes: number; echecs: number; budget_confirme_fcfa: number } }>(`/campagnes/${id}`),
  eligibleAgents: (id: number) => request<{ agents: Agent[]; total: number; total_all?: number; total_active?: number; deleted_budget_fcfa?: number; cutoff: string }>(`/campagnes/${id}/eligible-agents`),
  create: (data: { mois: string; budget_fcfa: number; compte_source: string; option_envoi: string; mode?: 'auto' | 'manuel' }) =>
    request<{ ok: boolean; campagne_id: number }>('/campagnes', { method: 'POST', body: JSON.stringify(data) }),
  lancer: (id: number, agent_ids?: number[]) => {
    const token = getToken();
    return fetch(`${BASE}/campagnes/${id}/lancer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(agent_ids ? { agent_ids } : {}),
    }).then(r => r.json()) as Promise<{ ok: boolean; message: string; agents_count?: number }>;
  },
  manualValidate: (id: number, data: {
    agent_id: number;
    action: 'argent' | 'forfait';
    statut: 'confirme' | 'echec';
    sms: string;
    montant_fcfa?: number;
  }) => request<{ ok: boolean }>(`/campagnes/${id}/manual/validate`, { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean; message: string }>(`/campagnes/${id}`, { method: 'DELETE' }),
};

// Historique
export const historiqueApi = {
  stats: () => request<DashboardStats>('/historique/stats'),
  transactions: (params: { agent_id?: number; campagne_id?: number; statut?: string; telephone?: string }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => [k, String(v)]))).toString();
    return request<{ transactions: Transaction[]; total: number }>(`/historique/transactions${qs ? '?' + qs : ''}`);
  },
  preuve: (txId: number) =>
    request<{ preuve: Transaction & { mois: string; budget_fcfa: number } }>(`/historique/transactions/${txId}/preuve`),
};

// Events (audit logs)
export const eventsApi = {
  list: (params: { since_id?: number; limit?: number }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return request<{ events: Array<{ id: number; campagne_id?: number | null; agent_id?: number | null; responsable_id?: number | null; action: string; details?: string | null; created_at: string }>; next_since_id: number }>(
      `/events${qs ? '?' + qs : ''}`
    );
  },
};

// Sessions (présence)
export const sessionsApi = {
  heartbeat: (data: { path?: string; page_title?: string }) =>
    request<{ ok: boolean }>('/sessions/heartbeat', { method: 'POST', body: JSON.stringify(data) }),
  active: () =>
    request<{ sessions: Array<{ responsable_id: number; agent_id: number | null; email: string; is_super_admin: number; is_viewer: number; path: string | null; page_title: string | null; last_seen_at: string; nom?: string; prenom?: string; telephone?: string }> }>('/sessions/active'),
  history: (params: { from?: string; to?: string; email?: string; activity?: string; limit?: number }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return request<{ events: Array<{ id: number; responsable_id: number; agent_id: number | null; email: string; event_type: string; path: string | null; page_title: string | null; ip_address: string | null; created_at: string; nom?: string; prenom?: string; telephone?: string }> }>(
      `/sessions/history${qs ? '?' + qs : ''}`
    );
  },
};

export const auditLogsApi = {
  list: (params: { from?: string; to?: string; email?: string; action?: string; q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return request<{ logs: Array<{ id: number; campagne_id: number | null; agent_id: number | null; responsable_id: number | null; action: string; details: string | null; ip_address: string | null; created_at: string; responsable_email?: string | null; agent_nom?: string | null; agent_prenom?: string | null; agent_telephone?: string | null }>; limit: number; offset: number }>(
      `/audit-logs${qs ? '?' + qs : ''}`
    );
  },
};

// Tracked agents (Super Admin)
export const trackedAgentsApi = {
  list: () =>
    request<{ tracked_agents: Array<{ agent_id: number; nom: string; prenom: string; telephone: string; role: string; quota_gb: number; prix_cfa: number; actif: number; created_at: string; updated_at: string }> }>(
      '/tracked-agents'
    ),
  set: (agent_ids: number[]) =>
    request<{ ok: true; agent_ids: number[] }>(
      '/tracked-agents',
      { method: 'PUT', body: JSON.stringify({ agent_ids }) }
    ),
};
