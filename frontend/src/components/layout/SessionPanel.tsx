import { useState, useEffect, useCallback, memo } from 'react';
import { clsx } from 'clsx';
import { sessionsApi } from '../../lib/api';
import { useToast } from '../ui/Toast';
import * as XLSX from 'xlsx';

function toSqliteDateTime(v: string): string | undefined {
  const s = String(v || '').trim();
  if (!s) return undefined;
  return s.replace('T', ' ') + ':00';
}

interface SessionPanelProps {
  open: boolean;
  onClose: () => void;
}

function SessionPanelInner({ open, onClose }: SessionPanelProps) {
  const toast = useToast();
  const [sessions, setSessions] = useState<Array<{ responsable_id: number; email: string; is_super_admin: number; is_viewer: number; path: string | null; page_title: string | null; last_seen_at: string; nom?: string; prenom?: string; telephone?: string }>>([]);
  const [sessionTab, setSessionTab] = useState<'active' | 'history'>('active');
  const [historyFilters, setHistoryFilters] = useState<{ from?: string; to?: string; email?: string; activity?: string; limit?: number }>({ limit: 200 });
  const [historyEvents, setHistoryEvents] = useState<Array<{ id: number; responsable_id: number; agent_id: number | null; email: string; event_type: string; path: string | null; page_title: string | null; ip_address: string | null; created_at: string; nom?: string; prenom?: string; telephone?: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSessionTab('active');
  }, [open]);

  useEffect(() => {
    if (!open || sessionTab !== 'active') return;
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
  }, [open, sessionTab]);

  const runHistorySearch = useCallback(async () => {
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
  }, [historyFilters, toast]);

  const exportHistoryXlsx = useCallback(async () => {
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
  }, [historyFilters, toast]);

  useEffect(() => {
    if (open && sessionTab === 'history' && historyEvents.length === 0) {
      runHistorySearch();
    }
  }, [open, sessionTab, historyEvents.length, runHistorySearch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Fermer" />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header avec gradient */}
        <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 0v2m0-2h2m-2 0H9m7 4h2a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2h2m4-4h.01M9 9h.01" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Connexions Agents</p>
              <p className="text-xs text-white/70">Utilisateurs actifs (2 dernières minutes)</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors" title="Fermer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs modernes */}
        <div className="px-5 pt-4 shrink-0">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setSessionTab('active')}
              className={clsx(
                'px-4 py-2 text-xs font-semibold rounded-lg transition-all',
                sessionTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className={clsx('w-1.5 h-1.5 rounded-full', sessionTab === 'active' ? 'bg-green-500' : 'bg-gray-400')} />
                Actifs
              </span>
            </button>
            <button
              onClick={() => setSessionTab('history')}
              className={clsx(
                'px-4 py-2 text-xs font-semibold rounded-lg transition-all',
                sessionTab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              Historique
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessionTab === 'active' ? (
            sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 8H3m12 0a4 4 0 100 5.292M15 8v8a4 4 0 01-4 4H7a4 4 0 01-4-4V8m12 0V4a4 4 0 00-4-4H7a4 4 0 00-4 4v4" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400">Aucune session active</p>
              </div>
            ) : (
              <div className="px-5 py-3 space-y-2">
                {sessions.map(s => (
                  <div key={s.responsable_id} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 transition-colors">
                    <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0', s.is_super_admin ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700')}>
                      {s.prenom?.[0]?.toUpperCase()}{s.nom?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {(s.prenom || s.nom) ? `${s.prenom ?? ''} ${s.nom ?? ''}`.trim() : s.email}
                        </p>
                        {s.is_super_admin ? <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">★ Admin</span> : null}
                        {s.is_viewer ? <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Viewer</span> : null}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{s.email}{s.telephone ? ` · ${s.telephone}` : ''}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{s.path ?? '-'}{s.page_title ? ` · ${s.page_title}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        En ligne
                      </span>
                      <p className="text-[10px] text-gray-400">{new Date(s.last_seen_at).toLocaleTimeString('fr-FR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="px-5 pb-5">
              {/* Filtres modernes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Du</label>
                  <input
                    type="datetime-local"
                    value={historyFilters.from ?? ''}
                    onChange={e => setHistoryFilters(f => ({ ...f, from: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Au</label>
                  <input
                    type="datetime-local"
                    value={historyFilters.to ?? ''}
                    onChange={e => setHistoryFilters(f => ({ ...f, to: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
                  <input
                    value={historyFilters.email ?? ''}
                    onChange={e => setHistoryFilters(f => ({ ...f, email: e.target.value }))}
                    placeholder="user@domaine.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Activité</label>
                  <input
                    value={historyFilters.activity ?? ''}
                    onChange={e => setHistoryFilters(f => ({ ...f, activity: e.target.value }))}
                    placeholder="login, navigate…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Limite</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={historyFilters.limit ?? 200}
                    onChange={e => setHistoryFilters(f => ({ ...f, limit: Number(e.target.value) || 200 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Actions bar */}
              <div className="flex items-center justify-between gap-2 pt-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={runHistorySearch}
                    disabled={historyLoading}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
                  >
                    {historyLoading ? (
                      <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Chargement…</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Rechercher</>
                    )}
                  </button>
                  <button
                    onClick={exportHistoryXlsx}
                    disabled={historyLoading}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-gray-900 text-white hover:bg-black disabled:opacity-60 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export Excel
                  </button>
                </div>
                <span className="text-xs text-gray-400 font-medium bg-gray-100 px-3 py-1 rounded-full">{historyEvents.length} résultat{historyEvents.length > 1 ? 's' : ''}</span>
              </div>

              {/* Résultats */}
              <div className="mt-4 space-y-2">
                {historyEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <p className="text-sm text-gray-400">Aucun événement</p>
                  </div>
                ) : (
                  historyEvents.map(e => (
                    <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-colors">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 bg-indigo-100 text-indigo-700">
                        {e.prenom?.[0]?.toUpperCase()}{e.nom?.[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-gray-900 truncate">
                            {(e.prenom || e.nom) ? `${e.prenom ?? ''} ${e.nom ?? ''}`.trim() : e.email}
                          </p>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{e.event_type}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{e.email}{e.telephone ? ` · ${e.telephone}` : ''}{e.ip_address ? ` · ${e.ip_address}` : ''}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{e.path ?? '-'}{e.page_title ? ` · ${e.page_title}` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-400 font-mono">{new Date(e.created_at).toLocaleString('fr-FR')}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const SessionPanel = memo(SessionPanelInner);
