// ============================================================
// Hook — Suivi temps réel d'une campagne en cours
// Poll toutes les 3s tant que statut = 'en_cours'
// ============================================================

import { useQuery } from '@tanstack/react-query';
import { campagnesApi } from '../lib/api';
import type { Campagne, Transaction } from '../types';

interface ProvisionProgress {
  campagne: Campagne | null;
  transactions: Transaction[];
  isLive: boolean;
  pct: number;
  total: number;
  confirmes: number;
  echecs: number;
  enAttente: number;
  deletedDuringCampaign: number;
  deletedBudgetFcfa: number;
  isLoading: boolean;
}

export function useProvisionProgress(campagneId: number): ProvisionProgress {
  const { data, isLoading } = useQuery({
    queryKey: ['campagne-live', campagneId],
    queryFn: () => campagnesApi.get(campagneId),
    // Polling actif uniquement si campagne en cours
    refetchInterval: (query) => {
      const statut = query.state.data?.campagne?.statut;
      return statut === 'en_cours' ? 3000 : false;
    },
    staleTime: 0,
  });

  const campagne = data?.campagne ?? null;
  const transactions = data?.transactions ?? [];
  const isLive = campagne?.statut === 'en_cours';

  const { data: eligibleData } = useQuery({
    queryKey: ['campagne-eligible-agents', campagneId],
    queryFn: () => campagnesApi.eligibleAgents(campagneId),
    enabled: Boolean(campagneId),
    staleTime: 0,
    refetchInterval: isLive ? 5000 : false,
  });

  const confirmesTx  = transactions.filter(t => t.statut === 'confirme').length;
  const echecs     = transactions.filter(t => t.statut === 'echec').length;
  const totalAll   = typeof eligibleData?.total_all === 'number'
    ? eligibleData.total_all
    : (typeof eligibleData?.total === 'number' ? eligibleData.total : (campagne?.total_agents ?? 0));
  const totalActive = typeof eligibleData?.total_active === 'number'
    ? eligibleData.total_active
    : (typeof eligibleData?.total === 'number' ? eligibleData.total : (campagne?.total_agents ?? 0));

  const deletedDuringCampaign = Math.max(0, totalAll - totalActive);
  const confirmes = confirmesTx + deletedDuringCampaign;

  const total      = totalAll;
  const enAttente  = Math.max(0, total - confirmes - echecs);
  const pct        = total > 0 ? Math.round(((confirmes + echecs) / total) * 100) : 0;

  const deletedBudgetFcfa = typeof eligibleData?.deleted_budget_fcfa === 'number' ? eligibleData.deleted_budget_fcfa : 0;

  return {
    campagne,
    transactions,
    isLive,
    pct,
    total,
    confirmes,
    echecs,
    enAttente,
    deletedDuringCampaign,
    deletedBudgetFcfa,
    isLoading,
  };
}
