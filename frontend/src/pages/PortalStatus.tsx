import { useState, useEffect, useRef } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [reclamationOpen, setReclamationOpen] = useState(false);
  const [recSujet, setRecSujet] = useState('');
  const [recMessage, setRecMessage] = useState('');
  const [recSending, setRecSending] = useState(false);
  const [recSent, setRecSent] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const logout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_agent');
    navigate('/portal');
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const submitReclamation = async () => {
    if (!recSujet.trim() || !recMessage.trim()) return;
    const token = localStorage.getItem('portal_token');
    if (!token) return;
    setRecSending(true);
    try {
      await portalApi.reclamation(token, recSujet.trim(), recMessage.trim());
      setRecSent(true);
      setRecSujet('');
      setRecMessage('');
      setTimeout(() => { setReclamationOpen(false); setRecSent(false); }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setRecSending(false);
    }
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-indigo-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
          <p className="text-sm text-white/70">Chargement de votre statut…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-indigo-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button onClick={logout} className="text-brand-600 text-sm font-medium hover:text-brand-800">Retour à la connexion</button>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 text-white relative">
        <div className="absolute inset-0 opacity-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full blur-3xl"/>
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-white rounded-full blur-3xl"/>
        </div>
        <div className="relative max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-lg font-bold">{agent.prenom?.[0]?.toUpperCase()}{agent.nom?.[0]?.toUpperCase()}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">{agent.prenom} {agent.nom}</h1>
                <p className="text-sm text-white/80">{agent.telephone}</p>
              </div>
            </div>

            {/* Menu déroulant */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl flex items-center justify-center transition-colors"
                aria-label="Menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v.01M12 12v.01M12 19v.01"/>
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden">
                  <button
                    onClick={() => { setMenuOpen(false); setReclamationOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-amber-50 transition-colors text-left"
                  >
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z"/></svg>
                    Réclamation
                  </button>
                  <div className="border-t border-gray-100 my-1"/>
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
          {agent.role_label && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">{agent.role_label}</span>
              <span className="text-xs bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">{agent.quota_gb} GB</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Statut de la dernière campagne */}
        <div className="bg-white rounded-3xl shadow-lg shadow-gray-200/50 border border-gray-100/50 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-brand-500 rounded-full"/>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Dernière campagne</h2>
          </div>

          {derniere_campagne ? (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-2xl font-black text-gray-900 capitalize">{derniere_campagne.mois}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {derniere_campagne.option_envoi === 'argent' ? '💰 Envoi d\'argent' : '📱 Envoi de forfait'}
                    {derniere_campagne.lance_le && ` · Lancée le ${new Date(derniere_campagne.lance_le).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                {!isConfirme && !isEchec && (
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                    derniere_campagne.statut === 'terminee' ? 'bg-green-100 text-green-700' :
                    derniere_campagne.statut === 'en_cours' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {derniere_campagne.statut === 'en_cours' ? 'En cours' : derniere_campagne.statut === 'terminee' ? 'Terminée' : 'Brouillon'}
                  </span>
                )}
              </div>

              {/* Statut de la transaction */}
              {transaction ? (
                <div className={`rounded-2xl p-5 ${isConfirme ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300' : isEchec ? 'bg-gradient-to-br from-red-50 to-rose-50 border-2 border-red-300' : 'bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-200'}`}>
                  <div className="flex items-center gap-4">
                    {/* Icône */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                      isConfirme ? 'bg-green-500 shadow-green-500/30' : isEchec ? 'bg-red-500 shadow-red-500/30' : 'bg-gray-400 shadow-gray-400/30'
                    }`}>
                      {isConfirme ? (
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isEchec ? (
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <svg className="w-8 h-8 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-xl font-black ${isConfirme ? 'text-green-700' : isEchec ? 'text-red-700' : 'text-gray-700'}`}>
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
                    <div className="mt-4 bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z"/></svg>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Message de confirmation</p>
                      </div>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{transaction.airtel_message}</p>
                      {transaction.airtel_reference && (
                        <p className="text-[10px] text-gray-400 mt-2 font-mono">Réf: {transaction.airtel_reference}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className={`rounded-2xl p-5 border-2 ${
                  derniere_campagne.statut === 'en_cours'
                    ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300'
                    : 'bg-gray-50 border-dashed border-gray-200'
                }`}>
                  {derniere_campagne.statut === 'en_cours' ? (
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg bg-amber-500 shadow-amber-500/30">
                        <span className="text-2xl">⏳</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xl font-black text-amber-700">En attente</p>
                        <p className="text-sm text-gray-600 mt-0.5">Votre approvisionnement est en cours de traitement. Veuillez patienter.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">Vous n'avez pas été inclus dans cette campagne.</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center">
              <p className="text-sm text-gray-500">Aucune campagne n'a été lancée pour le moment.</p>
            </div>
          )}
        </div>

        {/* Historique récent */}
        {historique_recent.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg shadow-gray-200/50 border border-gray-100/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 bg-indigo-500 rounded-full"/>
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Historique récent</h2>
            </div>
            <div className="space-y-2">
              {historique_recent.map(tx => (
                <div key={tx.campagne_id} className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 capitalize">{tx.mois}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
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

        {/* Info + PWA */}
        <div className="text-center pt-2 space-y-2">
          {canInstall && (
            <button
              onClick={install}
              disabled={isInstalling}
              className="inline-flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-full transition-colors"
            >
              {isInstalling ? 'Installation…' : '📱 Installer l\'application'}
            </button>
          )}
          <p className="text-xs text-gray-400">
            Pour toute question, contactez votre responsable.
          </p>
        </div>
      </div>

      {/* Modal Réclamation */}
      {reclamationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReclamationOpen(false)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z"/></svg>
                  </div>
                  <h2 className="text-lg font-bold text-white">Réclamation</h2>
                </div>
                <button onClick={() => setReclamationOpen(false)} className="text-white/80 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {recSent ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">Réclamation envoyée !</p>
                  <p className="text-xs text-gray-500 mt-1">Votre responsable a été notifié.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500">Remontez une information relative à vos datas : quota insuffisant, changement de numéro, ou tout autre signalement.</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Sujet *</label>
                    <select
                      value={recSujet}
                      onChange={e => setRecSujet(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">— Choisir —</option>
                      <option value="Quota insuffisant">Quota insuffisant</option>
                      <option value="Changement de numéro">Changement de numéro</option>
                      <option value="Forfait non reçu">Forfait non reçu</option>
                      <option value="Argent non reçu">Argent non reçu</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Message *</label>
                    <textarea
                      value={recMessage}
                      onChange={e => setRecMessage(e.target.value)}
                      rows={4}
                      placeholder="Décrivez votre situation…"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                    />
                  </div>
                  <button
                    onClick={submitReclamation}
                    disabled={!recSujet.trim() || !recMessage.trim() || recSending}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {recSending ? 'Envoi…' : 'Envoyer la réclamation'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
