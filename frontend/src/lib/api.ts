// ============================================================
// Client API — Fetch helpers vers le Cloudflare Worker
// ============================================================

import type { Agent, Campagne, Transaction, DashboardStats } from '../types';

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('appro_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('appro_token');
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

// --- Auth ---
export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { nom: string; prenom: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
};

// --- Agents ---
export const agentsApi = {
  list: () => request<{ agents: Agent[]; total: number }>('/agents'),

  import: (agents: Array<{ nom: string; prenom: string; telephone: string; role: string }>) =>
    request<{ imported: number; skipped: number; errors: string[] }>('/agents/import', {
      method: 'POST',
      body: JSON.stringify({ agents }),
    }),

  update: (id: number, data: Partial<Agent>) =>
    request<{ ok: boolean }>(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// --- Campagnes ---
export const campagnesApi = {
  list: () => request<{ campagnes: Campagne[] }>('/campagnes'),

  get: (id: number) =>
    request<{ campagne: Campagne; transactions: Transaction[] }>(`/campagnes/${id}`),

  create: (data: {
    mois: string;
    budget_fcfa: number;
    compte_source: string;
    option_envoi: string;
  }) =>
    request<{ ok: boolean; campagne_id: number }>('/campagnes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  lancer: (id: number) =>
    request<{ ok: boolean; message: string }>(`/campagnes/${id}/lancer`, {
      method: 'POST',
    }),
};

// --- Historique ---
export const historiqueApi = {
  stats: () => request<DashboardStats>('/historique/stats'),

  transactions: (params: {
    agent_id?: number;
    campagne_id?: number;
    statut?: string;
    telephone?: string;
  }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return request<{ transactions: Transaction[]; total: number }>(
      `/historique/transactions${qs ? '?' + qs : ''}`
    );
  },

  preuve: (txId: number) =>
    request<{ preuve: Transaction & { mois: string; budget_fcfa: number; compte_source: string } }>(
      `/historique/transactions/${txId}/preuve`
    ),
};
