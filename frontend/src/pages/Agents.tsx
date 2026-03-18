import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi } from '../lib/api';
import { parseExcelFile, type AgentImportRow } from '../lib/excel';
import { useToast } from '../components/ui/Toast';
import {
  Card, Button, RoleBadge, Modal, Spinner, EmptyState,
} from '../components/ui';
import { ROLE_LABELS, ROLE_QUOTAS, type Role } from '../types';

export default function AgentsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const [importPreview, setImportPreview] = useState<AgentImportRow[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importModal, setImportModal] = useState(false);
  const [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<Role | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
  });

  const importMut = useMutation({
    mutationFn: (agents: AgentImportRow[]) => agentsApi.import(agents),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success(
        `${res.imported} agents importés`,
        res.skipped > 0 ? `${res.skipped} ligne(s) ignorée(s)` : undefined
      );
      setImportModal(false);
      setImportPreview(null);
      setImportSummary(null);
    },
    onError: (err: Error) => toast.error('Erreur import', err.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { agents, errors, summary } = await parseExcelFile(file);
      setImportPreview(agents);
      setImportErrors(errors);
      setImportSummary(summary);
      setImportModal(true);
    } catch (err) {
      toast.error('Fichier invalide', err instanceof Error ? err.message : 'Erreur inconnue');
    }
    e.target.value = '';
  };

  const agents = data?.agents ?? [];
  const filtered = agents.filter(a => {
    const match = search === '' ||
      a.nom.toLowerCase().includes(search.toLowerCase()) ||
      a.prenom.toLowerCase().includes(search.toLowerCase()) ||
      a.telephone.includes(search);
    const roleMatch = filterRole === '' || a.role === filterRole;
    return match && roleMatch;
  });

  // Compteurs par rôle
  const roleCounts = agents.reduce((acc, a) => {
    acc[a.role] = (acc[a.role] ?? 0) + 1;
    return acc;
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
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            Importer Excel
          </Button>
        </div>
      </div>

      {/* Rôles summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(ROLE_LABELS) as Role[]).map(role => (
          <Card key={role} className="p-4">
            <div className="flex items-center justify-between">
              <RoleBadge role={role} />
              <span className="text-xl font-bold text-gray-900">{roleCounts[role] ?? 0}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">{ROLE_QUOTAS[role]} GB / mois</p>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-3">
        <input
          type="search"
          placeholder="Rechercher nom, prénom, numéro…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as Role | '')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Tous les rôles</option>
          {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([r, l]) => (
            <option key={r} value={r}>{l}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" className="text-brand-600" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Aucun agent trouvé"
            description="Importez votre fichier Excel pour commencer."
            action={
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                Importer Excel
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nom</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Téléphone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rôle</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quota</th>
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
                        <span className="font-medium text-gray-900">
                          {agent.prenom} {agent.nom}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{agent.telephone}</td>
                    <td className="px-4 py-3"><RoleBadge role={agent.role} /></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{agent.quota_gb} GB</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <p className="text-xs text-gray-500">{filtered.length} agent{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Modal import preview */}
      <Modal open={importModal} onClose={() => { setImportModal(false); setImportPreview(null); setImportSummary(null); }} title="Prévisualisation import Excel">
        {importPreview && (
          <div className="space-y-4">
            {/* Compteurs */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                ✓ {importPreview.length} agents valides
              </span>
              {importErrors.length > 0 && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">
                  ⚠ {importErrors.length} erreur(s)
                </span>
              )}
            </div>

            {/* Résumé par forfait */}
            {importSummary && (
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['technicien',         '6.5 GB'],
                  ['responsable_junior', '14 GB'],
                  ['responsable_senior', '30 GB'],
                  ['manager',            '45 GB'],
                ] as [string, string][]).filter(([r]) => (importSummary[r] ?? 0) > 0).map(([role, label]) => (
                  <div key={role} className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between items-center">
                    <span className="text-xs text-gray-600">{label}</span>
                    <span className="text-sm font-bold text-gray-900">{importSummary[role]} agents</span>
                  </div>
                ))}
              </div>
            )}

            {/* Erreurs */}
            {importErrors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-28 overflow-y-auto">
                {importErrors.map((e, i) => (
                  <p key={i} className="text-xs text-amber-800">{e}</p>
                ))}
              </div>
            )}

            {/* Table aperçu */}
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Numéro</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Forfait</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Prix CFA</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Rôle déduit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importPreview.slice(0, 100).map((a, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono">{a.telephone}</td>
                      <td className="px-3 py-2 font-semibold text-blue-700">{a.forfait_label}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {a.prix_cfa > 0 ? a.prix_cfa.toLocaleString('fr-FR') : '—'}
                      </td>
                      <td className="px-3 py-2"><RoleBadge role={a.role} /></td>
                    </tr>
                  ))}
                  {importPreview.length > 100 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-gray-400 text-center">
                        … et {importPreview.length - 100} autres
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Budget total calculé */}
            {importPreview.some(a => a.prix_cfa > 0) && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-indigo-700 font-medium">Budget total estimé</span>
                <span className="text-lg font-bold text-indigo-900">
                  {importPreview.reduce((s, a) => s + a.prix_cfa, 0).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => { setImportModal(false); setImportPreview(null); setImportSummary(null); }}>
                Annuler
              </Button>
              <Button
                loading={importMut.isPending}
                onClick={() => importMut.mutate(importPreview)}
                disabled={importPreview.length === 0}
              >
                Importer {importPreview.length} agents
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
