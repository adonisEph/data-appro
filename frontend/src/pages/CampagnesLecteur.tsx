import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { campagnesApi } from '../lib/api';
import { Card, CampagneBadge, ProgressBar, Spinner, EmptyState } from '../components/ui';
import { fmtFCFA, fmtMois, fmtPct, fmtDateTime } from '../lib/utils';
import type { StatutCampagne } from '../types';
import { STATUT_LABELS } from '../types';
import { Link } from 'react-router-dom';

export default function CampagnesLecteurPage() {
  const [filterStatut, setFilterStatut] = useState<StatutCampagne | ''>('');
  const [filterMois, setFilterMois]     = useState('');
  const [search, setSearch]             = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['campagnes-viewer'],
    queryFn: campagnesApi.list,
    refetchInterval: 30_000,
  });

  const campagnes = (data?.campagnes ?? []).filter(c => {
    const matchStatut = !filterStatut || c.statut === filterStatut;
    const matchMois   = !filterMois   || c.mois.includes(filterMois);
    const matchSearch = !search       || c.mois.includes(search) || c.responsable_nom?.toLowerCase().includes(search.toLowerCase());
    return matchStatut && matchMois && matchSearch;
  });

  const stats = {
    total:     data?.campagnes.length ?? 0,
    terminees: data?.campagnes.filter(c => c.statut === 'terminee').length ?? 0,
    enCours:   data?.campagnes.filter(c => c.statut === 'en_cours').length ?? 0,
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Campagnes d'approvisionnement</h1>
        <p className="text-sm text-gray-500 mt-0.5">Consultation en lecture seule</p>
      </div>

      {/* Badge lecture seule */}
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
        <span className="text-sm text-gray-600">Mode lecture seule — Vous pouvez consulter et filtrer les campagnes</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total campagnes', value: stats.total, color: 'text-gray-900' },
          { label: 'Terminées', value: stats.terminees, color: 'text-green-700' },
          { label: 'En cours', value: stats.enCours, color: 'text-blue-700' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-3 md:p-4 text-center">
            <p className={`text-xl md:text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="search" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value as StatutCampagne | '')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tous les statuts</option>
            {(Object.entries(STATUT_LABELS) as [StatutCampagne, string][]).map(([k, v]) =>
              <option key={k} value={k}>{v}</option>
            )}
          </select>
          <input type="month" value={filterMois} onChange={e => setFilterMois(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
      </Card>

      {/* Liste campagnes */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600"/></div>
      ) : campagnes.length === 0 ? (
        <EmptyState title="Aucune campagne" description="Aucune campagne ne correspond à vos filtres."/>
      ) : (
        <div className="space-y-3">
          {campagnes.map(c => (
            <Link key={c.id} to={`/campagnes-viewer/${c.id}`}>
              <Card className="p-4 md:p-5 hover:border-brand-200 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 capitalize">{fmtMois(c.mois)}</h3>
                    {c.responsable_nom && (
                      <p className="text-xs text-gray-500 mt-0.5">Par {c.responsable_nom}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <CampagneBadge statut={c.statut}/>
                    <span className="text-sm font-semibold text-gray-900">{fmtFCFA(c.budget_fcfa)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs text-gray-500 mb-3">
                  <div><p className="text-gray-400">Approvisionnés</p><p className="font-semibold text-gray-900">{c.agents_ok} / {c.total_agents}</p></div>
                  <div><p className="text-gray-400">Échecs</p><p className={`font-semibold ${c.agents_echec > 0 ? 'text-red-600' : 'text-gray-500'}`}>{c.agents_echec}</p></div>
                  <div><p className="text-gray-400">Option</p><p className="font-semibold text-gray-700 uppercase">{c.option_envoi}</p></div>
                </div>
                {c.total_agents > 0 && (
                  <ProgressBar value={c.agents_ok} max={c.total_agents} color={c.agents_echec > 0 ? 'amber' : 'green'}/>
                )}
                {c.total_agents > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{fmtPct(c.agents_ok, c.total_agents)} complété</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
