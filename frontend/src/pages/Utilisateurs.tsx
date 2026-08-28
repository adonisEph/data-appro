import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi, usersApi, assistantAssignmentsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Card, Button, RoleBadge, Modal, Spinner, EmptyState } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import type { Responsable } from '../types';
import { fmtDateTime } from '../lib/utils';

const DROITS_LABELS = {
  can_import_agents:   'Importer des agents',
  can_launch_campagne: 'Lancer des campagnes',
  can_view_historique: 'Voir l\'historique',
  can_manage_users:    'Gérer les utilisateurs',
};

export default function UtilisateursPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [createModal, setCreateModal]     = useState(false);
  const [editUser, setEditUser]           = useState<Responsable | null>(null);
  const [deleteUser, setDeleteUser]       = useState<Responsable | null>(null);
  const [reactivateUser, setReactivateUser] = useState<Responsable | null>(null);
  const [forceLogoutUser, setForceLogoutUser] = useState<Responsable | null>(null);
  const [resetUser, setResetUser]         = useState<Responsable | null>(null);
  const [newPassword, setNewPassword]     = useState('');

  const [editEmail, setEditEmail] = useState('');

  const [form, setForm] = useState({
    agent_id: 0,
    email: '',
    password: '',
    is_viewer: false,
    can_provision: false,
    can_import_agents: true,
    can_launch_campagne: true,
    can_view_historique: true,
    can_manage_users: false,
  });

  const [agentSearch, setAgentSearch] = useState('');

  const [droits, setDroits] = useState<Record<string, boolean>>({});
  const [editIsViewer, setEditIsViewer] = useState(false);
  const [editIsAssistant, setEditIsAssistant] = useState(false);
  const [assignUser, setAssignUser] = useState<Responsable | null>(null);
  const [assignedAgentIds, setAssignedAgentIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, refetchOnWindowFocus: true, staleTime: 0 });

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const agents = agentsData?.agents ?? [];
  const selectedAgent = agents.find(a => a.id === form.agent_id) ?? null;

  const createMut = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur créé', form.email);
      setCreateModal(false);
      setForm({
        agent_id: 0,
        email: '',
        password: '',
        can_provision: false,
        can_import_agents: true,
        can_launch_campagne: true,
        can_view_historique: true,
        can_manage_users: false,
        is_viewer: false,
      });
      setAgentSearch('');
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof usersApi.updateDroits>[1] }) =>
      usersApi.updateDroits(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Droits mis à jour');
      setEditUser(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: number) => usersApi.updateDroits(id, { actif: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur réactivé');
      setReactivateUser(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const forceLogoutMut = useMutation({
    mutationFn: (id: number) => usersApi.forceLogout(id),
    onSuccess: (res) => {
      toast.success('Déconnexion forcée', res.had_active_session ? 'Session active supprimée' : 'Aucune session active');
      setForceLogoutUser(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur désactivé');
      setDeleteUser(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const resetMut = useMutation({
    mutationFn: ({ id, pwd }: { id: number; pwd: string }) => usersApi.resetPassword(id, pwd),
    onSuccess: () => {
      toast.success('Mot de passe réinitialisé');
      setResetUser(null); setNewPassword('');
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const openEdit = (u: Responsable) => {
    setDroits({
      can_import_agents:   u.can_import_agents,
      can_launch_campagne: u.can_launch_campagne,
      can_view_historique: u.can_view_historique,
      can_manage_users:    u.can_manage_users,
    });
    setEditIsViewer(Boolean(u.is_viewer));
    setEditIsAssistant(Boolean(u.can_provision) && !Boolean(u.is_super_admin) && !Boolean(u.is_viewer));
    setEditEmail(String(u.email ?? ''));
    setEditUser(u);
  };

  const openAssign = async (u: Responsable) => {
    setAssignUser(u);
    setAssignedAgentIds([]);
    try {
      const res = await assistantAssignmentsApi.list(u.id);
      setAssignedAgentIds((res.assignments ?? []).map(a => a.agent_id));
    } catch {
      // ignore
    }
  };

  const assignMut = useMutation({
    mutationFn: ({ assistantId, agentIds }: { assistantId: number; agentIds: number[] }) =>
      assistantAssignmentsApi.set(assistantId, agentIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Assignations mises à jour');
      setAssignUser(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const users = data?.users ?? [];

  const agentById = new Map<number, { id: number; nom: string; prenom: string; telephone: string }>(
    (agents ?? []).map(a => [a.id, { id: a.id, nom: a.nom, prenom: a.prenom, telephone: a.telephone }])
  );

  const activeCount = users.filter(u => u.actif).length;
  const superAdminCount = users.filter(u => u.is_super_admin).length;
  const assistantCount = users.filter(u => u.can_provision && !u.is_super_admin && !u.is_viewer).length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header avec gradient */}
      <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 rounded-2xl px-6 py-5 text-white shadow-lg shadow-indigo-200/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Utilisateurs</h1>
              <p className="text-sm text-white/70 mt-0.5">Gestion des responsables Data Appro</p>
            </div>
          </div>
          <button
            onClick={() => setCreateModal(true)}
            className="inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-white/90 font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Ajouter un utilisateur
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-gray-900">{users.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total utilisateurs</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-green-600">{activeCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Actifs</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-amber-600">{superAdminCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Super Admins</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-indigo-600">{assistantCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Assistants-Appro</p>
        </div>
      </div>

      {/* Alerte super admin */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-5 py-4 flex gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">Zone Super Admin</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Seul toi ({currentUser?.email}) as accès à cette page.
            Les utilisateurs que tu crées pourront se connecter avec les droits que tu définis.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600"/></div>
        ) : users.length === 0 ? (
          <EmptyState title="Aucun utilisateur" description="Créez le premier responsable."
            action={<Button size="sm" onClick={() => setCreateModal(true)}>Ajouter</Button>}/>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Utilisateur</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Agent lié</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Poste</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Droits</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="text-right px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => {
                  const isMe = u.email === currentUser?.email;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            u.is_super_admin ? 'bg-amber-100 text-amber-700' : u.is_viewer ? 'bg-gray-100 text-gray-600' : 'bg-brand-100 text-brand-700'
                          }`}>
                            {u.prenom?.[0]?.toUpperCase()}{u.nom?.[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-gray-900">
                                {u.prenom} {u.nom}
                              </p>
                              {isMe && <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Vous</span>}
                              {u.is_super_admin && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">★ Admin</span>}
                              {u.is_viewer && <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Lecteur</span>}
                              {u.can_provision && !u.is_super_admin && !u.is_viewer && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Assistant</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {typeof u.agent_id === 'number' ? (() => {
                          const a = agentById.get(u.agent_id);
                          if (!a) return <span className="text-xs text-gray-400">#{u.agent_id}</span>;
                          return (
                            <div className="text-xs">
                              <p className="text-gray-900 font-medium">{a.prenom} {a.nom}</p>
                              <p className="text-gray-500 font-mono">{a.telephone}</p>
                            </div>
                          );
                        })() : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {u.role_label ? (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">{u.role_label}</span>
                        ) : (
                          u.role && <RoleBadge role={u.role}/>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(DROITS_LABELS).map(([key, label]) => (
                            (u as unknown as Record<string, boolean>)[key] && (
                              <span key={key} className="text-[10px] font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                                {label.split(' ')[0]}
                              </span>
                            )
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.actif ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {!isMe && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => openEdit(u)}
                              className="text-brand-600 hover:text-brand-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
                              Droits
                            </button>
                            {u.can_provision && !u.is_super_admin && !u.is_viewer && (
                              <button onClick={() => openAssign(u)}
                                className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                                Assigner
                              </button>
                            )}
                            <button onClick={() => setForceLogoutUser(u)}
                              className="text-gray-500 hover:text-gray-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                              Déconnecter
                            </button>
                            <button onClick={() => { setResetUser(u); setNewPassword(''); }}
                              className="text-gray-500 hover:text-gray-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                              MDP
                            </button>
                            {u.actif ? (
                              <button onClick={() => setDeleteUser(u)}
                                className="text-red-500 hover:text-red-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                Désactiver
                              </button>
                            ) : (
                              <button onClick={() => setReactivateUser(u)}
                                className="text-green-600 hover:text-green-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-green-50 transition-colors">
                                Réactiver
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Création */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Nouvel utilisateur">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Agent *</label>
            <input
              type="search"
              value={agentSearch}
              onChange={e => {
                const v = e.target.value;
                setAgentSearch(v);
                const m = v.match(/\(#(\d+)\)$/);
                if (m?.[1]) setForm(f => ({ ...f, agent_id: Number(m[1]) }));
              }}
              list="agents-list"
              placeholder="Rechercher un agent (nom / téléphone)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <datalist id="agents-list">
              {agents.map(a => (
                <option key={a.id} value={`${a.prenom} ${a.nom} · ${a.telephone} (#${a.id})`} />
              ))}
            </datalist>
            {selectedAgent ? (
              <p className="text-xs text-gray-500 mt-1">
                Sélectionné: <span className="font-semibold">{selectedAgent.prenom} {selectedAgent.nom}</span> · {selectedAgent.telephone}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">Choisissez un agent existant pour le transformer en utilisateur.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mot de passe *</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
            <div />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Type d'accès</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button type="button" onClick={() => setForm(f => ({ ...f, is_viewer: false, can_provision: false }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${!form.is_viewer && !form.can_provision ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
                <p className={`text-xs font-semibold ${!form.is_viewer && !form.can_provision ? 'text-brand-700' : 'text-gray-700'}`}>Responsable</p>
                <p className="text-xs text-gray-500 mt-0.5">Accès aux actions</p>
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, is_viewer: false, can_provision: true }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${form.can_provision ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                <p className={`text-xs font-semibold ${form.can_provision ? 'text-indigo-700' : 'text-gray-700'}`}>Assistant-Appro</p>
                <p className="text-xs text-gray-500 mt-0.5">Approvisionnement</p>
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, is_viewer: true, can_provision: false }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${form.is_viewer ? 'border-gray-500 bg-gray-50' : 'border-gray-200'}`}>
                <p className={`text-xs font-semibold ${form.is_viewer ? 'text-gray-700' : 'text-gray-700'}`}>Lecteur</p>
                <p className="text-xs text-gray-500 mt-0.5">Consultation seule</p>
              </button>
            </div>
            {!form.is_viewer && !form.can_provision && (
              <div className="space-y-2">
                {Object.entries(DROITS_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox"
                      checked={(form as unknown as Record<string, boolean>)[key] ?? false}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                      className="w-4 h-4 text-brand-600 rounded"/>
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            )}
            {form.can_provision && (
              <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
                L'assistant-appro peut approvisionner les agents que vous lui assignez (Campagne, Historique, Mon Compte uniquement). Après création, cliquez sur « Assigner » pour sélectionner les agents.
              </p>
            )}
            {form.is_viewer && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Le lecteur peut uniquement consulter les campagnes et filtrer les résultats. Aucune action possible.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Annuler</Button>
            <Button loading={createMut.isPending} onClick={() => {
              if (!form.agent_id || !form.email || !form.password) {
                toast.warning('Champs requis', 'Remplissez tous les champs obligatoires (*)');
                return;
              }
              createMut.mutate();
            }}>
              Créer l'utilisateur
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Droits */}
      <Modal open={editUser !== null} onClose={() => setEditUser(null)} title={`Droits — ${editUser?.prenom} ${editUser?.nom}`}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={editEmail}
              onChange={e => setEditEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={editIsViewer}
              onChange={e => { setEditIsViewer(e.target.checked); if (e.target.checked) setEditIsAssistant(false); }}
              className="w-4 h-4 text-brand-600 rounded"
            />
            <span className="text-sm text-gray-700 font-medium">Compte lecteur (consultation seule)</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={editIsAssistant}
              onChange={e => { setEditIsAssistant(e.target.checked); if (e.target.checked) setEditIsViewer(false); }}
              className="w-4 h-4 text-brand-600 rounded"
            />
            <span className="text-sm text-gray-700 font-medium">Assistant-Appro (approvisionnement restreint)</span>
          </label>

          {Object.entries(DROITS_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={droits[key] ?? false}
                onChange={e => setDroits(d => ({ ...d, [key]: e.target.checked }))}
                disabled={editIsViewer || editIsAssistant}
                className="w-4 h-4 text-brand-600 rounded"/>
              <span className="text-sm text-gray-700 font-medium">{label}</span>
            </label>
          ))}

          {editIsViewer && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Ce compte est en mode <strong>Lecteur</strong>. Les droits d'action sont désactivés.
            </p>
          )}

          {editIsAssistant && (
            <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
              Ce compte est en mode <strong>Assistant-Appro</strong>. Accès limité à Campagne, Historique et Mon Compte. Utilisez le bouton « Assigner » pour sélectionner les agents à approvisionner.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Annuler</Button>
            <Button loading={updateMut.isPending}
              onClick={() => {
                if (!editUser) return;
                const emailChanged = editEmail.trim() && editEmail.trim() !== String(editUser.email ?? '');
                if (editIsViewer) {
                  updateMut.mutate({
                    id: editUser.id,
                    data: {
                      ...(emailChanged ? { email: editEmail.trim() } : {}),
                      is_viewer: true,
                      can_provision: false,
                      can_import_agents: false,
                      can_launch_campagne: false,
                      can_view_historique: true,
                      can_manage_users: false,
                    },
                  });
                  return;
                }
                if (editIsAssistant) {
                  updateMut.mutate({
                    id: editUser.id,
                    data: {
                      ...(emailChanged ? { email: editEmail.trim() } : {}),
                      is_viewer: false,
                      can_provision: true,
                      can_import_agents: false,
                      can_launch_campagne: false,
                      can_view_historique: true,
                      can_manage_users: false,
                    },
                  });
                  return;
                }
                updateMut.mutate({
                  id: editUser.id,
                  data: { ...droits, ...(emailChanged ? { email: editEmail.trim() } : {}), is_viewer: false, can_provision: false },
                });
              }}>
              Enregistrer les droits
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Assignation agents */}
      <Modal open={assignUser !== null} onClose={() => setAssignUser(null)} title={`Assigner des agents — ${assignUser?.prenom} ${assignUser?.nom}`}>
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Sélectionnez les agents que cet assistant pourra approvisionner. Il ne verra que ces agents dans les campagnes et l'historique.
          </p>

          {/* Filtres par quota */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600">Filtrer par quota :</span>
            {Array.from(new Set(agents.map(a => a.quota_gb))).sort((x, y) => y - x).map(q => {
              const count = agents.filter(a => a.quota_gb === q).length;
              const selectedCount = agents.filter(a => a.quota_gb === q && assignedAgentIds.includes(a.id)).length;
              const allSelected = selectedCount === count;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    const ids = agents.filter(a => a.quota_gb === q).map(a => a.id);
                    if (allSelected) {
                      setAssignedAgentIds(prev => prev.filter(id => !ids.includes(id)));
                    } else {
                      setAssignedAgentIds(prev => [...new Set([...prev, ...ids])]);
                    }
                  }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                    allSelected
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {q} GB ({selectedCount}/{count})
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setAssignedAgentIds(agents.map(a => a.id))}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Tout sélectionner
            </button>
            <button
              type="button"
              onClick={() => setAssignedAgentIds([])}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Tout désélectionner
            </button>
          </div>

          {/* Liste des agents groupés par quota */}
          <div className="max-h-80 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-2">
            {Array.from(new Set(agents.map(a => a.quota_gb))).sort((x, y) => y - x).map(q => (
              <div key={q}>
                <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-md sticky top-0">
                  <span className="text-xs font-bold text-gray-700">{q} GB</span>
                  <span className="text-[10px] text-gray-400">
                    ({agents.filter(a => a.quota_gb === q && assignedAgentIds.includes(a.id)).length}/{agents.filter(a => a.quota_gb === q).length})
                  </span>
                </div>
                {agents.filter(a => a.quota_gb === q).map(a => (
                  <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignedAgentIds.includes(a.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setAssignedAgentIds(prev => [...prev, a.id]);
                        } else {
                          setAssignedAgentIds(prev => prev.filter(id => id !== a.id));
                        }
                      }}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.prenom} {a.nom}</p>
                      <p className="text-xs text-gray-500">{a.telephone} · {a.quota_gb} GB · {a.prix_cfa > 0 ? a.prix_cfa.toLocaleString('fr-FR') + ' F' : '—'}</p>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">{assignedAgentIds.length} agent(s) sélectionné(s)</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setAssignUser(null)}>Annuler</Button>
            <Button loading={assignMut.isPending}
              onClick={() => {
                if (!assignUser) return;
                assignMut.mutate({ assistantId: assignUser.id, agentIds: assignedAgentIds });
              }}>
              Enregistrer les assignations
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Reset Password */}
      <Modal open={resetUser !== null} onClose={() => setResetUser(null)} title={`Réinitialiser MDP — ${resetUser?.prenom}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimum 6 caractères"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setResetUser(null)}>Annuler</Button>
            <Button loading={resetMut.isPending} onClick={() => {
              if (newPassword.length < 6) { toast.warning('Trop court', 'Minimum 6 caractères'); return; }
              resetMut.mutate({ id: resetUser!.id, pwd: newPassword });
            }}>
              Réinitialiser
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Désactivation */}
      <ConfirmModal
        open={deleteUser !== null}
        onClose={() => setDeleteUser(null)}
        onConfirm={() => deleteUser && deleteMut.mutate(deleteUser.id)}
        title="Désactiver l'utilisateur"
        confirmVariant="danger"
        confirmLabel="Désactiver"
        loading={deleteMut.isPending}
        message={`Voulez-vous désactiver ${deleteUser?.prenom} ${deleteUser?.nom} (${deleteUser?.email}) ? Il ne pourra plus se connecter.`}
      />

      {/* Confirm Réactivation */}
      <ConfirmModal
        open={reactivateUser !== null}
        onClose={() => setReactivateUser(null)}
        onConfirm={() => reactivateUser && reactivateMut.mutate(reactivateUser.id)}
        title="Réactiver l'utilisateur"
        confirmVariant="primary"
        confirmLabel="Réactiver"
        loading={reactivateMut.isPending}
        message={`Voulez-vous réactiver ${reactivateUser?.prenom} ${reactivateUser?.nom} (${reactivateUser?.email}) ? Il pourra se reconnecter.`}
      />

      {/* Confirm Force Logout */}
      <ConfirmModal
        open={forceLogoutUser !== null}
        onClose={() => setForceLogoutUser(null)}
        onConfirm={() => forceLogoutUser && forceLogoutMut.mutate(forceLogoutUser.id)}
        title="Déconnecter l'utilisateur"
        confirmVariant="primary"
        confirmLabel="Déconnecter"
        loading={forceLogoutMut.isPending}
        message={`Voulez-vous forcer la déconnexion de ${forceLogoutUser?.prenom} ${forceLogoutUser?.nom} (${forceLogoutUser?.email}) ?`}
      />
    </div>
  );
}
