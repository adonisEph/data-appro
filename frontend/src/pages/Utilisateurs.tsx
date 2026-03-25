import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Card, Button, RoleBadge, Modal, Spinner, EmptyState } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import type { Responsable } from '../types';
import { fmtDateTime } from '../lib/utils';
import { rolesMetierApi } from '../lib/api';

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
  const [resetUser, setResetUser]         = useState<Responsable | null>(null);
  const [newPassword, setNewPassword]     = useState('');

  const [form, setForm] = useState({
    nom: '', prenom: '', telephone: '', email: '', password: '',
    role_label: '',
    quota_gb: 0,
    prix_cfa: 0,
    forfait_label: '',
    is_viewer: false,
    can_import_agents: true, can_launch_campagne: true,
    can_view_historique: true, can_manage_users: false,
  });

  const [droits, setDroits] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, refetchOnWindowFocus: true, staleTime: 0 });

  const { data: rolesData } = useQuery({
    queryKey: ['roles-metier'],
    queryFn: rolesMetierApi.list,
    staleTime: 60_000,
  });
  const rolesMetier = rolesData?.roles ?? [];
  const activeRolesMetier = rolesMetier.filter(r => r.actif !== 0);
  const inactiveLabels = new Set(rolesMetier.filter(r => r.actif === 0).map(r => r.label));

  const createMut = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilisateur créé', form.email);
      setCreateModal(false);
      setForm({ nom: '', prenom: '', telephone: '', email: '', password: '', role_label: '', quota_gb: 0, prix_cfa: 0, forfait_label: '',
        can_import_agents: true, can_launch_campagne: true, can_view_historique: true, can_manage_users: false, is_viewer: false });
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, boolean> }) =>
      usersApi.updateDroits(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Droits mis à jour');
      setEditUser(null);
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
    setEditUser(u);
  };

  const users = data?.users ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestion des responsables Data Appro</p>
        </div>
        <Button size="sm" onClick={() => setCreateModal(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Ajouter un utilisateur
        </Button>
      </div>

      {/* Alerte super admin */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
        <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <p className="text-sm text-amber-800">
          <strong>Zone Super Admin.</strong> Seul toi ({currentUser?.email}) as accès à cette page.
          Les utilisateurs que tu crées pourront se connecter avec les droits que tu définis.
        </p>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600"/></div>
        ) : users.length === 0 ? (
          <EmptyState title="Aucun utilisateur" description="Créez le premier responsable."
            action={<Button size="sm" onClick={() => setCreateModal(true)}>Ajouter</Button>}/>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Utilisateur</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Poste</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Droits</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => {
                  const isMe = u.email === currentUser?.email;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            u.is_super_admin ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
                          }`}>
                            {u.prenom?.[0]?.toUpperCase()}{u.nom?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {u.prenom} {u.nom}
                              {isMe && <span className="ml-2 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Vous</span>}
                              {u.is_super_admin && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Super Admin</span>}
                              {u.is_viewer && <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Lecteur</span>}
                            </p>
                            <p className="text-xs text-gray-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.role_label ? (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{u.role_label}</span>
                        ) : (
                          u.role && <RoleBadge role={u.role}/>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(DROITS_LABELS).map(([key, label]) => (
                            (u as unknown as Record<string, boolean>)[key] && (
                              <span key={key} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {label.split(' ')[0]}
                              </span>
                            )
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isMe && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(u)}
                              className="text-brand-600 hover:text-brand-800 text-xs font-medium px-2 py-1 rounded hover:bg-brand-50">
                              Droits
                            </button>
                            <button onClick={() => { setResetUser(u); setNewPassword(''); }}
                              className="text-gray-500 hover:text-gray-700 text-xs font-medium px-2 py-1 rounded hover:bg-gray-100">
                              MDP
                            </button>
                            <button onClick={() => setDeleteUser(u)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">
                              Désactiver
                            </button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prénom *</label>
              <input type="text" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
              <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone *</label>
            <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
              placeholder="05 XXX XXXX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"/>
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
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Poste dans l'entreprise</label>
              {rolesMetier.length > 0 ? (
                <select value={form.role_label} onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">-- Choisir un poste --</option>
                  {form.role_label && inactiveLabels.has(form.role_label) && (
                    <option value={form.role_label}>{form.role_label} (désactivé)</option>
                  )}
                  {activeRolesMetier.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                </select>
              ) : (
                <input type="text" value={form.role_label} onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                  placeholder="Ex: Ingénieur, Comptable…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
            <strong>Rôle métier ≠ Quota data.</strong> Le poste est indépendant du quota (GB) et du prix CFA.
            Vous pouvez assigner n'importe quel quota à n'importe quel poste.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quota (GB)</label>
              <input type="number" step="0.5" value={form.quota_gb} onChange={e => setForm(f => ({ ...f, quota_gb: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prix CFA</label>
              <input type="number" value={form.prix_cfa} onChange={e => setForm(f => ({ ...f, prix_cfa: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Label forfait (optionnel)</label>
            <input type="text" value={form.forfait_label} onChange={e => setForm(f => ({ ...f, forfait_label: e.target.value }))}
              placeholder="ex: 6.5GB, 14GB…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Type d'accès</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button" onClick={() => setForm(f => ({ ...f, is_viewer: false }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${!form.is_viewer ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
                <p className={`text-xs font-semibold ${!form.is_viewer ? 'text-brand-700' : 'text-gray-700'}`}>Responsable</p>
                <p className="text-xs text-gray-500 mt-0.5">Accès aux actions</p>
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, is_viewer: true }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${form.is_viewer ? 'border-gray-500 bg-gray-50' : 'border-gray-200'}`}>
                <p className={`text-xs font-semibold ${form.is_viewer ? 'text-gray-700' : 'text-gray-700'}`}>Lecteur</p>
                <p className="text-xs text-gray-500 mt-0.5">Consultation seule</p>
              </button>
            </div>
            {!form.is_viewer && (
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
            {form.is_viewer && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Le lecteur peut uniquement consulter les campagnes et filtrer les résultats. Aucune action possible.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Annuler</Button>
            <Button loading={createMut.isPending} onClick={() => {
              if (!form.nom || !form.telephone || !form.email || !form.password) {
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
          {Object.entries(DROITS_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={droits[key] ?? false}
                onChange={e => setDroits(d => ({ ...d, [key]: e.target.checked }))}
                className="w-4 h-4 text-brand-600 rounded"/>
              <span className="text-sm text-gray-700 font-medium">{label}</span>
            </label>
          ))}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Annuler</Button>
            <Button loading={updateMut.isPending}
              onClick={() => editUser && updateMut.mutate({ id: editUser.id, data: droits })}>
              Enregistrer les droits
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
    </div>
  );
}
