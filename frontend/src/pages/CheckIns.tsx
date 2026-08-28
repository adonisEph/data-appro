import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '../lib/api';
import { Spinner } from '../components/ui';
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
  const uniqueAgents = new Set(checkIns.map(ci => ci.agent_id)).size;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header avec gradient */}
      <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 rounded-2xl px-6 py-5 text-white shadow-lg shadow-indigo-200/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 5v2m0 0v2m0-2h2m-2 0H9m7 4h2a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2h2m4-4h.01M9 9h.01" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Connexions Agents</h1>
              <p className="text-sm text-white/70 mt-0.5">Agents qui se sont connectés au portail pour vérifier leur statut</p>
            </div>
          </div>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white/15 backdrop-blur-sm text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
          >
            <option value={50} className="text-gray-900">50 derniers</option>
            <option value={100} className="text-gray-900">100 derniers</option>
            <option value={200} className="text-gray-900">200 derniers</option>
            <option value={500} className="text-gray-900">500 derniers</option>
          </select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-gray-900">{checkIns.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total connexions</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-indigo-600">{uniqueAgents}</p>
          <p className="text-xs text-gray-500 mt-0.5">Agents uniques</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-green-600">
            {checkIns.length > 0 ? fmtDateTime(checkIns[0].created_at).split(' ')[0] : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Dernière connexion</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : checkIns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 0v2m0-2h2m-2 0H9m7 4h2a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2h2m4-4h.01M9 9h.01" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">Aucune connexion</p>
          <p className="text-xs text-gray-400 mt-0.5">Aucun agent ne s'est encore connecté au portail.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Agent</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Téléphone</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Quota</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Rôle</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">IP</th>
                  <th className="text-left px-4 py-3.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {checkIns.map(ci => (
                  <tr key={ci.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-indigo-100 text-indigo-700">
                          {ci.prenom?.[0]?.toUpperCase()}{ci.nom?.[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{ci.prenom} {ci.nom}</p>
                          <p className="text-[10px] text-gray-400">ID: {ci.agent_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 font-mono">{ci.telephone}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
                        {ci.quota_gb} GB
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {ci.role_label ? (
                        <span className="text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{ci.role_label}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{ci.ip_address ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-700 font-medium">{fmtDateTime(ci.created_at).split(' ')[0]}</span>
                        <span className="text-[10px] text-gray-400">{fmtDateTime(ci.created_at).split(' ')[1] ?? ''}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
