import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historiqueApi, trackedAgentsApi } from '../lib/api';
import { Card, TxBadge, RoleBadge, Modal, Button, Spinner } from '../components/ui';
import { fmtDateTime, fmtMois, fmtTelephone } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

export default function HistoriquePage() {
  const [filters, setFilters]   = useState({ telephone: '', statut: '', date: '' });
  const [applied, setApplied]   = useState<typeof filters>({ telephone: '', statut: '', date: '' });
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
      date:        applied.date        || undefined,
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

  const handleReset = () => {
    const defaultFilters = { telephone: '', statut: '', date: '' };
    setFilters(defaultFilters);
    setApplied(defaultFilters);
  };

  const handlePrint = () => {
    const printContent = document.getElementById('print-area')?.innerHTML;
    if (!printContent) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Rapport d'Audit - Historique des Approvisionnements</title>
          <style>
            body {
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #111827;
              background-color: #fff;
              margin: 0;
              padding: 20px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #111827;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 18px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .subtitle {
              font-size: 11px;
              color: #6b7280;
              margin-top: 4px;
            }
            .meta {
              font-size: 10px;
              color: #4b5563;
              text-align: right;
              line-height: 1.4;
            }
            .filters-summary {
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 10px 14px;
              margin-bottom: 20px;
              font-size: 11px;
              display: flex;
              gap: 24px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th {
              background-color: #f3f4f6;
              color: #374151;
              font-weight: 600;
              text-transform: uppercase;
              font-size: 9px;
              padding: 8px 10px;
              border-bottom: 2px solid #d1d5db;
              text-align: left;
            }
            td {
              padding: 8px 10px;
              border-bottom: 1px solid #e5e7eb;
              font-size: 11px;
            }
            tr:nth-child(even) td {
              background-color: #f9fafb;
            }
            .statut-badge {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: 600;
              text-transform: uppercase;
            }
            .statut-badge.confirme {
              background-color: #d1fae5;
              color: #065f46;
            }
            .statut-badge.echec {
              background-color: #fee2e2;
              color: #991b1b;
            }
            .statut-badge.attente {
              background-color: #f3f4f6;
              color: #374151;
            }
            .footer {
              margin-top: 30px;
              padding-top: 10px;
              border-top: 1px solid #e5e7eb;
              display: flex;
              justify-content: space-between;
              font-size: 9px;
              color: #6b7280;
            }
            @media print {
              @page {
                size: A4 portrait;
                margin: 15mm;
              }
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          \${printContent}
        </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      document.body.removeChild(iframe);
    }, 400);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Historique & Audit</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preuves d'envoi et gestion des litiges</p>
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Téléphone</label>
            <input type="search" placeholder="Numéro de téléphone…" value={filters.telephone}
              onChange={e => setFilters(f => ({ ...f, telephone: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</label>
            <select value={filters.statut} onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Tous les statuts</option>
              <option value="confirme">Confirmé</option>
              <option value="echec">Échec</option>
              <option value="en_attente">En attente</option>
              <option value="double_detected">Doublon</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Campagne (Date)</label>
            <input type="date" value={filters.date}
              onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"/>
          </div>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <Button variant="secondary" size="sm" onClick={handleReset}>Réinitialiser</Button>
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
          {/* Entête avec Boutons d'Action */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{txList.length} transaction{txList.length > 1 ? 's' : ''} trouvée{txList.length > 1 ? 's' : ''}</span>
            <Button variant="secondary" size="sm" onClick={handlePrint} className="flex items-center gap-1.5 shadow-sm">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Imprimer
            </Button>
          </div>

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

      {/* Zone d'impression masquée (servant de template HTML) */}
      <div id="print-area" className="hidden">
        <div className="header">
          <div>
            <div className="title">Rapport d'Audit - Historique des Approvisionnements</div>
            <div className="subtitle">Système Data Appro Airtel Congo CG</div>
          </div>
          <div className="meta">
            <p><strong>Généré le :</strong> {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}</p>
            <p><strong>Opérateur :</strong> {user?.prenom} {user?.nom} ({user?.email})</p>
          </div>
        </div>

        <div className="filters-summary">
          {applied.telephone && (
            <div><strong>Téléphone :</strong> {fmtTelephone(applied.telephone)}</div>
          )}
          {applied.statut && (
            <div><strong>Statut :</strong> <span className="capitalize">{applied.statut}</span></div>
          )}
          {applied.date && (
            <div><strong>Date :</strong> {new Date(applied.date).toLocaleDateString('fr-FR')}</div>
          )}
          {!applied.telephone && !applied.statut && !applied.date && (
            <div><strong>Filtres :</strong> Aucun (liste complète)</div>
          )}
          <div style={{ marginLeft: 'auto' }}><strong>Total transactions :</strong> {txList.length}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '25%' }}>Agent</th>
              <th style={{ width: '20%' }}>Téléphone</th>
              <th style={{ width: '15%' }}>Rôle</th>
              <th style={{ width: '15%' }}>Campagne</th>
              <th style={{ width: '10%' }}>Statut</th>
              <th style={{ width: '15%', textAlign: 'right' }}>Montant</th>
              <th style={{ width: '20%' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {txList.map(tx => (
              <tr key={tx.id}>
                <td style={{ fontWeight: '500' }}>{tx.prenom} {tx.nom}</td>
                <td style={{ fontFamily: 'monospace' }}>{fmtTelephone(tx.telephone)}</td>
                <td>{tx.role_label ?? tx.role ?? '—'}</td>
                <td>{tx.mois ? fmtMois(tx.mois) : `#${tx.campagne_id}`}</td>
                <td>
                  <span className={`statut-badge \${tx.statut === 'confirme' ? 'confirme' : tx.statut === 'echec' ? 'echec' : 'attente'}`}>
                    {tx.statut === 'confirme' ? 'Confirmé' : tx.statut === 'echec' ? 'Échec' : tx.statut}
                  </span>
                </td>
                <td style={{ fontWeight: '600', textAlign: 'right' }}>
                  {tx.montant_fcfa ? tx.montant_fcfa.toLocaleString('fr-FR') + ' F' : '—'}
                </td>
                <td style={{ fontSize: '10px' }}>{fmtDateTime(tx.tente_le)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="footer">
          <div>Rapport officiel issu de l'application Data Appro.</div>
          <div>Page 1 sur 1</div>
        </div>
      </div>

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
