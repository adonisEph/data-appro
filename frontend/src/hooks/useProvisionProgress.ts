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
  confirmes: number;
  echecs: number;
  enAttente: number;
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

  const confirmes  = transactions.filter(t => t.statut === 'confirme').length;
  const echecs     = transactions.filter(t => t.statut === 'echec').length;
  const enAttente  = transactions.filter(t => t.statut === 'en_attente' || t.statut === 'envoye').length;
  const total      = campagne?.total_agents ?? 0;
  const pct        = total > 0 ? Math.round(((confirmes + echecs) / total) * 100) : 0;

  return {
    campagne,
    transactions,
    isLive,
    pct,
    confirmes,
    echecs,
    enAttente,
    isLoading,
  };
}
