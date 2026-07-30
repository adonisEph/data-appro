import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '../lib/api';
import { Card, Spinner, EmptyState, Button } from '../components/ui';
import { fmtDateTime } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

const STATUT_LABELS: Record<string, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  clôturé: 'Clôturé',
};

const STATUT_COLORS: Record<string, string> = {
  ouvert: 'bg-red-100 text-red-700',
  en_cours: 'bg-amber-100 text-amber-700',
  clôturé: 'bg-green-100 text-green-700',
};

export default function ReclamationsPage() {
  const { isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('ouvert');
  const [selected, setSelected] = useState<number | null>(null);
  const [response, setResponse] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reclamations', filter],
    queryFn: () => portalApi.listReclamations(filter === 'all' ? undefined : filter),
    enabled: isSuperAdmin,
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

  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card><div className="py-10 text-center text-sm text-gray-500">Accès réservé au SuperAdmin.</div></Card>
      </div>
    );
  }

  const reclamations = data?.reclamations ?? [];
  const selectedRec = reclamations.find(r => r.id === selected);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Réclamations Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Signalements remontés par les agents via le portail</p>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="ouvert">Ouverts</option>
          <option value="en_cours">En cours</option>
          <option value="clôturé">Clôturés</option>
          <option value="all">Tous</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : reclamations.length === 0 ? (
        <EmptyState title="Aucune réclamation" description="Aucun signalement pour ce filtre." />
      ) : (
        <div className="space-y-3">
          {reclamations.map(r => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900">{r.prenom} {r.nom}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_COLORS[r.statut] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUT_LABELS[r.statut] ?? r.statut}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{r.telephone} · {fmtDateTime(r.created_at)}</p>
                  <p className="text-sm font-medium text-gray-800">{r.sujet}</p>
                  <p className="text-sm text-gray-600 mt-1">{r.message}</p>
                  {r.admin_response && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-green-600 uppercase mb-1">Réponse admin</p>
                      <p className="text-xs text-gray-700">{r.admin_response}</p>
                      {r.responded_at && <p className="text-[10px] text-gray-400 mt-1">{fmtDateTime(r.responded_at)}</p>}
                    </div>
                  )}
                </div>
                {r.statut !== 'clôturé' && (
                  <Button size="sm" variant="secondary" onClick={() => { setSelected(r.id); setResponse(r.admin_response ?? ''); }}>
                    Répondre
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Répondre — {selectedRec.prenom} {selectedRec.nom}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
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
                <Button variant="secondary" onClick={() => setSelected(null)}>Annuler</Button>
                <Button
                  loading={respondMut.isPending}
                  disabled={!response.trim()}
                  onClick={() => respondMut.mutate({ id: selectedRec.id, admin_response: response.trim(), statut: 'clôturé' })}
                >
                  Répondre et clôturer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
