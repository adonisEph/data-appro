import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historiqueApi } from '../lib/api';
import { Card, TxBadge, RoleBadge, Modal, Button, Spinner } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { fmtDateTime, fmtTelephone } from '../lib/utils';

export default function HistoriquePage() {
  const [filters, setFilters] = useState({ telephone: '', statut: '', campagne_id: '' });
  const [applied, setApplied] = useState<typeof filters>({ telephone: '', statut: '', campagne_id: '' });
  const [preuveId, setPreuveId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', applied],
    queryFn: () => historiqueApi.transactions({
      telephone: applied.telephone || undefined,
      statut: applied.statut || undefined,
      campagne_id: applied.campagne_id ? Number(applied.campagne_id) : undefined,
    }),
  });

  const { data: preuve } = useQuery({
    queryKey: ['preuve', preuveId],
    queryFn: () => historiqueApi.preuve(preuveId!),
    enabled: preuveId !== null,
  });

  const txList = data?.transactions ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Historique & Audit</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Recherche, preuves d'envoi et gestion des litiges
        </p>
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="search"
            placeholder="Numéro de téléphone…"
            value={filters.telephone}
            onChange={e => setFilters(f => ({ ...f, telephone: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={filters.statut}
            onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Tous les statuts</option>
            <option value="confirme">Confirmé</option>
            <option value="echec">Échec</option>
            <option value="en_attente">En attente</option>
            <option value="double_detected">Doublon</option>
          </select>
          <input
            type="number"
            placeholder="ID Campagne…"
            value={filters.campagne_id}
            onChange={e => setFilters(f => ({ ...f, campagne_id: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex justify-end mt-3">
          <Button size="sm" onClick={() => setApplied(filters)}>
            Rechercher
          </Button>
        </div>
      </Card>

      {/* Résultats */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600" /></div>
        ) : txList.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">Aucune transaction trouvée</div>
        ) : (
          <>
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
                      <td className="px-4 py-3 font-medium text-gray-900">{tx.prenom} {tx.nom}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtTelephone(tx.telephone)}</td>
                      <td className="px-4 py-3">{tx.role && <RoleBadge role={tx.role} />}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">#{tx.campagne_id}</td>
                      <td className="px-4 py-3"><TxBadge statut={tx.statut} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {fmtDateTime(tx.tente_le)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setPreuveId(tx.id)}
                          className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                        >
                          Voir →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <p className="text-xs text-gray-500">{txList.length} transaction{txList.length > 1 ? 's' : ''}</p>
            </div>
          </>
        )}
      </Card>

      {/* Modal preuve */}
      <Modal
        open={preuveId !== null}
        onClose={() => setPreuveId(null)}
        title="Preuve de transaction"
      >
        {preuve?.preuve ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Agent', `${preuve.preuve.prenom ?? ''} ${preuve.preuve.nom ?? ''}`],
                ['Téléphone', preuve.preuve.telephone],
                ['Campagne', preuve.preuve.mois],
                ['Option', preuve.preuve.option_used?.toUpperCase()],
                ['Statut', preuve.preuve.statut],
                ['Airtel TX ID', preuve.preuve.airtel_transaction_id ?? '—'],
                ['Référence', preuve.preuve.airtel_reference ?? '—'],
                ['Message Airtel', preuve.preuve.airtel_message ?? '—'],
                ['Tentative le', fmtDateTime(preuve.preuve.tente_le)],
                ['Confirmé le',  fmtDateTime(preuve.preuve.confirme_le)],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="font-medium text-gray-900 break-all">{value}</p>
                </div>
              ))}
            </div>
            {preuve.preuve.airtel_raw_response && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Réponse brute Airtel (JSON)</p>
                <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto max-h-40">
                  {JSON.stringify(JSON.parse(preuve.preuve.airtel_raw_response), null, 2)}
                </pre>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const content = JSON.stringify(preuve.preuve, null, 2);
                  const blob = new Blob([content], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `preuve_tx_${preuveId}.json`;
                  a.click();
                }}
              >
                Exporter JSON
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-8"><Spinner size="md" className="text-brand-600" /></div>
        )}
      </Modal>
    </div>
  );
}
