import { Outlet, useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { usePWA } from '../../hooks/usePWA';
import { agentsApi } from '../../lib/api';
import { useToast } from '../ui/Toast';

export function LayoutViewer() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { canInstall, install } = usePWA();
  const qc = useQueryClient();
  const toast = useToast();
  const lastAgentsSnapshotRef = useRef<Map<number, { quota_gb: number; telephone: string }>>(new Map());
  const snapshotReadyRef = useRef(false);

  useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    onSuccess: (res) => {
      const agents = res.agents ?? [];

      if (!snapshotReadyRef.current) {
        const next = new Map<number, { quota_gb: number; telephone: string }>();
        agents.forEach(a => next.set(a.id, { quota_gb: a.quota_gb, telephone: a.telephone }));
        lastAgentsSnapshotRef.current = next;
        snapshotReadyRef.current = true;
        return;
      }

      const prev = lastAgentsSnapshotRef.current;
      const next = new Map<number, { quota_gb: number; telephone: string }>();

      let addedCount = 0;
      let quotaChangedCount = 0;

      agents.forEach(a => {
        next.set(a.id, { quota_gb: a.quota_gb, telephone: a.telephone });
        const old = prev.get(a.id);
        if (!old) {
          addedCount++;
          return;
        }
        if (old.quota_gb !== a.quota_gb) quotaChangedCount++;
      });

      lastAgentsSnapshotRef.current = next;

      if (addedCount > 0) {
        toast.info('Agents', `${addedCount} agent${addedCount > 1 ? 's' : ''} ajouté${addedCount > 1 ? 's' : ''}`);
        qc.invalidateQueries({ queryKey: ['stats'] });
      }

      if (quotaChangedCount > 0) {
        toast.info('Quota data', `${quotaChangedCount} agent${quotaChangedCount > 1 ? 's' : ''} mis à jour`);
        qc.invalidateQueries({ queryKey: ['stats'] });
      }
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header simple */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
              </svg>
            </div>
            <div>
              <span className="text-sm font-bold text-gray-900">Data Appro</span>
              <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Lecture seule</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canInstall && (
              <button onClick={install}
                className="hidden sm:flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Installer
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                {user?.prenom?.[0]?.toUpperCase()}{user?.nom?.[0]?.toUpperCase()}
              </div>
              <span className="hidden sm:block text-xs text-gray-600">{user?.prenom} {user?.nom}</span>
              <button onClick={() => { logout(); navigate('/login'); }}
                className="text-gray-400 hover:text-red-500 transition-colors p-1" title="Déconnexion">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <main>
        <Outlet/>
      </main>
    </div>
  );
}
