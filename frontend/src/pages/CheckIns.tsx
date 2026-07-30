import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '../lib/api';
import { Card, Spinner, EmptyState } from '../components/ui';
import { fmtDateTime } from '../lib/utils';

export default function CheckInsPage() {
  const [limit, setLimit] = useState(100);

  const { data, isLoading } = useQuery({
    queryKey: ['portal-check-ins', limit],
    queryFn: () => portalApi.checkIns(limit),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const checkIns = data?.check_ins ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connexions Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Agents qui se sont connectés au portail pour vérifier leur statut</p>
        </div>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value={50}>50 derniers</option>
          <option value={100}>100 derniers</option>
          <option value={200}>200 derniers</option>
          <option value={500}>500 derniers</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : checkIns.length === 0 ? (
        <EmptyState
          title="Aucune connexion"
          description="Aucun agent ne s'est encore connecté au portail."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Téléphone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Quota</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rôle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {checkIns.map(ci => (
                  <tr key={ci.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {ci.prenom?.[0]?.toUpperCase()}{ci.nom?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ci.prenom} {ci.nom}</p>
                          <p className="text-[10px] text-gray-400">ID: {ci.agent_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{ci.telephone}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {ci.quota_gb} GB
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{ci.role_label ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{ci.ip_address ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDateTime(ci.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
