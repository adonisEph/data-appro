import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { agentsApi, campagnesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { LiveBanner } from '../components/ui/LiveBanner';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useProvisionProgress } from '../hooks/useProvisionProgress';
import { useAuth } from '../hooks/useAuth';
import {
  Card, Button, CampagneBadge, TxBadge, RoleBadge,
  ProgressBar, Spinner, EmptyState, Modal,
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
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
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
  const [todoOnly, setTodoOnly] = useState(true);
  const [manualSort, setManualSort] = useState<'quota' | 'montant'>('montant');
  const [manualSortDir, setManualSortDir] = useState<'asc' | 'desc'>('desc');
  const [manualModal, setManualModal] = useState<null | {
    agent_id: number;
    agent_label: string;
    telephone: string;
    action: 'argent' | 'forfait';
    statut: 'confirme' | 'echec';
    sms: string;
    montant_fcfa?: number;
  }>(null);

  const {
    campagne, transactions, isLive,
    confirmes, echecs, enAttente, isLoading,
  } = useProvisionProgress(Number(id));

  const [modeTest, setModeTest] = useState(false);
  const [agentsSelectionnes, setAgentsSelectionnes] = useState<number[]>([]);

  const isManual = (campagne as unknown as { mode?: string } | null)?.mode === 'manuel';

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    enabled: Boolean(isManual),
    staleTime: 0,
  });

  const manualMut = useMutation({
    mutationFn: (payload: {
      agent_id: number;
      action: 'argent' | 'forfait';
      statut: 'confirme' | 'echec';
      sms: string;
      montant_fcfa?: number;
    }) => campagnesApi.manualValidate(Number(id), payload),
    onSuccess: () => {
      toast.success('Enregistré', 'Validation manuelle enregistrée.');
      qc.invalidateQueries({ queryKey: ['campagne-live', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setManualModal(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

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

  const totalAgentsManuel = isManual
    ? (campagne?.total_agents || agentsData?.agents?.length || 0)
    : (campagne?.total_agents || 0);

  const txByAgentId = new Map<number, typeof transactions[number]>();
  transactions.forEach(t => { txByAgentId.set(t.agent_id, t); });

  const manualRows = (agentsData?.agents ?? [])
    .map(a => {
      const tx = txByAgentId.get(a.id);
      const statut = tx?.statut ?? 'en_attente';
      const montant = a.prix_cfa > 0 ? a.prix_cfa : 0;
      return { a, tx, statut, montant };
    })
    .filter(row => !todoOnly || row.statut === 'en_attente')
    .sort((r1, r2) => {
      const k1 = manualSort === 'quota' ? r1.a.quota_gb : r1.montant;
      const k2 = manualSort === 'quota' ? r2.a.quota_gb : r2.montant;
      const d = k1 - k2;
      return manualSortDir === 'asc' ? d : -d;
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
          <Button
            loading={lancerMut.isPending}
            onClick={() => setConfirmLancer(true)}
            disabled={isManual}
            title={isManual ? 'Mode manuel : lancement automatique désactivé' : undefined}
          >
            {isManual
              ? '🚫 Lancer auto (désactivé)'
              : (modeTest && agentsSelectionnes.length > 0
                ? `🧪 Tester avec ${agentsSelectionnes.length} agent(s)`
                : '🚀 Lancer le provisionnement')}
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

      {isManual && campagne.statut === 'brouillon' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <strong>Mode manuel.</strong> Le responsable effectue l'envoi/activation sur son téléphone, puis renseigne ici le statut et le SMS de confirmation.
          Le lancement automatique est désactivé.
        </div>
      )}

      {/* Checklist manuelle */}
      {isManual && (
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Traitement manuel — agent par agent</h2>
              <p className="text-xs text-gray-500 mt-0.5">Clique sur un agent, fais l'action Airtel Money sur le téléphone, puis colle le SMS complet.</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Progression</p>
              <p className="text-sm font-bold text-gray-900">{campagne.agents_ok + campagne.agents_echec} / {totalAgentsManuel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={todoOnly}
                onChange={e => setTodoOnly(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              À faire uniquement
            </label>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Tri</span>
              <select
                value={manualSort}
                onChange={e => setManualSort(e.target.value as 'quota' | 'montant')}
                className="px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="montant">Montant</option>
                <option value="quota">Quota</option>
              </select>
              <select
                value={manualSortDir}
                onChange={e => setManualSortDir(e.target.value as 'asc' | 'desc')}
                className="px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>

            <div className="ml-auto text-xs text-gray-500">
              {manualRows.length} agent(s)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Téléphone</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Quota</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Montant</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {manualRows.map(row => {
                  const a = row.a;
                  const tx = row.tx;
                  const statut = row.statut;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{a.prenom} {a.nom}</p>
                        <p className="text-xs text-gray-400">{a.role_label ?? ''}</p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-600">{fmtTelephone(a.telephone)}</span>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(a.telephone);
                                toast.success('Copié', 'Téléphone copié.');
                              } catch {
                                toast.error('Erreur', 'Impossible de copier.');
                              }
                            }}
                            className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-100"
                            title="Copier téléphone"
                          >
                            Copier
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-indigo-700">{a.quota_gb} GB</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        <div className="flex items-center justify-end gap-2">
                          <span>{a.prix_cfa > 0 ? a.prix_cfa.toLocaleString('fr-FR') + ' F' : '—'}</span>
                          {a.prix_cfa > 0 && (
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(String(a.prix_cfa));
                                  toast.success('Copié', 'Montant copié.');
                                } catch {
                                  toast.error('Erreur', 'Impossible de copier.');
                                }
                              }}
                              className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-100"
                              title="Copier montant"
                            >
                              Copier
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {statut === 'en_attente' ? (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">En attente</span>
                        ) : statut === 'confirme' ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Confirmé</span>
                        ) : (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Échec</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setManualModal({
                              agent_id: a.id,
                              agent_label: `${a.prenom} ${a.nom}`,
                              telephone: a.telephone,
                              action: 'argent',
                              statut: 'confirme',
                              sms: tx?.airtel_message ?? '',
                              montant_fcfa: a.prix_cfa,
                            })}
                            className="text-brand-600 hover:text-brand-800 text-xs font-medium px-2 py-1 rounded hover:bg-brand-50"
                          >
                            Valider (argent)
                          </button>
                          <button
                            onClick={() => setManualModal({
                              agent_id: a.id,
                              agent_label: `${a.prenom} ${a.nom}`,
                              telephone: a.telephone,
                              action: 'forfait',
                              statut: 'confirme',
                              sms: tx?.airtel_message ?? '',
                            })}
                            className="text-amber-700 hover:text-amber-900 text-xs font-medium px-2 py-1 rounded hover:bg-amber-50"
                          >
                            Valider (forfait)
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={manualModal !== null}
        onClose={() => setManualModal(null)}
        title={manualModal ? `Validation manuelle — ${manualModal.agent_label}` : 'Validation manuelle'}
      >
        {manualModal && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-700">
              <p><strong>Téléphone :</strong> {fmtTelephone(manualModal.telephone)}</p>
              <p><strong>Rappel :</strong> exécute l'action dans Airtel Money, puis colle le SMS complet.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={manualModal.action}
                  onChange={e => setManualModal(m => m ? ({ ...m, action: e.target.value as 'argent' | 'forfait' }) : m)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="argent">Envoi d'argent</option>
                  <option value="forfait">Activation forfait</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Statut</label>
                <select
                  value={manualModal.statut}
                  onChange={e => setManualModal(m => m ? ({ ...m, statut: e.target.value as 'confirme' | 'echec' }) : m)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="confirme">Confirmé</option>
                  <option value="echec">Échec</option>
                </select>
              </div>
            </div>

            {manualModal.action === 'argent' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Montant (FCFA)</label>
                <input
                  type="number"
                  value={manualModal.montant_fcfa ?? 0}
                  onChange={e => setManualModal(m => m ? ({ ...m, montant_fcfa: Number(e.target.value) }) : m)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">SMS complet (preuve) *</label>
              <textarea
                value={manualModal.sms}
                onChange={e => setManualModal(m => m ? ({ ...m, sms: e.target.value }) : m)}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Colle ici le SMS complet de confirmation Airtel Money"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setManualModal(null)}>Annuler</Button>
              <Button
                loading={manualMut.isPending}
                onClick={() => {
                  if (!manualModal.sms.trim()) { toast.warning('SMS requis', 'Collez le SMS complet pour preuve.'); return; }
                  manualMut.mutate({
                    agent_id: manualModal.agent_id,
                    action: manualModal.action,
                    statut: manualModal.statut,
                    sms: manualModal.sms,
                    montant_fcfa: manualModal.action === 'argent' ? manualModal.montant_fcfa : undefined,
                  });
                }}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
  const [form, setForm] = useState<{
    mois: string;
    budget_fcfa: number;
    compte_source: string;
    option_envoi: 'argent';
    mode: 'auto' | 'manuel';
  }>({
    mois: new Date().toISOString().slice(0, 7),
    budget_fcfa: 1500000,
    compte_source: '',
    option_envoi: 'argent' as const,
    mode: 'auto',
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Mode de campagne</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, mode: 'auto' }))}
              className={`p-3 rounded-xl border-2 text-left transition-all ${form.mode === 'auto' ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
            >
              <p className={`text-sm font-semibold ${form.mode === 'auto' ? 'text-brand-700' : 'text-gray-700'}`}>Automatique</p>
              <p className="text-xs text-gray-500 mt-0.5">L'app envoie via l'API Airtel Money</p>
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, mode: 'manuel' }))}
              className={`p-3 rounded-xl border-2 text-left transition-all ${form.mode === 'manuel' ? 'border-amber-500 bg-amber-50' : 'border-gray-200'}`}
            >
              <p className={`text-sm font-semibold ${form.mode === 'manuel' ? 'text-amber-800' : 'text-gray-700'}`}>Manuel</p>
              <p className="text-xs text-gray-500 mt-0.5">Le responsable exécute sur téléphone + colle le SMS</p>
            </button>
          </div>
        </div>

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
              <p className="text-sm font-semibold text-blue-900">Envoi via Airtel Money</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Chaque agent reçoit le montant FCFA correspondant à son forfait (issu du fichier Excel)
              </p>
            </div>
          </div>
        </div>

        {form.mode === 'manuel' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            <strong>Mode manuel activé :</strong> le bouton de lancement automatique sera désactivé.
            Vous aurez une checklist agent par agent pour marquer <strong>confirmé/échec</strong> et coller le <strong>SMS complet</strong>.
          </div>
        )}

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
