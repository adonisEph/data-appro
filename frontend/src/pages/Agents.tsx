import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi } from '../lib/api';
import { parseExcelFile, type AgentImportRow } from '../lib/excel';
import { useToast } from '../components/ui/Toast';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Card, Button, RoleBadge, Modal, Spinner, EmptyState } from '../components/ui';
import { ROLE_LABELS, ROLE_QUOTAS, type Role, type Agent } from '../types';
import { useAuth } from '../hooks/useAuth';
import { fmtTelephone } from '../lib/utils';

const ROLES: Role[] = ['technicien', 'responsable_junior', 'responsable_senior', 'manager'];

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
  const [search, setSearch]               = useState('');
  const [filterRole, setFilterRole]       = useState<Role | ''>('');

  // Form édition
  const [form, setForm] = useState<Partial<Agent>>({});

  const { data, isLoading } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.list });

  const importMut = useMutation({
    mutationFn: (agents: AgentImportRow[]) => agentsApi.import(agents),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success(`${res.imported} agents importés`, res.skipped > 0 ? `${res.skipped} ignoré(s)` : undefined);
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
      toast.success('Agent supprimé');
      setDeleteAgent(null);
    },
    onError: (err: Error) => toast.error('Erreur suppression', err.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { agents, errors, summary } = await parseExcelFile(file);
      setImportPreview(agents); setImportErrors(errors); setImportSummary(summary);
      setImportModal(true);
    } catch (err) {
      toast.error('Fichier invalide', err instanceof Error ? err.message : 'Erreur inconnue');
    }
    e.target.value = '';
  };

  const openEdit = (agent: Agent) => {
    setForm({ ...agent });
    setEditAgent(agent);
  };

  const handleSave = () => {
    if (!editAgent) return;
    updateMut.mutate({ id: editAgent.id, data: form });
  };

  const agents = data?.agents ?? [];
  const filtered = agents.filter(a => {
    const matchSearch = !search ||
      a.nom.toLowerCase().includes(search.toLowerCase()) ||
      a.prenom.toLowerCase().includes(search.toLowerCase()) ||
      a.telephone.includes(search);
    return matchSearch && (!filterRole || a.role === filterRole);
  });

  const roleCounts = agents.reduce((acc, a) => {
    acc[a.role] = (acc[a.role] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">{agents.length} agents dans le système</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange}/>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            Importer Excel
          </Button>
        </div>
      </div>

      {/* Rôles summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ROLES.map(role => (
          <Card key={role} className="p-4">
            <div className="flex items-center justify-between">
              <RoleBadge role={role} />
              <span className="text-xl font-bold text-gray-900">{roleCounts[role] ?? 0}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">{ROLE_QUOTAS[role]} GB · {ROLE_LABELS[role]}</p>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-3">
        <input type="search" placeholder="Rechercher nom, prénom, numéro…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value as Role | '')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Tous les rôles</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600"/></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucun agent" description="Importez votre fichier Excel."
            action={<Button size="sm" onClick={() => fileRef.current?.click()}>Importer Excel</Button>}/>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Téléphone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rôle</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Quota</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Prix CFA</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(agent => (
                  <tr key={agent.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-xs font-semibold shrink-0">
                          {agent.prenom?.[0]?.toUpperCase()}{agent.nom?.[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{agent.prenom} {agent.nom}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtTelephone(agent.telephone)}</td>
                    <td className="px-4 py-3"><RoleBadge role={agent.role}/></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{agent.quota_gb} GB</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {agent.prix_cfa > 0 ? agent.prix_cfa.toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(agent)}
                          className="text-brand-600 hover:text-brand-800 text-xs font-medium px-2 py-1 rounded hover:bg-brand-50 transition-colors">
                          Modifier
                        </button>
                        {isSuperAdmin && (
                          <button onClick={() => setDeleteAgent(agent)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
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
              <p className="text-xs text-gray-500">{filtered.length} agent{filtered.length > 1 ? 's' : ''}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Modal Édition Agent */}
      <Modal open={editAgent !== null} onClose={() => setEditAgent(null)} title="Modifier l'agent">
        {editAgent && (
          <div className="space-y-4">
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rôle</label>
                <select value={form.role ?? ''} onChange={e => {
                  const role = e.target.value as Role;
                  setForm(f => ({ ...f, role, quota_gb: ROLE_QUOTAS[role] }));
                }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quota (GB)</label>
                <input type="number" step="0.5" value={form.quota_gb ?? ''} onChange={e => setForm(f => ({ ...f, quota_gb: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prix CFA</label>
                <input type="number" value={form.prix_cfa ?? 0} onChange={e => setForm(f => ({ ...f, prix_cfa: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Forfait</label>
                <input type="text" value={form.forfait_label ?? ''} onChange={e => setForm(f => ({ ...f, forfait_label: e.target.value }))}
                  placeholder="ex: 6.5GB" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditAgent(null)}>Annuler</Button>
              <Button loading={updateMut.isPending} onClick={handleSave}>Enregistrer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Suppression */}
      <ConfirmModal
        open={deleteAgent !== null}
        onClose={() => setDeleteAgent(null)}
        onConfirm={() => deleteAgent && deleteMut.mutate(deleteAgent.id)}
        title="Supprimer l'agent"
        confirmVariant="danger"
        confirmLabel="Supprimer"
        loading={deleteMut.isPending}
        message={
          <p>Voulez-vous désactiver <strong>{deleteAgent?.prenom} {deleteAgent?.nom}</strong> ?
          L'historique de ses transactions sera conservé.</p>
        }
      />

      {/* Modal Import */}
      <Modal open={importModal} onClose={() => { setImportModal(false); setImportPreview(null); }} title="Prévisualisation import Excel">
        {importPreview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                ✓ {importPreview.length} valides
              </span>
              {importErrors.length > 0 && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">
                  ⚠ {importErrors.length} erreur(s)
                </span>
              )}
            </div>

            {importSummary && (
              <div className="grid grid-cols-2 gap-2">
                {ROLES.filter(r => (importSummary[r] ?? 0) > 0).map(role => (
                  <div key={role} className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between">
                    <span className="text-xs text-gray-600">{ROLE_LABELS[role]}</span>
                    <span className="text-sm font-bold">{importSummary[role]}</span>
                  </div>
                ))}
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-28 overflow-y-auto">
                {importErrors.map((e, i) => <p key={i} className="text-xs text-amber-800">{e}</p>)}
              </div>
            )}

            <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Numéro</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Forfait</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Prix CFA</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Rôle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importPreview.slice(0, 100).map((a, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono">{a.telephone}</td>
                      <td className="px-3 py-2 text-blue-700 font-semibold">{a.forfait_label}</td>
                      <td className="px-3 py-2 text-right">{a.prix_cfa > 0 ? a.prix_cfa.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2"><RoleBadge role={a.role}/></td>
                    </tr>
                  ))}
                  {importPreview.length > 100 && (
                    <tr><td colSpan={4} className="px-3 py-2 text-center text-gray-400">… et {importPreview.length - 100} autres</td></tr>
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
                Importer {importPreview.length} agents
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
