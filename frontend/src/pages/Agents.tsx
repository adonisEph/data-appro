import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi, rolesMetierApi } from '../lib/api';
import { parseExcelFile, type AgentImportRow } from '../lib/excel';
import { useToast } from '../components/ui/Toast';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Card, Button, Modal, Spinner, EmptyState } from '../components/ui';
import { ROLE_QUOTAS, type Role, type Agent } from '../types';
import { useAuth } from '../hooks/useAuth';
import { fmtTelephone } from '../lib/utils';

const ROLES: Role[] = ['technicien', 'responsable_junior', 'responsable_senior', 'manager'];
const ROLE_INTERNAL_LABELS: Record<Role, string> = {
  technicien: 'Technicien', responsable_junior: 'Resp. Junior',
  responsable_senior: 'Resp. Sénior', manager: 'Manager',
};

export default function AgentsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { isSuperAdmin } = useAuth();

  const [importPreview, setImportPreview] = useState<AgentImportRow[] | null>(null);
  const [importErrors, setImportErrors]   = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);
  const [importModal, setImportModal]     = useState(false);
  const [editAgent, setEditAgent]         = useState<Agent | null>(null);
  const [deleteAgent, setDeleteAgent]     = useState<Agent | null>(null);
  const [form, setForm]                   = useState<Partial<Agent>>({});
  const [search, setSearch]               = useState('');
  const [filterRole, setFilterRole]       = useState('');

  // Agents avec refetch auto
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Rôles métier pour le select
  const { data: rolesData } = useQuery({
    queryKey: ['roles-metier'],
    queryFn: rolesMetierApi.list,
    staleTime: 60_000,
  });
  const rolesMetier = rolesData?.roles ?? [];

  const importMut = useMutation({
    mutationFn: (agents: AgentImportRow[]) => agentsApi.import(agents),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success(
        `${res.imported} agents ${res.imported > 0 ? 'créés/mis à jour' : 'traités'}`,
        res.skipped > 0 ? `${res.skipped} ligne(s) ignorée(s)` : 'Import terminé'
      );
      setImportModal(false); setImportPreview(null); setImportSummary(null);
    },
    onError: (err: Error) => toast.error('Erreur import', err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Agent> }) => agentsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent mis à jour');
      setEditAgent(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => agentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Agent désactivé');
      setDeleteAgent(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const { agents, errors, summary } = await parseExcelFile(file);
      setImportPreview(agents); setImportErrors(errors); setImportSummary(summary); setImportModal(true);
    } catch (err) { toast.error('Fichier invalide', err instanceof Error ? err.message : 'Erreur'); }
    e.target.value = '';
  };

  const openEdit = (agent: Agent) => { setForm({ ...agent }); setEditAgent(agent); };

  const agents = data?.agents ?? [];
  const filtered = agents.filter(a => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      a.nom.toLowerCase().includes(s) || a.prenom.toLowerCase().includes(s) ||
      a.telephone.includes(search) || (a.role_label ?? '').toLowerCase().includes(s);
    const matchRole = !filterRole || a.role === filterRole || a.role_label === filterRole;
    return matchSearch && matchRole;
  });

  // Compteurs par quota
  const quotaGroups = agents.reduce((acc, a) => {
    const key = `${a.quota_gb}GB`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange}/>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Agents</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm text-gray-500">{agents.length} agents actifs</p>
            {lastUpdated && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"/>
                {new Date(lastUpdated).toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
          </svg>
          <span className="hidden sm:inline">Importer Excel</span>
          <span className="sm:hidden">Import</span>
        </Button>
      </div>

      {/* Info workflow rôle/quota */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 flex gap-2">
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <strong>Rôle métier ≠ Quota data.</strong> Le poste de l'agent (ex: Ingénieur, Comptable) est indépendant de son quota data (GB) et du prix CFA.
          Vous pouvez assigner n'importe quel quota à n'importe quel poste via le bouton "Modifier".
          L'import Excel définit les quotas depuis la colonne GB du fichier.
        </div>
      </div>

      {/* Résumé par quota */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(quotaGroups).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).slice(0, 4).map(([quota, count]) => (
          <Card key={quota} className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{quota}</span>
              <span className="text-lg md:text-xl font-bold text-gray-900">{count}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">agents</p>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <input type="search" placeholder="Rechercher nom, numéro, poste…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 sm:w-44">
          <option value="">Tous les postes</option>
          {rolesMetier.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
          {ROLES.map(r => <option key={r} value={r}>{ROLE_INTERNAL_LABELS[r]}</option>)}
        </select>
      </div>

      {/* Table desktop */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600"/></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Aucun agent" description="Importez votre fichier Excel."
          action={<Button size="sm" onClick={() => fileRef.current?.click()}>Importer Excel</Button>}/>
      ) : (
        <>
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Téléphone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Poste métier</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Quota data</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Prix CFA</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(agent => (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-xs font-semibold shrink-0">
                            {agent.prenom?.[0]?.toUpperCase()}{agent.nom?.[0]?.toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{agent.prenom} {agent.nom}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtTelephone(agent.telephone)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                          {agent.role_label ?? ROLE_INTERNAL_LABELS[agent.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700">{agent.quota_gb} GB</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {agent.prix_cfa > 0 ? agent.prix_cfa.toLocaleString('fr-FR') + ' F' : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(agent)}
                            className="text-brand-600 hover:text-brand-800 text-xs font-medium px-2 py-1 rounded hover:bg-brand-50">
                            Modifier
                          </button>
                          {isSuperAdmin && (
                            <button onClick={() => setDeleteAgent(agent)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <p className="text-xs text-gray-500">{filtered.length} agent{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}</p>
              </div>
            </div>
          </Card>

          {/* Cards mobile */}
          <div className="md:hidden space-y-2">
            {filtered.map(agent => (
              <Card key={agent.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-sm font-semibold shrink-0">
                      {agent.prenom?.[0]?.toUpperCase()}{agent.nom?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{agent.prenom} {agent.nom}</p>
                      <p className="text-xs text-gray-500 font-mono">{fmtTelephone(agent.telephone)}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full shrink-0">
                    {agent.role_label ?? ROLE_INTERNAL_LABELS[agent.role]}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex gap-3 text-xs">
                    <span className="font-bold text-indigo-700">{agent.quota_gb} GB</span>
                    {agent.prix_cfa > 0 && <span className="text-gray-600">{agent.prix_cfa.toLocaleString()} F</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(agent)} className="text-brand-600 text-xs font-medium px-2 py-1 rounded bg-brand-50">Modifier</button>
                    {isSuperAdmin && <button onClick={() => setDeleteAgent(agent)} className="text-red-500 text-xs font-medium px-2 py-1 rounded bg-red-50">Supprimer</button>}
                  </div>
                </div>
              </Card>
            ))}
            <p className="text-xs text-gray-400 text-center py-2">{filtered.length} agent{filtered.length > 1 ? 's' : ''}</p>
          </div>
        </>
      )}

      {/* Modal Édition — rôle et quota complètement dissociés */}
      <Modal open={editAgent !== null} onClose={() => setEditAgent(null)} title="Modifier l'agent">
        {editAgent && (
          <div className="space-y-4">
            {/* Identité */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prénom</label>
                <input type="text" value={form.prenom ?? ''} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
                <input type="text" value={form.nom ?? ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="tel" value={form.telephone ?? ''} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>

            <hr className="border-gray-100"/>

            {/* Poste métier — indépendant du quota */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Poste dans l'entreprise
                <span className="ml-1 text-gray-400 font-normal">(indépendant du quota)</span>
              </label>
              {rolesMetier.length > 0 ? (
                <select value={form.role_label ?? ''} onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">-- Choisir un poste --</option>
                  {rolesMetier.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                </select>
              ) : (
                <input type="text" value={form.role_label ?? ''} onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                  placeholder="Ex: Ingénieur Réseau, Comptable…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              )}
            </div>

            <hr className="border-gray-100"/>

            {/* Quota data — complètement indépendant */}
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">
                Allocation data
                <span className="ml-1 text-gray-400 font-normal">(indépendant du poste)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Quota (GB)</label>
                  <input type="number" step="0.5" value={form.quota_gb ?? ''} onChange={e => setForm(f => ({ ...f, quota_gb: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prix CFA</label>
                  <input type="number" value={form.prix_cfa ?? 0} onChange={e => setForm(f => ({ ...f, prix_cfa: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Label forfait</label>
                <input type="text" value={form.forfait_label ?? ''} onChange={e => setForm(f => ({ ...f, forfait_label: e.target.value }))}
                  placeholder="ex: 6.5GB, 14GB…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditAgent(null)}>Annuler</Button>
              <Button loading={updateMut.isPending} onClick={() => editAgent && updateMut.mutate({ id: editAgent.id, data: form })}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Suppression */}
      <ConfirmModal open={deleteAgent !== null} onClose={() => setDeleteAgent(null)}
        onConfirm={() => deleteAgent && deleteMut.mutate(deleteAgent.id)}
        title="Désactiver l'agent" confirmVariant="danger" confirmLabel="Désactiver" loading={deleteMut.isPending}
        message={<p>Désactiver <strong>{deleteAgent?.prenom} {deleteAgent?.nom}</strong> ? L'historique est conservé.</p>}
      />

      {/* Modal Import */}
      <Modal open={importModal} onClose={() => { setImportModal(false); setImportPreview(null); }} title="Prévisualisation import Excel">
        {importPreview && (
          <div className="space-y-4">
            {/* Info comportement import */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <strong>Comportement :</strong> Si un numéro existe déjà → <strong>mise à jour</strong>.
              Si le numéro est nouveau → <strong>création</strong>. La base existante n'est pas effacée.
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">✓ {importPreview.length} agents</span>
              {importErrors.length > 0 && <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">⚠ {importErrors.length} erreur(s)</span>}
            </div>

            {importSummary && Object.keys(importSummary).length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(importSummary).filter(([,v]) => v > 0).map(([role, count]) => (
                  <div key={role} className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between">
                    <span className="text-xs text-gray-600">{role}</span>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                ))}
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-28 overflow-y-auto">
                {importErrors.map((e, i) => <p key={i} className="text-xs text-amber-800">{e}</p>)}
              </div>
            )}

            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Numéro</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Forfait</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Prix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importPreview.slice(0, 100).map((a, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono">{a.telephone}</td>
                      <td className="px-3 py-2 font-bold text-indigo-700">{a.forfait_label} — {a.quota_gb} GB</td>
                      <td className="px-3 py-2 text-right">{a.prix_cfa > 0 ? `${a.prix_cfa.toLocaleString()} F` : '—'}</td>
                    </tr>
                  ))}
                  {importPreview.length > 100 && (
                    <tr><td colSpan={3} className="px-3 py-2 text-center text-gray-400">… et {importPreview.length - 100} autres</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {importPreview.some(a => a.prix_cfa > 0) && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex justify-between">
                <span className="text-sm text-indigo-700 font-medium">Budget total estimé</span>
                <span className="text-lg font-bold text-indigo-900">
                  {importPreview.reduce((s, a) => s + a.prix_cfa, 0).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setImportModal(false)}>Annuler</Button>
              <Button loading={importMut.isPending} onClick={() => importMut.mutate(importPreview)} disabled={importPreview.length === 0}>
                Importer / Mettre à jour {importPreview.length} agents
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
