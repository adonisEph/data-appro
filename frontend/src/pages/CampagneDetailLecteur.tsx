import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { campagnesApi } from '../lib/api';
import { Card, CampagneBadge, TxBadge, ProgressBar, Spinner } from '../components/ui';
import { fmtFCFA, fmtMois, fmtTelephone, fmtDateTime, fmtPct } from '../lib/utils';

export default function CampagneDetailLecteurPage() {
  const { id } = useParams<{ id: string }>();
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch]             = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['campagne-viewer', id],
    queryFn: () => campagnesApi.get(Number(id)),
    refetchInterval: (q) => q.state.data?.campagne?.statut === 'en_cours' ? 5000 : false,
  });

  const campagne = data?.campagne;
  const allTransactions = data?.transactions ?? [];
  const transactions = allTransactions.filter(tx => {
    const matchS = !filterStatut || tx.statut === filterStatut;
    const matchR = !search || tx.telephone.includes(search) || `${tx.nom ?? ''} ${tx.prenom ?? ''}`.toLowerCase().includes(search.toLowerCase());
    return matchS && matchR;
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-600"/></div>;
  if (!campagne) return <div className="p-6 text-red-600">Campagne introuvable</div>;

  const budgetConfirme = allTransactions
    .filter(t => t.statut === 'confirme')
    .reduce((s, t) => s + (typeof t.montant_fcfa === 'number' ? t.montant_fcfa : 0), 0);
  const budgetRestant = Math.max(0, (campagne.budget_fcfa || 0) - budgetConfirme);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/campagnes-viewer" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </Link>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 capitalize">{fmtMois(campagne.mois)}</h1>
        <CampagneBadge statut={campagne.statut}/>
        <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Lecture seule</span>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Budget</p>
          <p className="text-lg font-bold text-gray-900">{fmtFCFA(budgetRestant)}</p>
          <p className="text-[10px] text-gray-400">Utilisé: {fmtFCFA(budgetConfirme)} / {fmtFCFA(campagne.budget_fcfa)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Option</p>
          <p className="text-lg font-bold text-gray-900">{campagne.option_envoi.toUpperCase()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Confirmés</p>
          <p className="text-lg font-bold text-gray-900">{campagne.agents_ok} / {campagne.total_agents}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Échecs</p>
          <p className="text-lg font-bold text-gray-900">{String(campagne.agents_echec)}</p>
        </Card>
      </div>

      {/* Progression */}
      <Card className="p-4 md:p-5">
        <div className="flex justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Progression</p>
          <p className="text-sm font-bold text-gray-900">{fmtPct(campagne.agents_ok, campagne.total_agents || 1)}</p>
        </div>
        <ProgressBar value={campagne.agents_ok} max={campagne.total_agents || 1} color={campagne.agents_echec > 0 ? 'amber' : 'green'}/>
        {campagne.lance_le && <p className="text-xs text-gray-400 mt-2">Lancée le {fmtDateTime(campagne.lance_le)}</p>}
        {campagne.termine_le && <p className="text-xs text-gray-400">Terminée le {fmtDateTime(campagne.termine_le)}</p>}
      </Card>

      {/* Transactions */}
      {data?.transactions && data.transactions.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" placeholder="Rechercher agent ou numéro…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 sm:w-40">
              <option value="">Tous statuts</option>
              <option value="confirme">Confirmés</option>
              <option value="echec">Échecs</option>
              <option value="en_attente">En attente</option>
            </select>
          </div>

          {/* Table desktop */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Téléphone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Poste</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{tx.prenom} {tx.nom}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtTelephone(tx.telephone)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{tx.role_label ?? tx.role ?? '—'}</td>
                      <td className="px-4 py-3"><TxBadge statut={tx.statut}/></td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {tx.montant_fcfa ? `${tx.montant_fcfa.toLocaleString('fr-FR')} F` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <p className="text-xs text-gray-500">{transactions.length} transaction{transactions.length > 1 ? 's' : ''}</p>
              </div>
            </div>
          </Card>

          {/* Cards mobile */}
          <div className="md:hidden space-y-2">
            {transactions.map(tx => (
              <Card key={tx.id} className="p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{tx.prenom} {tx.nom}</p>
                    <p className="font-mono text-xs text-gray-500">{fmtTelephone(tx.telephone)}</p>
                    {tx.role_label && <p className="text-xs text-gray-400 mt-0.5">{tx.role_label}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <TxBadge statut={tx.statut}/>
                    {tx.montant_fcfa && <p className="text-xs font-semibold text-gray-900 mt-1">{tx.montant_fcfa.toLocaleString('fr-FR')} F</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
