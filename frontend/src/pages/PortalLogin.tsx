import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../lib/api';
import { usePWA } from '../hooks/usePWA';
import { APP_VERSION } from '../config/version';

export default function PortalLogin() {
  const navigate = useNavigate();
  const { canInstall, isInstalling, install } = usePWA();
  const [telephone, setTelephone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telephone.trim()) { setError('Veuillez saisir votre numéro de téléphone'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await portalApi.login(telephone.trim());
      localStorage.setItem('portal_token', res.token);
      localStorage.setItem('portal_agent', JSON.stringify(res.agent));
      navigate('/portal/status');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion échouée');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl shadow-2xl mb-4">
            <svg className="w-12 h-12 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Data Appro</h1>
          <p className="text-sm text-white/60 mt-1.5">Espace Agent — Vérifier mon forfait</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-7 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Connexion</h2>
            <p className="text-xs text-gray-500 mt-1">Saisissez votre numéro de téléphone présent dans la flotte pour vérifier votre statut.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Numéro de téléphone *</label>
              <input
                type="tel"
                value={telephone}
                onChange={e => setTelephone(e.target.value)}
                placeholder="Ex: 06 123 45 67"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Connexion…' : 'Vérifier mon statut'}
            </button>
          </form>

          <div className="text-center pt-2">
            {canInstall && (
              <button
                onClick={install}
                disabled={isInstalling}
                className="inline-flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-full transition-colors"
              >
                {isInstalling ? 'Installation…' : '📱 Installer l\'application'}
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-indigo-300 text-center mt-3 font-mono">v{APP_VERSION}</p>
      </div>
    </div>
  );
}
