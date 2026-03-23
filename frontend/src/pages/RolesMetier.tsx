import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesMetierApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Card, Button, Modal, Spinner, EmptyState } from '../components/ui';
import type { RoleMetier } from '../types';

export default function RolesMetierPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [createModal, setCreateModal] = useState(false);
  const [editRole, setEditRole]       = useState<RoleMetier | null>(null);
  const [deleteRole, setDeleteRole]   = useState<RoleMetier | null>(null);
  const [form, setForm] = useState({ label: '', description: '' });

  const { data, isLoading } = useQuery({ queryKey: ['roles-metier'], queryFn: rolesMetierApi.list });

  const createMut = useMutation({
    mutationFn: () => rolesMetierApi.create(form.label, form.description || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles-metier'] });
      toast.success('Rôle créé', form.label);
      setCreateModal(false); setForm({ label: '', description: '' });
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RoleMetier> }) => rolesMetierApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles-metier'] });
      toast.success('Rôle mis à jour'); setEditRole(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => rolesMetierApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles-metier'] });
      toast.success('Rôle désactivé'); setDeleteRole(null);
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  const roles = data?.roles ?? [];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Rôles métier</h1>
          <p className="text-sm text-gray-500 mt-0.5">Postes réels des agents — indépendants du quota data</p>
        </div>
        <Button size="sm" onClick={() => setCreateModal(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Nouveau rôle
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
        <strong>Note :</strong> Le rôle métier est le vrai poste de l'agent dans l'entreprise
        (ex: "Ingénieur Réseau", "Comptable", "Chef de projet"). Il est totalement indépendant
        du quota data qui lui est assigné.
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-brand-600"/></div>
      ) : roles.length === 0 ? (
        <EmptyState title="Aucun rôle" description="Créez les postes de votre entreprise."
          action={<Button size="sm" onClick={() => setCreateModal(true)}>Créer un rôle</Button>}/>
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {roles.map(role => (
              <div key={role.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{role.label}</p>
                  {role.description && <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditRole(role)}
                    className="text-brand-600 hover:text-brand-800 text-xs font-medium px-2 py-1 rounded hover:bg-brand-50">
                    Modifier
                  </button>
                  <button onClick={() => setDeleteRole(role)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal Créer */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Nouveau rôle métier">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Intitulé du poste *</label>
            <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="ex: Ingénieur Réseau, Comptable, Chef de projet…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description (optionnel)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="Brève description du poste…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"/>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Annuler</Button>
            <Button loading={createMut.isPending} onClick={() => {
              if (!form.label.trim()) { toast.warning('Champ requis', 'Saisissez l\'intitulé du poste'); return; }
              createMut.mutate();
            }}>Créer</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Éditer */}
      <Modal open={editRole !== null} onClose={() => setEditRole(null)} title="Modifier le rôle">
        {editRole && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Intitulé du poste *</label>
              <input type="text" defaultValue={editRole.label}
                id="edit-label"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea defaultValue={editRole.description ?? ''} id="edit-desc" rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"/>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditRole(null)}>Annuler</Button>
              <Button loading={updateMut.isPending} onClick={() => {
                const label = (document.getElementById('edit-label') as HTMLInputElement).value;
                const desc  = (document.getElementById('edit-desc') as HTMLTextAreaElement).value;
                updateMut.mutate({ id: editRole.id, data: { label, description: desc || null } });
              }}>Enregistrer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Suppression */}
      <ConfirmModal open={deleteRole !== null} onClose={() => setDeleteRole(null)}
        onConfirm={() => deleteRole && deleteMut.mutate(deleteRole.id)}
        title="Supprimer le rôle" confirmVariant="danger" confirmLabel="Supprimer" loading={deleteMut.isPending}
        message={`Désactiver le rôle "${deleteRole?.label}" ? Les agents ayant ce poste ne seront pas affectés.`}
      />
    </div>
  );
}
