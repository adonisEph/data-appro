import { Spinner, ProgressBar } from './index';
import type { Campagne } from '../../types';
import { fmtPct } from '../../lib/utils';

interface LiveBannerProps {
  campagne: Campagne;
  confirmes: number;
  echecs: number;
  enAttente: number;
}

export function LiveBanner({ campagne, confirmes, echecs, enAttente }: LiveBannerProps) {
  if (campagne.statut !== 'en_cours') return null;

  const total = campagne.total_agents;
  const traites = confirmes + echecs;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Spinner size="sm" className="text-blue-600" />
          <span className="text-sm font-semibold text-blue-900">
            Provisionnement en cours…
          </span>
        </div>
        <span className="text-sm font-bold text-blue-700">
          {fmtPct(traites, total)}
        </span>
      </div>

      <ProgressBar value={traites} max={total || 1} color="indigo" />

      <div className="grid grid-cols-3 gap-3 mt-3 text-center">
        <div className="bg-white rounded-lg py-2">
          <p className="text-lg font-bold text-green-600">{confirmes}</p>
          <p className="text-xs text-gray-500">Confirmés</p>
        </div>
        <div className="bg-white rounded-lg py-2">
          <p className="text-lg font-bold text-amber-600">{enAttente}</p>
          <p className="text-xs text-gray-500">En attente</p>
        </div>
        <div className="bg-white rounded-lg py-2">
          <p className={`text-lg font-bold ${echecs > 0 ? 'text-red-600' : 'text-gray-400'}`}>{echecs}</p>
          <p className="text-xs text-gray-500">Échecs</p>
        </div>
      </div>

      <p className="text-xs text-blue-600 text-center mt-2 animate-pulse">
        Rafraîchissement automatique toutes les 3 secondes
      </p>
    </div>
  );
}
