import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { historiqueApi } from '../lib/api';
import { StatCard, Card, CampagneBadge, ProgressBar, Spinner } from '../components/ui';
import { fmtFCFA, fmtPct } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: historiqueApi.stats,
    refetchInterval: 10_000,
  });

  const last = data?.last_campagne;
  const txStats = data?.transactions_par_statut ?? [];
  const confirmes = txStats.find(r => r.statut === 'confirme')?.n ?? 0;
  const echecs    = txStats.find(r => r.statut === 'echec')?.n ?? 0;

  if (isLoading) return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <Spinner size="lg" className="text-brand-600"/>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Bonjour, {user?.prenom} — {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <Link to="/campagnes/nouvelle"
          className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors self-start sm:self-auto">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Nouvelle campagne
        </Link>
      </div>

      {/* Stats grid — 2 colonnes sur mobile, 4 sur desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Agents actifs" value={data?.total_agents ?? 0} sub="Dans le système" color="indigo"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />
        <StatCard label="Campagnes" value={data?.total_campagnes ?? 0} sub="Total historique" color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
        />
        <StatCard label="Confirmés" value={confirmes.toLocaleString()} sub="Transactions OK" color="green"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <StatCard label="Échecs" value={echecs.toLocaleString()} sub="À relancer" color={echecs > 0 ? 'red' : 'green'}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
      </div>

      {/* Dernière campagne */}
      {last && (
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Dernière campagne</h2>
            <CampagneBadge statut={last.statut}/>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Mois', value: last.mois },
              { label: 'Budget', value: fmtFCFA(last.budget_fcfa) },
              { label: 'Approvisionnés', value: `${last.agents_ok} / ${last.total_agents}` },
              { label: 'Échecs', value: String(last.agents_echec) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <ProgressBar value={last.agents_ok} max={last.total_agents || 1} color={last.agents_echec > 0 ? 'amber' : 'green'}/>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">
              {last.total_agents > 0 ? `${fmtPct(last.agents_ok, last.total_agents)} complété` : 'Non lancée'}
            </p>
            <Link to={`/campagnes/${last.id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
              Voir le détail →
            </Link>
          </div>
        </Card>
      )}

      {/* Raccourcis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        <Link to="/agents">
          <Card className="p-4 md:p-5 hover:border-brand-200 hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center group-hover:bg-brand-100 transition-colors shrink-0">
                <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Gérer les agents</p>
                <p className="text-xs text-gray-500">Importer Excel, modifier les rôles</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/historique">
          <Card className="p-4 md:p-5 hover:border-brand-200 hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center group-hover:bg-green-100 transition-colors shrink-0">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Historique & preuves</p>
                <p className="text-xs text-gray-500">Rechercher, exporter, litiges</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
