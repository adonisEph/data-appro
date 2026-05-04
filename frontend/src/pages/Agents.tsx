import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi, rolesMetierApi, trackedAgentsApi } from '../lib/api';
import { parseExcelFile, type AgentImportRow } from '../lib/excel';
import * as XLSX from 'xlsx';
import { clsx } from 'clsx';
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
  const { isSuperAdmin, isViewer, user } = useAuth();

  const canImportAgents = isSuperAdmin || Boolean(user?.droits?.can_import_agents);
  const canCreateAgent = !isViewer && canImportAgents;

  const [trackedModal, setTrackedModal] = useState(false);
  const [trackedText, setTrackedText] = useState('');

  const [qualityModal, setQualityModal] = useState(false);
  const [qualityForceOpen, setQualityForceOpen] = useState(false);
  const [qualityReport, setQualityReport] = useState<null | {
    phone_duplicates: Array<{ telephone: string; agents: Array<{ id: number; nom: string; prenom: string; actif: number }> }>;
    name_duplicates: Array<{ nom: string; prenom: string; agents: Array<{ id: number; telephone: string; actif: number }> }>;
    invalid_phones: Array<{ id: number; nom: string; prenom: string; telephone: string; actif: number }>;
    summary: { phone_duplicates: number; name_duplicates: number; invalid_phones: number; total_agents: number };
  }>(null);

  const [importPreview, setImportPreview] = useState<AgentImportRow[] | null>(null);
  const [importErrors, setImportErrors]   = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);
  const [importModal, setImportModal]     = useState(false);
  const [editAgent, setEditAgent]         = useState<Agent | null>(null);
  const [createAgent, setCreateAgent]     = useState(false);
  const [deleteAgent, setDeleteAgent]     = useState<Agent | null>(null);
  const [form, setForm]                   = useState<Partial<Agent>>({});
  const [search, setSearch]               = useState('');
  const [filterRole, setFilterRole]       = useState('');
  const [filterQuotaGb, setFilterQuotaGb] = useState<number | null>(null);
  const [showAllQuotas, setShowAllQuotas] = useState(false);

  // Agents avec refetch auto
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: trackedData } = useQuery({
    queryKey: ['tracked-agents'],
    queryFn: trackedAgentsApi.list,
    enabled: isSuperAdmin,
    staleTime: 10_000,
  });

  const trackedSet = new Set<number>((trackedData?.tracked_agents ?? []).map(a => a.agent_id));

  const saveTrackedMut = useMutation({
    mutationFn: (agent_ids: number[]) => trackedAgentsApi.set(agent_ids),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tracked-agents'] });
      toast.success('Agents suivis', `${res.agent_ids.length} agent(s) suivi(s).`);
      setTrackedModal(false);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const createMut = useMutation({
    mutationFn: (data: Partial<Agent>) => agentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Agent créé');
      setCreateAgent(false);
      setForm({});
      setQualityForceOpen(false);
      qualityMut.mutate();
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const qualityMut = useMutation({
    mutationFn: () => agentsApi.qualityCheck(),
    onSuccess: (res) => {
      setQualityReport(res);
      const s = res?.summary;
      const hasIssues = Boolean(s && (s.phone_duplicates > 0 || s.invalid_phones > 0 || s.name_duplicates > 0));

      if (qualityForceOpen || hasIssues) {
        setQualityModal(true);
      }

      if (hasIssues) {
        toast.warning(
          'Contrôle qualité terminé',
          `${s.phone_duplicates} doublon(s) téléphone, ${s.invalid_phones} numéro(s) invalide(s), ${s.name_duplicates} doublon(s) nom/prénom.`
        );
      } else {
        toast.success('Contrôle qualité', 'Aucune anomalie détectée.');
      }

      setQualityForceOpen(false);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  // Rôles métier pour le select
  const { data: rolesData } = useQuery({
    queryKey: ['roles-metier'],
    queryFn: rolesMetierApi.list,
    staleTime: 60_000,
  });
  const rolesMetier = rolesData?.roles ?? [];
  const activeRolesMetier = rolesMetier.filter(r => r.actif !== 0);
  const inactiveLabels = new Set(rolesMetier.filter(r => r.actif === 0).map(r => r.label));

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
      setQualityForceOpen(false);
      qualityMut.mutate();
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => agentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['campagnes'] });
      qc.invalidateQueries({ queryKey: ['campagne-live'] });
      qc.invalidateQueries({ queryKey: ['campagne-eligible-agents'] });
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
  const openCreate = () => {
    setForm({
      nom: '',
      prenom: '',
      telephone: '',
      role: 'technicien',
      role_label: '',
      quota_gb: ROLE_QUOTAS['technicien'],
      prix_cfa: 0,
      forfait_label: '',
    });
    setCreateAgent(true);
  };

  const normalizeTel = (v: string) => String(v ?? '').replace(/\D+/g, '');

  const openTracked = () => {
    const trackedAgents = trackedData?.tracked_agents ?? [];
    if (trackedAgents.length > 0) {
      setTrackedText(trackedAgents.map(a => a.telephone).join('\n'));
    } else {
      setTrackedText('');
    }
    setTrackedModal(true);
  };

  const agents = data?.agents ?? [];
  const filtered = agents.filter(a => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      a.nom.toLowerCase().includes(s) || a.prenom.toLowerCase().includes(s) ||
      a.telephone.includes(search) || (a.role_label ?? '').toLowerCase().includes(s);
    const matchRole = !filterRole || a.role === filterRole || a.role_label === filterRole;
    const matchQuota = filterQuotaGb === null || a.quota_gb === filterQuotaGb;
    return matchSearch && matchRole && matchQuota;
  });

  const isDefaultAgentName = (nom: string, prenom: string) => {
    const n = (nom ?? '').trim().toLowerCase();
    const p = (prenom ?? '').trim().toLowerCase();
    if (!n) return true;
    if (n === 'agent') return true;
    if (/^agent_?\d+$/.test(n)) return true;
    if (/^agent\s*\d+$/.test(n)) return true;
    if (/^agent_?\d+$/.test(p)) return true;
    return false;
  };

  const displayed = [...filtered].sort((a, b) => {
    const da = isDefaultAgentName(a.nom, a.prenom) ? 1 : 0;
    const db = isDefaultAgentName(b.nom, b.prenom) ? 1 : 0;
    if (da !== db) return da - db;
    const an = `${a.nom} ${a.prenom}`.trim().toLowerCase();
    const bn = `${b.nom} ${b.prenom}`.trim().toLowerCase();
    return an.localeCompare(bn, 'fr');
  });

  const exportExcel = () => {
    const rows = displayed.map(a => ({
      ID: a.id,
      Prenom: a.prenom,
      Nom: a.nom,
      Telephone: a.telephone,
      Quota_GB: a.quota_gb,
      Prix_CFA: a.prix_cfa,
      Forfait: a.forfait_label ?? '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Agents');

    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    XLSX.writeFile(wb, `agents_${y}-${m}-${d}.xlsx`);
  };

  // Compteurs par quota
  const quotaGroups = agents.reduce((acc, a) => {
    const key = `${a.quota_gb}GB`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const budgetTotal = filtered.reduce((sum, a) => sum + (a.prix_cfa ?? 0), 0);
  const quotaEntries = Object.entries(quotaGroups).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
  const quotaEntriesShown = showAllQuotas ? quotaEntries : quotaEntries.slice(0, 4);

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange}/>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
          {isSuperAdmin && (
            <Button variant="secondary" size="sm" onClick={openTracked} className="w-full sm:w-auto">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">Agents suivis</span>
              <span className="sm:hidden">Suivis</span>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setQualityForceOpen(true); qualityMut.mutate(); }}
            disabled={qualityMut.isPending || (!isSuperAdmin && !isViewer)}
            title={!isSuperAdmin && !isViewer ? 'Réservé au superadmin' : undefined}
            className="w-full sm:w-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m9-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">Vérifier les doublons</span>
            <span className="sm:hidden">Doublons</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={exportExcel}
            disabled={filtered.length === 0 || isViewer || (!isSuperAdmin && !isViewer)}
            title={!isSuperAdmin && !isViewer ? 'Réservé au superadmin' : undefined}
            className="w-full sm:w-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Exporter Excel</span>
            <span className="sm:hidden">Export</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={isViewer || !canImportAgents}
            className="w-full sm:w-auto"
            title={!isViewer && !canImportAgents ? 'Droit "Importer des agents" requis' : undefined}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            <span className="hidden sm:inline">Importer Excel</span>
            <span className="sm:hidden">Import</span>
          </Button>
          {canCreateAgent && (
            <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter
            </Button>
          )}
        </div>
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
      <Card className="p-4 md:p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">Budget total agents</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900">
            {budgetTotal.toLocaleString('fr-FR')} FCFA
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-1">Somme des prix CFA de tous les agents actifs</p>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          {filterQuotaGb !== null ? (
            <span>
              Filtre quota: <span className="font-semibold text-gray-800">{filterQuotaGb} GB</span>
            </span>
          ) : (
            <span>Tous les quotas</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setFilterQuotaGb(null); setShowAllQuotas(false); }}
            disabled={filterQuotaGb === null}
          >
            Tout afficher
          </Button>
          {quotaEntries.length > 4 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAllQuotas(v => !v)}
            >
              {showAllQuotas ? 'Réduire' : 'Voir plus'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quotaEntriesShown.map(([quota, count]) => {
          const gb = parseFloat(String(quota).replace('GB', ''));
          const active = filterQuotaGb !== null && gb === filterQuotaGb;
          return (
          <button
            key={quota}
            type="button"
            onClick={() => setFilterQuotaGb(prev => (prev === gb ? null : gb))}
            className="text-left"
          >
            <Card className={clsx('p-3 md:p-4 transition-all', active ? 'ring-2 ring-indigo-500 bg-indigo-50/40' : 'hover:bg-gray-50')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{quota}</span>
              <span className="text-lg md:text-xl font-bold text-gray-900">{count}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">agents</p>
            </Card>
          </button>
          );
        })}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <input type="search" placeholder="Rechercher nom, numéro, poste…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 sm:w-44">
          <option value="">Tous les postes</option>
          {activeRolesMetier.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
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
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Quota data</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Prix CFA</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayed.map(agent => (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-xs font-semibold shrink-0">
                            {agent.prenom?.[0]?.toUpperCase()}{agent.nom?.[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate">{agent.prenom} {agent.nom}</span>
                            {isSuperAdmin && trackedSet.has(agent.id) && (
                              <span className="shrink-0 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">SUIVI</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtTelephone(agent.telephone)}</td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700">{agent.quota_gb} GB</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {agent.prix_cfa > 0 ? agent.prix_cfa.toLocaleString('fr-FR') + ' F' : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isViewer && (
                            <button onClick={() => openEdit(agent)} title="Modifier"
                              className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-800 text-xs font-medium px-2 py-1 rounded hover:bg-brand-50">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Modifier
                            </button>
                          )}
                          {isSuperAdmin && (
                            <button onClick={() => setDeleteAgent(agent)} title="Supprimer"
                              className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h14" />
                              </svg>
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
            {displayed.map(agent => (
              <Card key={agent.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-sm font-semibold shrink-0">
                      {agent.prenom?.[0]?.toUpperCase()}{agent.nom?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{agent.prenom} {agent.nom}</p>
                        {isSuperAdmin && trackedSet.has(agent.id) && (
                          <span className="shrink-0 text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">SUIVI</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono">{fmtTelephone(agent.telephone)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex gap-3 text-xs">
                    <span className="font-bold text-indigo-700">{agent.quota_gb} GB</span>
                    {agent.prix_cfa > 0 && <span className="text-gray-600">{agent.prix_cfa.toLocaleString()} F</span>}
                  </div>
                  <div className="flex gap-2">
                    {!isViewer && (
                      <button onClick={() => openEdit(agent)} title="Modifier"
                        className="inline-flex items-center gap-1.5 text-brand-600 text-xs font-medium px-2 py-1 rounded bg-brand-50">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Modifier
                      </button>
                    )}
                    {isSuperAdmin && (
                      <button onClick={() => setDeleteAgent(agent)} title="Supprimer"
                        className="inline-flex items-center gap-1.5 text-red-500 text-xs font-medium px-2 py-1 rounded bg-red-50">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h14" />
                        </svg>
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            <p className="text-xs text-gray-400 text-center py-2">{filtered.length} agent{filtered.length > 1 ? 's' : ''}</p>
          </div>
        </>
      )}

      {/* Modal Création */}
      <Modal open={createAgent} onClose={() => { setCreateAgent(false); setForm({}); }} title="Ajouter un nouvel agent">
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

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Rôle technique (interne)</label>
            <select
              value={(form.role as Role) ?? 'technicien'}
              onChange={e => {
                const role = e.target.value as Role;
                setForm(f => ({
                  ...f,
                  role,
                  quota_gb: f.quota_gb ?? ROLE_QUOTAS[role],
                }));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {ROLES.map(r => <option key={r} value={r}>{ROLE_INTERNAL_LABELS[r]}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Poste dans l'entreprise</label>
            {rolesMetier.length > 0 ? (
              <select value={form.role_label ?? ''} onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">-- Choisir un poste --</option>
                {activeRolesMetier.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
              </select>
            ) : (
              <input type="text" value={form.role_label ?? ''} onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                placeholder="Ex: Ingénieur Réseau, Comptable…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            )}
          </div>

          <hr className="border-gray-100"/>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Allocation data</p>
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
            <Button variant="secondary" onClick={() => { setCreateAgent(false); setForm({}); }}>Annuler</Button>
            <Button
              loading={createMut.isPending}
              onClick={() => {
                const nom = (form.nom ?? '').trim();
                const prenom = (form.prenom ?? '').trim();
                const telephone = (form.telephone ?? '').trim();
                if (!nom || !prenom || !telephone) {
                  toast.warning('Champs requis', 'Nom, prénom et téléphone sont obligatoires.');
                  return;
                }
                createMut.mutate(form);
              }}
            >
              Créer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={trackedModal} onClose={() => { setTrackedModal(false); }} title="Agents suivis (Super Admin)">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Collez une liste de téléphones (1 par ligne) ou d'IDs agent. Seuls les agents trouvés seront enregistrés.
          </p>
          <textarea
            value={trackedText}
            onChange={e => setTrackedText(e.target.value)}
            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="24206XXXXXXX\n24205XXXXXXX\n123"
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const trackedAgents = trackedData?.tracked_agents ?? [];
                setTrackedText(trackedAgents.map(a => a.telephone).join('\n'));
              }}
            >
              Réinitialiser
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setTrackedModal(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={() => {
                  const agents = (data?.agents ?? []) as Agent[];
                  const byTel = new Map<string, Agent>();
                  const byId = new Map<number, Agent>();
                  agents.forEach(a => {
                    byTel.set(normalizeTel(a.telephone), a);
                    byId.set(a.id, a);
                  });

                  const tokens = trackedText
                    .split(/\r?\n/)
                    .map(s => s.trim())
                    .filter(Boolean);

                  const ids: number[] = [];
                  for (const t of tokens) {
                    const maybeId = Number(t);
                    if (Number.isFinite(maybeId) && maybeId > 0 && byId.has(maybeId)) {
                      ids.push(maybeId);
                      continue;
                    }
                    const tel = normalizeTel(t);
                    const a = byTel.get(tel);
                    if (a) ids.push(a.id);
                  }

                  const uniq = Array.from(new Set(ids));
                  saveTrackedMut.mutate(uniq);
                }}
                disabled={saveTrackedMut.isPending}
              >
                {saveTrackedMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

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
                  {form.role_label && inactiveLabels.has(form.role_label) && (
                    <option value={form.role_label}>{form.role_label} (désactivé)</option>
                  )}
                  {activeRolesMetier.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
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

      <Modal open={qualityModal} onClose={() => setQualityModal(false)} title="Vérification doublons & qualité">
        <div className="space-y-4">
          <div className="text-xs text-gray-600">
            {qualityReport?.summary ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">Doublons téléphone</p>
                  <p className="text-sm font-bold text-gray-900">{qualityReport.summary.phone_duplicates}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">Numéros invalides</p>
                  <p className="text-sm font-bold text-gray-900">{qualityReport.summary.invalid_phones}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">Doublons nom/prénom</p>
                  <p className="text-sm font-bold text-gray-900">{qualityReport.summary.name_duplicates}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">Total agents</p>
                  <p className="text-sm font-bold text-gray-900">{qualityReport.summary.total_agents}</p>
                </div>
              </div>
            ) : (
              <p>Aucun rapport.</p>
            )}
          </div>

          {qualityReport?.phone_duplicates?.length ? (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Doublons téléphone</p>
              <div className="space-y-2">
                {qualityReport.phone_duplicates.map(d => (
                  <div key={d.telephone} className="border border-red-200 bg-red-50 rounded-lg p-3">
                    <p className="text-xs font-mono text-red-900">{d.telephone}</p>
                    <div className="mt-1 text-xs text-red-800">
                      {d.agents.map(a => (
                        <div key={a.id} className="flex items-center justify-between">
                          <span>#{a.id} — {a.prenom} {a.nom}</span>
                          <span className={a.actif ? 'text-green-700' : 'text-gray-500'}>{a.actif ? 'actif' : 'inactif'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {qualityReport?.invalid_phones?.length ? (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Numéros invalides</p>
              <div className="space-y-2">
                {qualityReport.invalid_phones.map(a => (
                  <div key={a.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-900">#{a.id} — {a.prenom} {a.nom}</span>
                      <span className={a.actif ? 'text-green-700 text-xs' : 'text-gray-500 text-xs'}>{a.actif ? 'actif' : 'inactif'}</span>
                    </div>
                    <p className="text-xs font-mono text-amber-900 mt-1">{a.telephone}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {qualityReport?.name_duplicates?.length ? (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Doublons nom/prénom (suspect)</p>
              <div className="space-y-2">
                {qualityReport.name_duplicates.map((d, idx) => (
                  <div key={`${d.nom}|${d.prenom}|${idx}`} className="border border-gray-200 bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-900">{d.prenom} {d.nom}</p>
                    <div className="mt-1 text-xs text-gray-700">
                      {d.agents.map(a => (
                        <div key={a.id} className="flex items-center justify-between">
                          <span>#{a.id} — {a.telephone}</span>
                          <span className={a.actif ? 'text-green-700' : 'text-gray-500'}>{a.actif ? 'actif' : 'inactif'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!qualityReport?.phone_duplicates?.length && !qualityReport?.invalid_phones?.length && !qualityReport?.name_duplicates?.length ? (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              Aucune anomalie détectée.
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setQualityModal(false)}>Fermer</Button>
          </div>
        </div>
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
