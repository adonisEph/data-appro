import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../lib/api';
import { usePWA } from '../hooks/usePWA';

interface PortalStatus {
  agent: { id: number; nom: string; prenom: string; telephone: string; quota_gb: number; role_label: string | null };
  derniere_campagne: { id: number; mois: string; statut: string; option_envoi: string; lance_le: string | null; termine_le: string | null } | null;
  transaction: { statut: string; option_used: string; montant_fcfa: number | null; airtel_message: string | null; airtel_reference: string | null; tente_le: string; confirme_le: string | null; nb_tentatives: number } | null;
  historique_recent: Array<{ campagne_id: number; mois: string; statut: string; option_used: string; montant_fcfa: number | null; airtel_message: string | null; confirme_le: string | null }>;
}

const STATUT_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  envoye: 'Envoyé',
  confirme: 'Confirmé',
  echec: 'Échec',
  double_detected: 'Double détecté',
};

const STATUT_COLORS: Record<string, string> = {
  en_attente: 'bg-gray-100 text-gray-700',
  envoye: 'bg-blue-100 text-blue-700',
  confirme: 'bg-green-100 text-green-700',
  echec: 'bg-red-100 text-red-700',
  double_detected: 'bg-orange-100 text-orange-700',
};

export default function PortalStatus() {
  const navigate = useNavigate();
  const { canInstall, isInstalling, install } = usePWA();
  const [data, setData] = useState<PortalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const logout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_agent');
    navigate('/portal');
  };

  useEffect(() => {
    const token = localStorage.getItem('portal_token');
    if (!token) { navigate('/portal'); return; }
    portalApi.status(token)
      .then(setData)
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Erreur');
        if (err instanceof Error && err.message.includes('expirée')) {
          logout();
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">Chargement de votre statut…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button onClick={logout} className="text-brand-600 text-sm font-medium">Retour à la connexion</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { agent, derniere_campagne, transaction, historique_recent } = data;
  const txStatut = transaction?.statut;
  const isConfirme = txStatut === 'confirme';
  const isEchec = txStatut === 'echec';
  const isEnAttente = !transaction || txStatut === 'en_attente';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 to-indigo-700 text-white">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{agent.prenom} {agent.nom}</h1>
              <p className="text-sm text-brand-100">{agent.telephone}</p>
            </div>
            <button onClick={logout} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">
              Déconnexion
            </button>
          </div>
          {agent.role_label && (
            <p className="text-xs text-brand-200 mt-2">{agent.role_label} · {agent.quota_gb} GB</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Statut de la dernière campagne */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Dernière campagne</h2>

          {derniere_campagne ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">{derniere_campagne.mois}</p>
                  <p className="text-xs text-gray-500">
                    {derniere_campagne.option_envoi === 'argent' ? 'Envoi d\'argent' : 'Envoi de forfait'}
                    {derniere_campagne.lance_le && ` · Lancée le ${new Date(derniere_campagne.lance_le).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  derniere_campagne.statut === 'terminee' ? 'bg-green-100 text-green-700' :
                  derniere_campagne.statut === 'en_cours' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {derniere_campagne.statut}
                </span>
              </div>

              {/* Statut de la transaction */}
              {transaction ? (
                <div className={`rounded-xl p-5 ${isConfirme ? 'bg-green-50 border-2 border-green-200' : isEchec ? 'bg-red-50 border-2 border-red-200' : 'bg-gray-50 border-2 border-gray-200'}`}>
                  <div className="flex items-center gap-4">
                    {/* Icône */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                      isConfirme ? 'bg-green-500' : isEchec ? 'bg-red-500' : 'bg-gray-400'
                    }`}>
                      {isConfirme ? (
                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isEchec ? (
                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <svg className="w-7 h-7 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-lg font-bold ${isConfirme ? 'text-green-700' : isEchec ? 'text-red-700' : 'text-gray-700'}`}>
                        {isConfirme ? 'Reçu ✓' : isEchec ? 'Échec' : isEnAttente ? 'En attente' : STATUT_LABELS[txStatut ?? ''] ?? txStatut}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {transaction.option_used === 'argent'
                          ? `Argent: ${transaction.montant_fcfa ? transaction.montant_fcfa.toLocaleString('fr-FR') + ' FCFA' : '—'}`
                          : `Forfait: ${agent.quota_gb} GB`}
                      </p>
                      {transaction.confirme_le && (
                        <p className="text-xs text-gray-400 mt-1">Confirmé le {new Date(transaction.confirme_le).toLocaleString('fr-FR')}</p>
                      )}
                    </div>
                  </div>

                  {/* Message Airtel */}
                  {transaction.airtel_message && (
                    <div className="mt-4 bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Message de confirmation</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{transaction.airtel_message}</p>
                      {transaction.airtel_reference && (
                        <p className="text-[10px] text-gray-400 mt-2">Référence: {transaction.airtel_reference}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-5 text-center">
                  <p className="text-sm text-gray-500">Aucune transaction pour cette campagne. Vous n'êtes peut-être pas inclus dans cette campagne.</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-5 text-center">
              <p className="text-sm text-gray-500">Aucune campagne n'a été lancée pour le moment.</p>
            </div>
          )}
        </div>

        {/* Historique récent */}
        {historique_recent.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Historique récent</h2>
            <div className="space-y-2">
              {historique_recent.map(tx => (
                <div key={tx.campagne_id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tx.mois}</p>
                    <p className="text-xs text-gray-500">
                      {tx.option_used === 'argent'
                        ? `${tx.montant_fcfa ? tx.montant_fcfa.toLocaleString('fr-FR') + ' FCFA' : '—'}`
                        : `Forfait ${agent.quota_gb} GB`}
                      {tx.confirme_le && ` · ${new Date(tx.confirme_le).toLocaleDateString('fr-FR')}`}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUT_COLORS[tx.statut] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUT_LABELS[tx.statut] ?? tx.statut}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-center pt-2 space-y-2">
          {canInstall && (
            <button
              onClick={install}
              disabled={isInstalling}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {isInstalling ? 'Installation…' : '📱 Installer l\'application'}
            </button>
          )}
          <p className="text-xs text-gray-400">
            Pour toute question, contactez votre responsable.
          </p>
        </div>
      </div>
    </div>
  );
}
