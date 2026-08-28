import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '../lib/api';
import { Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

const STATUT_LABELS: Record<string, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  clôturé: 'Clôturé',
};

export default function ReclamationsPage() {
  const { isSuperAdmin, isViewer } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('ouvert');
  const [selected, setSelected] = useState<number | null>(null);
  const [response, setResponse] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reclamations', filter],
    queryFn: () => portalApi.listReclamations(filter === 'all' ? undefined : filter),
    enabled: isSuperAdmin || isViewer,
  });

  const respondMut = useMutation({
    mutationFn: ({ id, admin_response, statut }: { id: number; admin_response: string; statut: string }) =>
      portalApi.respondReclamation(id, admin_response, statut),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reclamations'] });
      setSelected(null);
      setResponse('');
    },
  });

  if (!isSuperAdmin && !isViewer) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 text-center text-sm text-gray-500">Accès réservé au SuperAdmin et viewers.</div>
      </div>
    );
  }

  const reclamations = data?.reclamations ?? [];
  const selectedRec = reclamations.find(r => r.id === selected);

  const STATUT_STYLES: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    ouvert: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-l-red-500' },
    en_cours: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-l-amber-500' },
    clôturé: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500', border: 'border-l-green-500' },
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header avec gradient */}
      <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 rounded-2xl px-6 py-5 text-white shadow-lg shadow-indigo-200/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Réclamations Agents</h1>
            <p className="text-sm text-white/70 mt-0.5">Signalements remontés par les agents via le portail</p>
          </div>
        </div>
      </div>

      {/* Filtres modernes */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: 'ouvert', label: 'Ouverts' },
          { value: 'en_cours', label: 'En cours' },
          { value: 'clôturé', label: 'Clôturés' },
          { value: 'all', label: 'Tous' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
              filter === opt.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : reclamations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">Aucune réclamation</p>
          <p className="text-xs text-gray-400 mt-0.5">Aucun signalement pour ce filtre.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reclamations.map(r => {
            const st = STATUT_STYLES[r.statut] ?? STATUT_STYLES.ouvert;
            return (
              <div key={r.id} className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${st.border} p-4 shadow-sm hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-brand-100 text-brand-700">
                        {r.prenom?.[0]?.toUpperCase()}{r.nom?.[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{r.prenom} {r.nom}</p>
                        <p className="text-xs text-gray-500">{r.telephone} · {fmtDateTime(r.created_at)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {STATUT_LABELS[r.statut] ?? r.statut}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 mb-2">
                      <p className="text-sm font-bold text-gray-800">{r.sujet}</p>
                      <p className="text-sm text-gray-600 mt-1">{r.message}</p>
                    </div>
                    {r.admin_response && (
                      <div className="mt-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                          <p className="text-[10px] font-bold text-green-700 uppercase">Réponse admin</p>
                        </div>
                        <p className="text-xs text-gray-700">{r.admin_response}</p>
                        {r.responded_at && <p className="text-[10px] text-gray-400 mt-1.5">{fmtDateTime(r.responded_at)}</p>}
                      </div>
                    )}
                  </div>
                  {r.statut !== 'clôturé' && isSuperAdmin && (
                    <button
                      onClick={() => { setSelected(r.id); setResponse(r.admin_response ?? ''); }}
                      className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-2 rounded-xl transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                      Répondre
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-brand-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                </div>
                <h2 className="text-lg font-bold text-white">Répondre — {selectedRec.prenom} {selectedRec.nom}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">{selectedRec.sujet}</p>
                <p className="text-xs text-gray-600 mt-1">{selectedRec.message}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Réponse</label>
                <textarea
                  value={response}
                  onChange={e => setResponse(e.target.value)}
                  rows={4}
                  placeholder="Saisir la réponse à l'agent…"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setSelected(null)} className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Annuler</button>
                <button
                  disabled={respondMut.isPending || !response.trim()}
                  onClick={() => respondMut.mutate({ id: selectedRec.id, admin_response: response.trim(), statut: 'clôturé' })}
                  className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {respondMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Répondre et clôturer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
