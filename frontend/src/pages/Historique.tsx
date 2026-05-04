import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historiqueApi, trackedAgentsApi } from '../lib/api';
import { Card, TxBadge, RoleBadge, Modal, Button, Spinner } from '../components/ui';
import { fmtDateTime, fmtMois, fmtTelephone } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

export default function HistoriquePage() {
  const [filters, setFilters]   = useState({ telephone: '', statut: '', campagne_id: '' });
  const [applied, setApplied]   = useState<typeof filters>({ telephone: '', statut: '', campagne_id: '' });
  const [preuveId, setPreuveId] = useState<number | null>(null);
  const { isSuperAdmin, user } = useAuth();

  const canView = isSuperAdmin || Boolean(user?.droits?.can_view_historique);
  if (!canView) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Historique & Audit</h1>
          <p className="text-sm text-gray-500 mt-0.5">Preuves d'envoi et gestion des litiges</p>
        </div>
        <Card>
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-gray-900">Accès refusé</p>
            <p className="text-sm text-gray-500 mt-1">Tu n'as pas le droit "Voir l'historique".</p>
          </div>
        </Card>
      </div>
    );
  }

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', applied],
    queryFn: () => historiqueApi.transactions({
      telephone:   applied.telephone   || undefined,
      statut:      applied.statut      || undefined,
      campagne_id: applied.campagne_id ? Number(applied.campagne_id) : undefined,
    }),
  });

  const { data: preuve } = useQuery({
    queryKey: ['preuve', preuveId],
    queryFn:  () => historiqueApi.preuve(preuveId!),
    enabled:  preuveId !== null,
  });

  const txList = data?.transactions ?? [];

  const { data: trackedData } = useQuery({
    queryKey: ['tracked-agents'],
    queryFn: trackedAgentsApi.list,
    enabled: isSuperAdmin,
    staleTime: 10_000,
  });
  const trackedSet = new Set<number>((trackedData?.tracked_agents ?? []).map(a => a.agent_id));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Historique & Audit</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preuves d'envoi et gestion des litiges</p>
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="search" placeholder="Numéro de téléphone…" value={filters.telephone}
            onChange={e => setFilters(f => ({ ...f, telephone: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <select value={filters.statut} onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tous les statuts</option>
            <option value="confirme">Confirmé</option>
            <option value="echec">Échec</option>
            <option value="en_attente">En attente</option>
            <option value="double_detected">Doublon</option>
          </select>
          <input type="number" placeholder="ID Campagne…" value={filters.campagne_id}
            onChange={e => setFilters(f => ({ ...f, campagne_id: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
        <div className="flex justify-end mt-3">
          <Button size="sm" onClick={() => setApplied(filters)}>Rechercher</Button>
        </div>
      </Card>

      {/* Résultats */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600"/></div>
      ) : txList.length === 0 ? (
        <Card><div className="py-12 text-center text-gray-500 text-sm">Aucune transaction trouvée</div></Card>
      ) : (
        <>
          {/* Table desktop */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Téléphone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rôle</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Campagne</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Preuve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {txList.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-gray-900 truncate">{tx.prenom} {tx.nom}</span>
                          {isSuperAdmin && typeof tx.agent_id === 'number' && trackedSet.has(tx.agent_id) && (
                            <span className="shrink-0 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">SUIVI</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtTelephone(tx.telephone)}</td>
                      <td className="px-4 py-3">{tx.role && <RoleBadge role={tx.role}/>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{tx.mois ? fmtMois(tx.mois) : `#${tx.campagne_id}`}</td>
                      <td className="px-4 py-3"><TxBadge statut={tx.statut}/></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDateTime(tx.tente_le)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setPreuveId(tx.id)} className="text-brand-600 hover:text-brand-800 text-xs font-medium">Voir →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <p className="text-xs text-gray-500">{txList.length} transaction{txList.length > 1 ? 's' : ''}</p>
              </div>
            </div>
          </Card>

          {/* Cards mobile */}
          <div className="md:hidden space-y-2">
            {txList.map(tx => (
              <Card key={tx.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{tx.prenom} {tx.nom}</p>
                      {isSuperAdmin && typeof tx.agent_id === 'number' && trackedSet.has(tx.agent_id) && (
                        <span className="shrink-0 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">SUIVI</span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-gray-500">{fmtTelephone(tx.telephone)}</p>
                  </div>
                  <TxBadge statut={tx.statut}/>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{tx.mois ? fmtMois(tx.mois) : `Campagne #${tx.campagne_id}`} · {fmtDateTime(tx.tente_le)}</span>
                  <button onClick={() => setPreuveId(tx.id)} className="text-brand-600 font-medium">Preuve →</button>
                </div>
              </Card>
            ))}
            <p className="text-xs text-gray-400 text-center py-2">{txList.length} transaction{txList.length > 1 ? 's' : ''}</p>
          </div>
        </>
      )}

      {/* Modal preuve */}
      <Modal open={preuveId !== null} onClose={() => setPreuveId(null)} title="Preuve de transaction">
        {preuve?.preuve ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ['Agent', `${preuve.preuve.prenom ?? ''} ${preuve.preuve.nom ?? ''}`],
                ['Téléphone', fmtTelephone(preuve.preuve.telephone)],
                ['Campagne', preuve.preuve.mois],
                ['Statut', preuve.preuve.statut],
                ['ID Airtel', preuve.preuve.airtel_transaction_id ?? '—'],
                ['Message', preuve.preuve.airtel_message ?? '—'],
                ['Tentative le', fmtDateTime(preuve.preuve.tente_le)],
                ['Confirmé le', fmtDateTime(preuve.preuve.confirme_le)],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="font-medium text-gray-900 break-all text-xs">{value}</p>
                </div>
              ))}
            </div>
            {preuve.preuve.airtel_raw_response && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Réponse brute Airtel</p>
                <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto max-h-36">
                  {JSON.stringify(JSON.parse(preuve.preuve.airtel_raw_response), null, 2)}
                </pre>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => {
                const blob = new Blob([JSON.stringify(preuve.preuve, null, 2)], { type: 'application/json' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `preuve_tx_${preuveId}.json`; a.click();
              }}>Exporter JSON</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-8"><Spinner size="md" className="text-brand-600"/></div>
        )}
      </Modal>
    </div>
  );
}
