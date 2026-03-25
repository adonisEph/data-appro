import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { usePWA } from '../../hooks/usePWA';
import { agentsApi, eventsApi, sessionsApi } from '../../lib/api';
import { useToast } from '../ui/Toast';
import type { Agent } from '../../types';
import * as XLSX from 'xlsx';

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

const NAV = [
  {
    to: '/', label: 'Dashboard', exact: true,
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
  },
  {
    to: '/agents', label: 'Agents', exact: false,
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
  },
  {
    to: '/campagnes', label: 'Campagnes', exact: false,
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
  },
  {
    to: '/historique', label: 'Historique', exact: false,
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
  },
  {
    to: '/compte', label: 'Mon compte', exact: false,
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"/>
  },
];

export function Layout() {
  const { user, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { canInstall, isInstalling, install } = usePWA();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessions, setSessions] = useState<Array<{ responsable_id: number; email: string; is_super_admin: number; is_viewer: number; path: string | null; page_title: string | null; last_seen_at: string; nom?: string; prenom?: string; telephone?: string }>>([]);
  const [sessionTab, setSessionTab] = useState<'active' | 'history'>('active');
  const [historyFilters, setHistoryFilters] = useState<{ from?: string; to?: string; email?: string; activity?: string; limit?: number }>({ limit: 200 });
  const [historyEvents, setHistoryEvents] = useState<Array<{ id: number; responsable_id: number; agent_id: number | null; email: string; event_type: string; path: string | null; page_title: string | null; ip_address: string | null; created_at: string; nom?: string; prenom?: string; telephone?: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; message?: string; created_at: string; action: string }>>([]);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());
  const qc = useQueryClient();
  const toast = useToast();
  const lastAgentsSnapshotRef = useRef<Map<number, { quota_gb: number; telephone: string }>>(new Map());
  const snapshotReadyRef = useRef(false);
  const sinceIdRef = useRef(0);
  const notifPanelRef = useRef<HTMLDivElement | null>(null);
  const sessionPanelRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playNotifSound = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;

      osc.connect(gain);
      gain.connect(ctx.destination);

      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } catch {
      /* ignore */
    }
  };

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    const agents: Agent[] = agentsData?.agents ?? [];
    if (agents.length === 0) return;

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
  }, [agentsData, qc, toast]);

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
        setUnreadIds(new Set(ids));
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

        setNotifications(prev => {
          const merged = [...newNotifs, ...prev];
          const seen = new Set<number>();
          const out: typeof merged = [];
          for (const n of merged) {
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            out.push(n);
            if (out.length >= 50) break;
          }
          return out;
        });

        if (newNotifs.length > 0) playNotifSound();

        setUnreadIds(prev => {
          const next = new Set(prev);
          for (const n of newNotifs) next.add(n.id);
          try { localStorage.setItem(kUnread, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
          return next;
        });

        for (const k of toInvalidate) {
          qc.invalidateQueries({ queryKey: [k] });
        }
        for (const id of toInvalidateCampagne) {
          qc.invalidateQueries({ queryKey: ['campagnes'] });
          qc.invalidateQueries({ queryKey: ['campagne', id] });
          qc.invalidateQueries({ queryKey: ['campagne-live', id] });
        }
      } catch {
        /* ignore */
      }
    };

    const interval = window.setInterval(tick, 5000);
    tick();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [qc, user?.email]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        await sessionsApi.heartbeat({ path: location.pathname, page_title: document.title });
      } catch {
        /* ignore */
      }
    };
    const interval = window.setInterval(() => {
      if (!cancelled) tick();
    }, 10_000);
    tick();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [location.pathname]);

  useEffect(() => {
    if (!sessionOpen) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await sessionsApi.active();
        if (cancelled) return;
        setSessions(res.sessions ?? []);
      } catch {
        /* ignore */
      }
    };
    const interval = window.setInterval(() => {
      if (!cancelled) tick();
    }, 5_000);
    tick();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [sessionOpen]);

  const toSqliteDateTime = (v: string) => {
    const s = String(v || '').trim();
    if (!s) return undefined;
    return s.replace('T', ' ') + ':00';
  };

  const runHistorySearch = async () => {
    setHistoryLoading(true);
    try {
      const res = await sessionsApi.history({
        from: toSqliteDateTime(historyFilters.from ?? ''),
        to: toSqliteDateTime(historyFilters.to ?? ''),
        email: historyFilters.email,
        activity: historyFilters.activity,
        limit: historyFilters.limit,
      });
      setHistoryEvents(res.events ?? []);
    } catch (err) {
      toast.error('Historique sessions', err instanceof Error ? err.message : 'Erreur');
    } finally {
      setHistoryLoading(false);
    }
  };

  const exportHistoryXlsx = async () => {
    setHistoryLoading(true);
    try {
      const res = await sessionsApi.history({
        from: toSqliteDateTime(historyFilters.from ?? ''),
        to: toSqliteDateTime(historyFilters.to ?? ''),
        email: historyFilters.email,
        activity: historyFilters.activity,
        limit: 2000,
      });
      const events = res.events ?? [];

      const rows = events.map(e => ({
        id: e.id,
        email: e.email,
        nom: e.nom ?? '',
        prenom: e.prenom ?? '',
        telephone: e.telephone ?? '',
        type: e.event_type,
        path: e.path ?? '',
        page: e.page_title ?? '',
        ip: e.ip_address ?? '',
        date: e.created_at,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(wb, `sessions-history-${ts}.xlsx`);
    } catch (err) {
      toast.error('Export Excel', err instanceof Error ? err.message : 'Erreur');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fermer sidebar sur changement de route (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Fermer sidebar sur resize vers desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setSidebarOpen(false); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
            </svg>
          </div>

          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Data Appro</p>
            <p className="text-[10px] text-gray-400 leading-tight">Airtel CG · +242</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, icon, exact }) => (
          <NavLink key={to} to={to} end={exact}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
            {label}
          </NavLink>
        ))}

        {isSuperAdmin && (
          <>
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Super Admin</p>
            </div>
            <NavLink to="/utilisateurs"
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-amber-50 hover:text-amber-700'
              )}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
              Utilisateurs
            </NavLink>
            <NavLink to="/roles-metier"
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-amber-50 hover:text-amber-700'
              )}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
              </svg>
              Rôles métier
            </NavLink>
          </>
        )}

        {/* Bouton installer PWA */}
        {canInstall && (
          <button onClick={install} disabled={isInstalling}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-all mt-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {isInstalling ? 'Installation…' : 'Installer l\'app'}
          </button>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
            isSuperAdmin ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
          )}>
            {user?.prenom?.[0]?.toUpperCase()}{user?.nom?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">
              {user?.prenom} {user?.nom}
              {isSuperAdmin && <span className="ml-1 text-amber-500">★</span>}
            </p>
            <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
          </div>
          <div className="relative" ref={notifPanelRef}>
            <button
              onClick={() => {
                setNotifOpen(o => !o);
                if (unreadIds.size > 0) {
                  const uid = user?.email ? String(user.email) : 'anon';
                  const kUnread = `events_unread_ids:${uid}`;
                  const next = new Set<number>();
                  setUnreadIds(next);
                  try { localStorage.setItem(kUnread, JSON.stringify([])); } catch { /* ignore */ }
                }
              }}
              title="Notifications"
              className="relative text-gray-400 hover:text-gray-700 transition-colors shrink-0 p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
              </svg>
              {unreadIds.size > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadIds.size > 99 ? '99+' : unreadIds.size}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                <button className="absolute inset-0 bg-black/40" onClick={() => setNotifOpen(false)} aria-label="Fermer" />
                <div className="relative w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">Notifications</p>
                    <button onClick={() => setNotifOpen(false)} className="text-gray-400 hover:text-gray-700 p-1" title="Fermer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-gray-400 p-4">Aucune notification</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {notifications.map(n => (
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

          {isSuperAdmin && (
            <div className="relative" ref={sessionPanelRef}>
              <button
                onClick={() => setSessionOpen(o => !o)}
                title="Sessions"
                className="text-gray-400 hover:text-gray-700 transition-colors shrink-0 p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {sessionOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                  <button className="absolute inset-0 bg-black/40" onClick={() => setSessionOpen(false)} aria-label="Fermer" />
                  <div className="relative w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Sessions</p>
                        <p className="text-xs text-gray-400">Utilisateurs actifs (2 minutes)</p>
                      </div>
                      <button onClick={() => setSessionOpen(false)} className="text-gray-400 hover:text-gray-700 p-1" title="Fermer">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="px-4 pt-3">
                      <div className="inline-flex rounded-xl bg-gray-100 p-1">
                        <button
                          onClick={() => setSessionTab('active')}
                          className={clsx(
                            'px-3 py-1.5 text-xs font-semibold rounded-lg',
                            sessionTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                          )}
                        >
                          Actifs
                        </button>
                        <button
                          onClick={() => {
                            setSessionTab('history');
                            if (historyEvents.length === 0) runHistorySearch();
                          }}
                          className={clsx(
                            'px-3 py-1.5 text-xs font-semibold rounded-lg',
                            sessionTab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                          )}
                        >
                          Historique
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[75vh] overflow-y-auto">
                      {sessionTab === 'active' ? (
                        sessions.length === 0 ? (
                          <p className="text-sm text-gray-400 p-4">Aucune session active</p>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {sessions.map(s => (
                              <div key={s.responsable_id} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                      {(s.prenom || s.nom) ? `${s.prenom ?? ''} ${s.nom ?? ''}`.trim() : s.email}
                                      {s.is_super_admin ? <span className="ml-1 text-amber-500">★</span> : null}
                                      {s.is_viewer ? <span className="ml-2 text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Viewer</span> : null}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">{s.email}{s.telephone ? ` · ${s.telephone}` : ''}</p>
                                    <p className="text-xs text-gray-400 truncate">{s.path ?? '-'}{s.page_title ? ` · ${s.page_title}` : ''}</p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-[10px] text-gray-400">{new Date(s.last_seen_at).toLocaleTimeString('fr-FR')}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        <div className="px-4 pb-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Du</label>
                              <input
                                type="datetime-local"
                                value={historyFilters.from ?? ''}
                                onChange={e => setHistoryFilters(f => ({ ...f, from: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Au</label>
                              <input
                                type="datetime-local"
                                value={historyFilters.to ?? ''}
                                onChange={e => setHistoryFilters(f => ({ ...f, to: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Email</label>
                              <input
                                value={historyFilters.email ?? ''}
                                onChange={e => setHistoryFilters(f => ({ ...f, email: e.target.value }))}
                                placeholder="ex: user@domaine.com"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Activité</label>
                              <input
                                value={historyFilters.activity ?? ''}
                                onChange={e => setHistoryFilters(f => ({ ...f, activity: e.target.value }))}
                                placeholder="path, page, login, navigate…"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Limite</label>
                              <input
                                type="number"
                                min={1}
                                max={500}
                                value={historyFilters.limit ?? 200}
                                onChange={e => setHistoryFilters(f => ({ ...f, limit: Number(e.target.value) || 200 }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={runHistorySearch}
                                disabled={historyLoading}
                                className="px-3 py-2 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                              >
                                {historyLoading ? 'Chargement…' : 'Rechercher'}
                              </button>
                              <button
                                onClick={exportHistoryXlsx}
                                disabled={historyLoading}
                                className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-60"
                              >
                                Export Excel
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-400">{historyEvents.length} résultat(s)</p>
                          </div>

                          <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
                            {historyEvents.length === 0 ? (
                              <p className="text-sm text-gray-400 p-4">Aucun événement</p>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {historyEvents.map(e => (
                                  <div key={e.id} className="px-4 py-3">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-900 truncate">
                                          {(e.prenom || e.nom) ? `${e.prenom ?? ''} ${e.nom ?? ''}`.trim() : e.email}
                                          <span className="ml-2 text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{e.event_type}</span>
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{e.email}{e.telephone ? ` · ${e.telephone}` : ''}{e.ip_address ? ` · ${e.ip_address}` : ''}</p>
                                        <p className="text-xs text-gray-400 truncate">{e.path ?? '-'}{e.page_title ? ` · ${e.page_title}` : ''}</p>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-[10px] text-gray-400">{new Date(e.created_at).toLocaleString('fr-FR')}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={handleLogout} title="Déconnexion"
            className="text-gray-400 hover:text-red-500 transition-colors shrink-0 p-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Overlay mobile ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar desktop (toujours visible) ── */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-gray-200 shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Sidebar mobile (drawer) ── */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col',
        'transition-transform duration-300 ease-in-out lg:hidden',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Topbar mobile ── */}
        <header className="lg:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900">Data Appro</span>
          </div>
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
            isSuperAdmin ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
          )}>
            {user?.prenom?.[0]?.toUpperCase()}{user?.nom?.[0]?.toUpperCase()}
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
