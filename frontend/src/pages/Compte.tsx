import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../lib/api';
import { Card, Button } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export default function ComptePage() {
  const toast = useToast();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [show, setShow] = useState(false);

  const mut = useMutation({
    mutationFn: () => authApi.changePassword(oldPwd, newPwd),
    onSuccess: () => {
      toast.success('Mot de passe', 'Mot de passe modifié.');
      setOldPwd('');
      setNewPwd('');
      setNewPwd2('');
    },
    onError: (err: Error) => toast.error('Erreur', err.message),
  });

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mon compte</h1>
        <p className="text-sm text-gray-500 mt-1">Modifier votre mot de passe</p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ancien mot de passe</label>
          <input
            type={show ? 'text' : 'password'}
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nouveau mot de passe</label>
          <input
            type={show ? 'text' : 'password'}
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-400 mt-1">Minimum 6 caractères.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmer nouveau mot de passe</label>
          <input
            type={show ? 'text' : 'password'}
            value={newPwd2}
            onChange={e => setNewPwd2(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          Afficher les mots de passe
        </label>

        <div className="flex justify-end">
          <Button
            loading={mut.isPending}
            onClick={() => {
              if (!oldPwd || !newPwd || !newPwd2) {
                toast.warning('Champs requis', 'Veuillez remplir tous les champs.');
                return;
              }
              if (newPwd !== newPwd2) {
                toast.warning('Confirmation', 'Les deux mots de passe ne correspondent pas.');
                return;
              }
              mut.mutate();
            }}
          >
            Enregistrer
          </Button>
        </div>
      </Card>
    </div>
  );
}
