import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historiqueApi, trackedAgentsApi } from '../lib/api';
import { Card, TxBadge, RoleBadge, Modal, Button, Spinner } from '../components/ui';
import { fmtDateTime, fmtMois, fmtTelephone } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

export default function HistoriquePage() {
  const [filters, setFilters]   = useState({ telephone: '', statut: '', mois: '' });
  const [applied, setApplied]   = useState<typeof filters>({ telephone: '', statut: '', mois: '' });
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
      mois:        applied.mois        || undefined,
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
    const defaultFilters = { telephone: '', statut: '', mois: '' };
    setFilters(defaultFilters);
    setApplied(defaultFilters);
  };

  const handlePrint = () => {
    if (txList.length === 0) return;

    // ── Filtres appliqués ──────────────────────────────────────────────────
    const filtersParts: string[] = [];
    if (applied.telephone) filtersParts.push(`<span><strong>Téléphone :</strong> ${fmtTelephone(applied.telephone)}</span>`);
    if (applied.statut)    filtersParts.push(`<span><strong>Statut :</strong> ${applied.statut}</span>`);
    if (applied.mois)      filtersParts.push(`<span><strong>Campagne :</strong> ${fmtMois(applied.mois)}</span>`);
    if (!filtersParts.length) filtersParts.push('<span><strong>Filtres :</strong> Aucun (liste complète)</span>');
    filtersParts.push(`<span style="margin-left:auto"><strong>Total transactions :</strong> ${txList.length}</span>`);

    // ── Lignes du tableau ──────────────────────────────────────────────────
    const rows = txList.map(tx => {
      const nom      = `${tx.prenom ?? ''} ${tx.nom ?? ''}`.trim();
      const tel      = fmtTelephone(tx.telephone);
      const role     = tx.role_label ?? tx.role ?? '—';
      const campagne = tx.mois ? fmtMois(tx.mois) : `#${tx.campagne_id}`;
      const montant  = tx.montant_fcfa ? tx.montant_fcfa.toLocaleString('fr-FR') + ' F' : '—';
      const date     = fmtDateTime(tx.tente_le);

      let statutLabel = tx.statut;
      let statutClass = 'attente';
      if (tx.statut === 'confirme') { statutLabel = 'Confirmé'; statutClass = 'confirme'; }
      else if (tx.statut === 'echec') { statutLabel = 'Échec'; statutClass = 'echec'; }

      return [
        `<tr>`,
        `  <td style="font-weight:500">${nom}</td>`,
        `  <td style="font-family:monospace">${tel}</td>`,
        `  <td>${role}</td>`,
        `  <td>${campagne}</td>`,
        `  <td><span class="statut-badge ${statutClass}">${statutLabel}</span></td>`,
        `  <td style="font-weight:600;text-align:right">${montant}</td>`,
        `  <td style="font-size:10px">${date}</td>`,
        `</tr>`,
      ].join('');
    }).join('');

    const now = new Date();
    const printHTML = [
      '<!DOCTYPE html><html><head>',
      '<meta charset="UTF-8">',
      '<title>Rapport Audit – Historique des Approvisionnements</title>',
      '<style>',
      'body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#111827;background:#fff;margin:0;padding:20px}',
      '.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111827;padding-bottom:12px;margin-bottom:20px}',
      '.title{font-size:18px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em}',
      '.subtitle{font-size:11px;color:#6b7280;margin-top:4px}',
      '.meta{font-size:10px;color:#4b5563;text-align:right;line-height:1.4}',
      '.filters-summary{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:11px;display:flex;gap:24px;flex-wrap:wrap}',
      'table{width:100%;border-collapse:collapse;margin-top:10px}',
      'th{background:#f3f4f6;color:#374151;font-weight:600;text-transform:uppercase;font-size:9px;padding:8px 10px;border-bottom:2px solid #d1d5db;text-align:left}',
      'td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px}',
      'tr:nth-child(even) td{background:#f9fafb}',
      '.statut-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;text-transform:uppercase}',
      '.statut-badge.confirme{background:#d1fae5;color:#065f46}',
      '.statut-badge.echec{background:#fee2e2;color:#991b1b}',
      '.statut-badge.attente{background:#f3f4f6;color:#374151}',
      '.footer{margin-top:30px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#6b7280}',
      '@media print{@page{size:A4 portrait;margin:15mm}body{padding:0}}',
      '</style></head><body>',
      // En-tête
      '<div class="header">',
      '  <div>',
      '    <div class="title">Rapport d\'Audit – Historique des Approvisionnements</div>',
      '    <div class="subtitle">Système Data Appro – Airtel Congo CG</div>',
      '  </div>',
      '  <div class="meta">',
      `    <p><strong>Généré le :</strong> ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}</p>`,
      `    <p><strong>Opérateur :</strong> ${user?.prenom ?? ''} ${user?.nom ?? ''} (${user?.email ?? ''})</p>`,
      '  </div>',
      '</div>',
      // Filtres
      '<div class="filters-summary">' + filtersParts.join('') + '</div>',
      // Tableau
      '<table><thead><tr>',
      '<th style="width:22%">Agent</th>',
      '<th style="width:18%">Téléphone</th>',
      '<th style="width:14%">Rôle</th>',
      '<th style="width:14%">Campagne</th>',
      '<th style="width:10%">Statut</th>',
      '<th style="width:12%;text-align:right">Montant</th>',
      '<th style="width:18%">Date</th>',
      '</tr></thead>',
      '<tbody>' + rows + '</tbody>',
      '</table>',
      // Pied de page
      '<div class="footer">',
      '  <div>Rapport officiel issu de l\'application Data Appro.</div>',
      `  <div>Imprimé le ${now.toLocaleDateString('fr-FR')}</div>`,
      '</div>',
      '</body></html>',
    ].join('');

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }

    doc.open();
    doc.write(printHTML);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 500);
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Campagne (Mois)</label>
            <input type="month" value={filters.mois}
              onChange={e => setFilters(f => ({ ...f, mois: e.target.value }))}
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

      {/* Zone d'impression supprimée : le HTML est désormais généré dynamiquement dans handlePrint() */}

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
