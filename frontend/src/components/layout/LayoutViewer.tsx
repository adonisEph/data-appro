import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { usePWA } from '../../hooks/usePWA';
import { agentsApi, eventsApi } from '../../lib/api';
import { useToast } from '../ui/Toast';

function safeJsonParse<T>(value: unknown): T | null {
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function fmtAgentLabel(d: { nom?: string; prenom?: string; telephone?: string } | null, fallbackAgentId: number | null) {
  const nom = (d?.nom ?? '').trim();
  const prenom = (d?.prenom ?? '').trim();
  const tel = (d?.telephone ?? '').trim();
  const name = `${prenom} ${nom}`.trim();
  if (name && tel) return `${name} · ${tel}`;
  if (name) return name;
  if (tel) return tel;
  return fallbackAgentId ? `Agent #${fallbackAgentId}` : undefined;
}

function fmtCampagneLabel(d: { mois?: string; budget_fcfa?: number; compte_source?: string } | null, fallbackCampagneId: number | null) {
  const mois = (d?.mois ?? '').trim();
  const budget = typeof d?.budget_fcfa === 'number' ? d.budget_fcfa : undefined;
  const compte = (d?.compte_source ?? '').trim();
  const parts: string[] = [];
  if (mois) parts.push(mois);
  if (budget !== undefined) parts.push(`${budget.toLocaleString('fr-FR')} FCFA`);
  if (compte) parts.push(compte);
  if (parts.length > 0) return parts.join(' · ');
  return fallbackCampagneId ? `Campagne #${fallbackCampagneId}` : undefined;
}

function fmtDefaultTitle(action: string) {
  return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

function fmtFallbackMessage(
  action: string,
  details: Record<string, unknown> | null,
  detailsRaw: string | null,
  agentId: number | null,
  campagneId: number | null
) {
  const agent = fmtAgentLabel(details as unknown as { nom?: string; prenom?: string; telephone?: string } | null, agentId);
  const campagne = fmtCampagneLabel(details as unknown as { mois?: string; budget_fcfa?: number; compte_source?: string } | null, campagneId);
  const raw = (typeof detailsRaw === 'string' ? detailsRaw.trim() : '');
  const rawShort = raw && raw.length > 180 ? raw.slice(0, 180) + '…' : raw;

  const parts = [agent, campagne].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  if (rawShort && rawShort !== '{}' && rawShort !== 'null') return rawShort;
  return undefined;
}

export function LayoutViewer() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { canInstall, install } = usePWA();
  const qc = useQueryClient();
  const toast = useToast();
  const lastAgentsSnapshotRef = useRef<Map<number, { quota_gb: number; telephone: string }>>(new Map());
  const snapshotReadyRef = useRef(false);
  const sinceIdRef = useRef(0);
  const notifPanelRef = useRef<HTMLDivElement | null>(null);
  const notifOpenRef = useRef(false);
  const notificationsRef = useRef<Array<{ id: number; title: string; message?: string; created_at: string; action: string }>>([]);
  const unreadIdsRef = useRef<Set<number>>(new Set());
  const [notifVersion, setNotifVersion] = useState(0);

  const { data } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    const agents = data?.agents ?? [];
    if (!data) return;

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
  }, [data, qc, toast]);

  useEffect(() => {
    const uid = user?.email ? String(user.email) : 'anon';
    const kSince = `events_since_id:${uid}`;
    const kUnread = `events_unread_ids:${uid}`;
    try {
      const storedSince = Number(localStorage.getItem(kSince) ?? '0');
      if (Number.isFinite(storedSince)) sinceIdRef.current = storedSince;
      const storedUnread = localStorage.getItem(kUnread);
      if (storedUnread) {
        const ids = JSON.parse(storedUnread) as number[];
        unreadIdsRef.current = new Set(ids);
      }
    } catch {
      /* ignore */
    }
  }, [user?.email]);

  useEffect(() => {
    const uid = user?.email ? String(user.email) : 'anon';
    const kSince = `events_since_id:${uid}`;
    const kUnread = `events_unread_ids:${uid}`;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await eventsApi.list({ since_id: sinceIdRef.current, limit: 50 });
        if (cancelled) return;

        const evts = res.events ?? [];
        if (typeof res.next_since_id === 'number') {
          sinceIdRef.current = res.next_since_id;
          try { localStorage.setItem(kSince, String(res.next_since_id)); } catch { /* ignore */ }
        }
        if (evts.length === 0) return;

        const newNotifs: Array<{ id: number; title: string; message?: string; created_at: string; action: string }> = [];
        const toInvalidate = new Set<string>();
        const toInvalidateCampagne = new Set<number>();

        for (const e of evts) {
          const action = String((e as { action?: string }).action ?? 'EVENT');
          const created_at = String((e as { created_at?: string }).created_at ?? new Date().toISOString());
          const agentId = (e as { agent_id?: number | null }).agent_id ?? null;
          const campagneId = (e as { campagne_id?: number | null }).campagne_id ?? null;
          const detailsRaw = (e as { details?: string | null }).details ?? null;
          const details = safeJsonParse<Record<string, unknown>>(detailsRaw);

          if (action.startsWith('AGENT_') || action === 'IMPORT_AGENTS') {
            toInvalidate.add('agents');
            toInvalidate.add('stats');
          }
          if (action.startsWith('CAMPAGNE_') || action.startsWith('PROVISION_') || action.startsWith('RELANCE_') || action.startsWith('WEBHOOK_')) {
            toInvalidate.add('campagnes');
            toInvalidate.add('stats');
            if (typeof campagneId === 'number') toInvalidateCampagne.add(campagneId);
          }

          let title = 'Notification';
          let message: string | undefined;
          if (action === 'AGENT_CREATED') {
            title = 'Agent ajouté';
            message = fmtAgentLabel(details as unknown as { nom?: string; prenom?: string; telephone?: string } | null, agentId);
          }
          else if (action === 'AGENT_QUOTA_CHANGED') {
            title = 'Quota modifié';
            const d = details as unknown as { before?: { quota_gb?: number }; after?: { quota_gb?: number }; updates?: { nom?: string; prenom?: string; telephone?: string } } | null;
            const who = fmtAgentLabel((d?.updates ?? null) as unknown as { nom?: string; prenom?: string; telephone?: string } | null, agentId);
            const b = d?.before?.quota_gb;
            const a = d?.after?.quota_gb;
            message = [who, (b !== undefined && a !== undefined ? `${b} → ${a} GB` : undefined)].filter(Boolean).join(' · ') || who;
          }
          else if (action === 'AGENT_UPDATED') {
            title = 'Agent modifié';
            const d = details as unknown as { updates?: { nom?: string; prenom?: string; telephone?: string } } | null;
            message = fmtAgentLabel(d?.updates ?? null, agentId);
          }
          else if (action === 'CAMPAGNE_CREATED') {
            title = 'Campagne créée';
            message = fmtCampagneLabel(details as unknown as { mois?: string; budget_fcfa?: number; compte_source?: string } | null, campagneId);
          }
          else if (action === 'CAMPAGNE_DELETED') {
            title = 'Campagne supprimée';
            message = fmtCampagneLabel(details as unknown as { mois?: string; budget_fcfa?: number; compte_source?: string } | null, campagneId);
          }
          else if (action === 'CAMPAGNE_UPDATED') {
            title = 'Campagne modifiée';
            message = fmtCampagneLabel(details as unknown as { mois?: string; budget_fcfa?: number; compte_source?: string } | null, campagneId);
          }
          else if (action === 'IMPORT_AGENTS') { title = 'Import agents'; }
          else if (action.startsWith('PROVISION_')) { title = 'Provisionnement'; message = fmtCampagneLabel(details as unknown as { mois?: string; budget_fcfa?: number; compte_source?: string } | null, campagneId); }
          else if (action.startsWith('RELANCE_')) { title = 'Relance'; message = fmtCampagneLabel(details as unknown as { mois?: string; budget_fcfa?: number; compte_source?: string } | null, campagneId); }
          else if (action.startsWith('WEBHOOK_')) { title = 'Webhook'; }

          if (!message) {
            if (title === 'Notification') title = fmtDefaultTitle(action);
            message = fmtFallbackMessage(action, details, detailsRaw, agentId, campagneId);
          }

          newNotifs.push({ id: (e as { id: number }).id, title, message, created_at, action });
        }

        // merge notifications in refs
        const merged = [...newNotifs, ...notificationsRef.current];
        const seen = new Set<number>();
        const out: typeof merged = [];
        for (const n of merged) {
          if (seen.has(n.id)) continue;
          seen.add(n.id);
          out.push(n);
          if (out.length >= 50) break;
        }
        notificationsRef.current = out;

        for (const n of newNotifs) unreadIdsRef.current.add(n.id);
        try { localStorage.setItem(kUnread, JSON.stringify(Array.from(unreadIdsRef.current))); } catch { /* ignore */ }

        for (const k of toInvalidate) {
          qc.invalidateQueries({ queryKey: [k] });
        }
        for (const id of toInvalidateCampagne) {
          qc.invalidateQueries({ queryKey: ['campagnes'] });
          qc.invalidateQueries({ queryKey: ['campagne', id] });
          qc.invalidateQueries({ queryKey: ['campagne-live', id] });
        }

        // rerender header for badge/panel
        setNotifVersion(v => v + 1);
      } catch {
        /* ignore */
      }
    };

    const interval = window.setInterval(tick, 5000);
    tick();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [qc, user?.email]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!notifOpenRef.current) return;
      const target = e.target as Node;
      if (notifPanelRef.current && !notifPanelRef.current.contains(target)) {
        notifOpenRef.current = false;
        setNotifVersion(v => v + 1);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

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
              <div className="relative" ref={notifPanelRef}>
                <button
                  onClick={() => {
                    notifOpenRef.current = !notifOpenRef.current;
                    if (unreadIdsRef.current.size > 0) {
                      const uid = user?.email ? String(user.email) : 'anon';
                      const kUnread = `events_unread_ids:${uid}`;
                      unreadIdsRef.current = new Set();
                      try { localStorage.setItem(kUnread, JSON.stringify([])); } catch { /* ignore */ }
                    }
                    setNotifVersion(v => v + 1);
                  }}
                  title="Notifications"
                  className="relative text-gray-400 hover:text-gray-700 transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
                  </svg>
                  {unreadIdsRef.current.size > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadIdsRef.current.size > 99 ? '99+' : unreadIdsRef.current.size}
                    </span>
                  )}
                </button>

                {notifOpenRef.current && (
                  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">Notifications</p>
                        <button
                          onClick={() => {
                            notifOpenRef.current = false;
                            setNotifVersion(v => v + 1);
                          }}
                          className="text-gray-400 hover:text-gray-700 p-1" title="Fermer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {notificationsRef.current.length === 0 ? (
                          <p className="text-xs text-gray-400 p-4">Aucune notification</p>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {notificationsRef.current.map(n => (
                              <div key={n.id} className="px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{n.title}</p>
                                    {n.message && <p className="text-xs text-gray-500 truncate">{n.message}</p>}
                                  </div>
                                  <span className="text-[10px] text-gray-400 shrink-0">{new Date(n.created_at).toLocaleTimeString('fr-FR')}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* force rerender */}
              <span className="hidden">{notifVersion}</span>
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
