import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,                // toujours re-fetcher si les données sont "stale"
      refetchOnWindowFocus: true,  // refetch quand on revient sur l'onglet
      refetchOnReconnect: true,    // refetch après reconnexion réseau
      refetchInterval: false,      // pas d'intervalle par défaut (sauf pages spécifiques)
      retry: 1,
    },
  },
});
