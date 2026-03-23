import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { campagnesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { LiveBanner } from '../components/ui/LiveBanner';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useProvisionProgress } from '../hooks/useProvisionProgress';
import { useAuth } from '../hooks/useAuth';
import {
  Card, Button, CampagneBadge, TxBadge, RoleBadge,
  ProgressBar, Spinner, EmptyState,
} from '../components/ui';
import { fmtFCFA, fmtMois, fmtTelephone, fmtPct } from '../lib/utils';

// ══════════════════════════════════════════════════════════
// Liste des campagnes
// ══════════════════════════════════════════════════════════

export function CampagnesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isSuperAdmin } = useAuth();
  const [deleteCampagne, setDeleteCampagne] = useState<import('../types').Campagne | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => campagnesApi.delete(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['campagnes'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Campagne supprimée', res.message);
      setDeleteCampagne(null);
    },
    onError: (err: Error) => toast.error('Erreur suppression', err.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['campagnes'],
    queryFn: campagnesApi.list,
  });

  const campagnes = data?.campagnes ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campagnes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historique des approvisionnements mensuels</p>
        </div>
        <Link to="/campagnes/nouvelle">
          <Button size="sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nouvelle campagne
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-600" /></div>
      ) : campagnes.length === 0 ? (
        <EmptyState
          title="Aucune campagne"
          description="Créez votre première campagne d'approvisionnement."
          action={<Link to="/campagnes/nouvelle"><Button size="sm">Nouvelle campagne</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {campagnes.map(c => (
            <Link key={c.id} to={`/campagnes/${c.id}`}>
              <Card className="p-5 hover:border-brand-200 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">Campagne {c.mois}</h3>
                    <CampagneBadge statut={c.statut} />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {c.budget_fcfa.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Agents OK</p>
                    <p className="font-medium text-green-700">{c.agents_ok} / {c.total_agents}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Échecs</p>
                    <p className={`font-medium ${c.agents_echec > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {c.agents_echec}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Option</p>
                    <p className="font-medium text-gray-700 capitalize">{c.option_envoi}</p>
                  </div>
                </div>
                {c.total_agents > 0 && (
                  <ProgressBar
                    value={c.agents_ok}
                    max={c.total_agents}
                    color={c.agents_echec > 0 ? 'amber' : 'green'}
                  />
                )}
                {isSuperAdmin && c.statut !== 'en_cours' && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={e => { e.preventDefault(); setDeleteCampagne(c); }}
                      className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Confirm suppression campagne */}
      <ConfirmModal
        open={deleteCampagne !== null}
        onClose={() => setDeleteCampagne(null)}
        onConfirm={() => deleteCampagne && deleteMut.mutate(deleteCampagne.id)}
        title="Supprimer la campagne"
        confirmVariant="danger"
        confirmLabel="Supprimer définitivement"
        loading={deleteMut.isPending}
        message={
          <div className="space-y-2">
            <p>Supprimer la campagne <strong className="capitalize">{deleteCampagne ? fmtMois(deleteCampagne.mois) : ''}</strong> ?</p>
            <p className="text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">
              ⚠️ Toutes les transactions associées seront également supprimées. Cette action est irréversible.
            </p>
          </div>
        }
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Détail d'une campagne
// ══════════════════════════════════════════════════════════

export function CampagneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch] = useState('');
  const [confirmLancer, setConfirmLancer] = useState(false);
  const [confirmRelancer, setConfirmRelancer] = useState(false);

  const {
    campagne, transactions, isLive,
    confirmes, echecs, enAttente, isLoading,
  } = useProvisionProgress(Number(id));

  const [modeTest, setModeTest] = useState(false);
  const [agentsSelectionnes, setAgentsSelectionnes] = useState<number[]>([]);

  const lancerMut = useMutation({
    mutationFn: () => {
      const token = localStorage.getItem('appro_token');
      const body = modeTest && agentsSelectionnes.length > 0
        ? JSON.stringify({ agent_ids: agentsSelectionnes })
        : '{}';
      return fetch(
        `https://data-appro-worker.jamesdjimby.workers.dev/api/campagnes/${id}/lancer`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body }
      ).then(r => r.json()) as Promise<{ ok: boolean; message: string; agents_count: number }>;
    },
    onSuccess: (res) => {
      toast.success('Provisionnement lancé !', res.message);
      qc.invalidateQueries({ queryKey: ['campagne-live', id] });
    },
    onError: (err: Error) => toast.error('Erreur lancement', err.message),
  });

  const relancerMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campagnes/${id}/relancer-echecs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('appro_token')}`,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      toast.info('Relance démarrée', 'Les transactions en échec sont en cours de retraitement.');
      qc.invalidateQueries({ queryKey: ['campagne', id] });
    },
    onError: (err: Error) => toast.error('Erreur relance', err.message),
  });

  const handleExportCSV = () => {
    const token = localStorage.getItem('appro_token');
    fetch(`/api/campagnes/${id}/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `campagne-${campagne?.mois ?? id}.csv`;
        a.click();
      })
      .catch(() => toast.error('Export échoué', 'Impossible de télécharger le fichier CSV.'));
  };

  const filteredTx = transactions.filter(tx => {
    const matchStatut = !filterStatut || tx.statut === filterStatut;
    const matchSearch = !search ||
      tx.telephone.includes(search) ||
      `${tx.nom ?? ''} ${tx.prenom ?? ''}`.toLowerCase().includes(search.toLowerCase());
    return matchStatut && matchSearch;
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-brand-600" /></div>;
  if (!campagne) return <div className="p-6 text-red-600">Campagne introuvable</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Confirm lancer */}
      <ConfirmModal
        open={confirmLancer}
        onClose={() => setConfirmLancer(false)}
        onConfirm={() => { setConfirmLancer(false); lancerMut.mutate(); }}
        title="Lancer le provisionnement"
        confirmLabel="Lancer pour tous les agents"
        loading={lancerMut.isPending}
        message={
          <div className="space-y-2">
            <p>Cette action va approvisionner <strong>tous les agents actifs</strong> via Airtel Money.</p>
            <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs">
              ⚠️ Assurez-vous que le budget est bien disponible sur le compte Airtel Money source avant de continuer.
            </p>
          </div>
        }
      />

      {/* Confirm relancer */}
      <ConfirmModal
        open={confirmRelancer}
        onClose={() => setConfirmRelancer(false)}
        onConfirm={() => { setConfirmRelancer(false); relancerMut.mutate(); }}
        title="Relancer les transactions en échec"
        confirmLabel={`Relancer ${campagne.agents_echec} transaction(s)`}
        loading={relancerMut.isPending}
        message={`Retenter l'envoi pour les ${campagne.agents_echec} agent(s) dont la transaction a échoué. Maximum 3 tentatives par agent.`}
      />
      <div className="flex items-center gap-3">
        <Link to="/campagnes" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 capitalize">{fmtMois(campagne.mois)}</h1>
        <CampagneBadge statut={campagne.statut} />
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Budget', value: fmtFCFA(campagne.budget_fcfa) },
          { label: 'Option', value: campagne.option_envoi.toUpperCase() },
          { label: 'Confirmés', value: `${campagne.agents_ok} / ${campagne.total_agents}` },
          { label: 'Échecs', value: String(campagne.agents_echec) },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-lg font-bold text-gray-900">{value}</p>
          </Card>
        ))}
      </div>

      {/* LiveBanner quand en_cours */}
      {isLive ? (
        <LiveBanner
          campagne={campagne}
          confirmes={confirmes}
          echecs={echecs}
          enAttente={enAttente}
        />
      ) : (
        /* Barre de progression statique */
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Progression</p>
            <p className="text-sm font-bold text-gray-900">
              {fmtPct(campagne.agents_ok, campagne.total_agents || 1)}
            </p>
          </div>
          <ProgressBar
            value={campagne.agents_ok}
            max={campagne.total_agents || 1}
            color={campagne.agents_echec > 0 ? 'amber' : 'green'}
          />
        </Card>
      )}

      {/* Mode test toggle */}
      {campagne.statut === 'brouillon' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-900">Mode test</p>
              <p className="text-xs text-amber-700">Envoyer uniquement à des agents sélectionnés avant le lancement global</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={modeTest} onChange={e => setModeTest(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded"/>
              <span className="text-sm text-amber-800 font-medium">{modeTest ? 'Activé' : 'Désactivé'}</span>
            </label>
          </div>
          {modeTest && (
            <div>
              <p className="text-xs font-medium text-amber-800 mb-2">
                IDs des agents à tester (séparés par des virgules) :
              </p>
              <input
                type="text"
                placeholder="ex: 1, 5, 12"
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                onChange={e => {
                  const ids = e.target.value.split(',')
                    .map(s => parseInt(s.trim()))
                    .filter(n => !isNaN(n));
                  setAgentsSelectionnes(ids);
                }}
              />
              {agentsSelectionnes.length > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  {agentsSelectionnes.length} agent(s) sélectionné(s) : {agentsSelectionnes.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {campagne.statut === 'brouillon' && (
          <Button loading={lancerMut.isPending} onClick={() => setConfirmLancer(true)}>
            {modeTest && agentsSelectionnes.length > 0
              ? `🧪 Tester avec ${agentsSelectionnes.length} agent(s)`
              : '🚀 Lancer le provisionnement'}
          </Button>
        )}
        {campagne.agents_echec > 0 && !isLive && (
          <Button variant="secondary" loading={relancerMut.isPending} onClick={() => setConfirmRelancer(true)}>
            🔄 Relancer les échecs ({campagne.agents_echec})
          </Button>
        )}
        {transactions.length > 0 && (
          <Button variant="secondary" onClick={handleExportCSV}>
            ⬇ Exporter CSV
          </Button>
        )}
      </div>

      {/* Transactions */}
      {transactions.length > 0 && (
        <Card>
          <div className="p-4 border-b border-gray-100 flex gap-3">
            <input
              type="search"
              placeholder="Rechercher nom, numéro…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              value={filterStatut}
              onChange={e => setFilterStatut(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Tous les statuts</option>
              <option value="confirme">Confirmés</option>
              <option value="echec">Échecs</option>
              <option value="en_attente">En attente</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Téléphone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rôle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Option</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Référence Airtel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTx.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{tx.prenom} {tx.nom}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtTelephone(tx.telephone)}</td>
                    <td className="px-4 py-3">{tx.role && <RoleBadge role={tx.role} />}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 uppercase">{tx.option_used}</span>
                    </td>
                    <td className="px-4 py-3"><TxBadge statut={tx.statut} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[160px]">
                      {tx.airtel_transaction_id ?? tx.airtel_message ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <p className="text-xs text-gray-500">{filteredTx.length} transaction{filteredTx.length > 1 ? 's' : ''}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Nouvelle campagne
// ══════════════════════════════════════════════════════════

export function NouvelleCampagnePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    mois: new Date().toISOString().slice(0, 7),
    budget_fcfa: 1500000,
    compte_source: '',
    option_envoi: 'argent' as const,
  });

  const createMut = useMutation({
    mutationFn: () => campagnesApi.create(form),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['campagnes'] });
      navigate(`/campagnes/${res.campagne_id}`);
    },
    onError: (err: Error) => toast.error('Erreur création', err.message),
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/campagnes" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle campagne</h1>
      </div>

      <Card className="p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Mois d'approvisionnement</label>
          <input
            type="month"
            value={form.mois}
            onChange={e => setForm(f => ({ ...f, mois: e.target.value }))}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget (FCFA)</label>
          <input
            type="number"
            value={form.budget_fcfa}
            onChange={e => setForm(f => ({ ...f, budget_fcfa: Number(e.target.value) }))}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="1500000"
          />
          <p className="text-xs text-gray-400 mt-1">Budget type : 1 500 000 FCFA</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Numéro Airtel Money source (compte responsable)
          </label>
          <input
            type="tel"
            value={form.compte_source}
            onChange={e => setForm(f => ({ ...f, compte_source: e.target.value }))}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
            placeholder="05 XXX XXXX ou 04 XXX XXXX"
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">Envoi d'argent via Airtel Money</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Chaque agent reçoit le montant FCFA correspondant à son forfait (issu du fichier Excel)
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate('/campagnes')}>Annuler</Button>
          <Button
            loading={createMut.isPending}
            onClick={() => {
              if (!form.compte_source) { toast.warning('Champ requis', 'Numéro Airtel Money source manquant.'); return; }
              createMut.mutate();
            }}
          >
            Créer la campagne
          </Button>
        </div>
      </Card>
    </div>
  );
}
