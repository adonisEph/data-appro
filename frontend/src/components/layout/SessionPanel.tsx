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
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Fermer" />
      <div className="relative w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Sessions</p>
            <p className="text-xs text-gray-400">Utilisateurs actifs (2 minutes)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1" title="Fermer">
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
              onClick={() => setSessionTab('history')}
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
  );
}

export const SessionPanel = memo(SessionPanelInner);
