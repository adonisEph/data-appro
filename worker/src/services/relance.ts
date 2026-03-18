// ============================================================
// Service Relance — Retenter les transactions en échec
// ============================================================

import type { Env } from '../types/index.js';
import { MONTANTS_FCFA } from '../types/index.js';
import type { Transaction } from '../types/index.js';
import { envoyerArgent, genTransactionId, isAirtelSuccess } from './airtel.js';

export interface RelanceResult {
  transaction_id: number;
  agent_id: number;
  telephone: string;
  statut: 'confirme' | 'echec';
  message: string;
}

export async function relancerEchecs(env: Env, campagneId: number): Promise<RelanceResult[]> {
  const { results: echecs } = await env.DB.prepare(
    `SELECT t.*, a.role, a.prix_cfa as agent_prix_cfa
     FROM transactions t JOIN agents a ON a.id = t.agent_id
     WHERE t.campagne_id = ? AND t.statut = 'echec' AND t.nb_tentatives < 3`
  ).bind(campagneId).all<Transaction & { role: string; agent_prix_cfa: number }>();

  if (echecs.length === 0) return [];

  const results: RelanceResult[] = [];

  for (const tx of echecs) {
    const newTxId = genTransactionId(tx.agent_id, campagneId);
    const role = tx.role as keyof typeof MONTANTS_FCFA;

    // Montant : priorité au prix_cfa de l'agent, sinon fallback par rôle
    const montant = (tx.agent_prix_cfa > 0 ? tx.agent_prix_cfa : tx.montant_fcfa)
      ?? MONTANTS_FCFA[role]
      ?? 0;

    try {
      await env.DB.prepare(
        `UPDATE transactions SET nb_tentatives = nb_tentatives + 1, statut = 'en_attente' WHERE id = ?`
      ).bind(tx.id).run();

      const airtelRes = await envoyerArgent(
        env, tx.telephone, montant,
        `RELANCE-${campagneId}-${tx.agent_id}`,
        newTxId
      );

      const success  = isAirtelSuccess(airtelRes);
      const newStatut = success ? 'confirme' : 'echec';
      const airtelTx  = airtelRes.data?.transaction;

      await env.DB.prepare(
        `UPDATE transactions
         SET statut = ?, airtel_transaction_id = ?, airtel_reference = ?,
             airtel_status = ?, airtel_message = ?, airtel_raw_response = ?,
             confirme_le = CASE WHEN ? = 'confirme' THEN datetime('now') ELSE confirme_le END
         WHERE id = ?`
      ).bind(
        newStatut,
        airtelTx?.airtel_money_id ?? airtelTx?.id ?? null,
        airtelTx?.reference_id ?? newTxId,
        airtelTx?.status ?? null,
        airtelTx?.message ?? airtelRes.status?.message ?? null,
        JSON.stringify(airtelRes),
        newStatut, tx.id
      ).run();

      if (success) {
        await env.DB.prepare(
          `UPDATE campagnes SET agents_ok = agents_ok + 1, agents_echec = MAX(0, agents_echec - 1) WHERE id = ?`
        ).bind(campagneId).run();
      }

      await env.DB.prepare(
        `INSERT INTO audit_logs (campagne_id, agent_id, action, details) VALUES (?, ?, ?, ?)`
      ).bind(
        campagneId, tx.agent_id,
        'RELANCE_' + newStatut.toUpperCase(),
        JSON.stringify({ old_tx: tx.id, new_tx: newTxId, tentative: tx.nb_tentatives + 1 })
      ).run();

      results.push({
        transaction_id: tx.id, agent_id: tx.agent_id, telephone: tx.telephone,
        statut: success ? 'confirme' : 'echec',
        message: airtelTx?.message ?? airtelRes.status?.message ?? (success ? 'OK' : 'Échec'),
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      await env.DB.prepare(`UPDATE transactions SET statut = 'echec', airtel_message = ? WHERE id = ?`)
        .bind(msg, tx.id).run();
      results.push({ transaction_id: tx.id, agent_id: tx.agent_id, telephone: tx.telephone, statut: 'echec', message: msg });
    }

    await new Promise(r => setTimeout(r, 400));
  }

  return results;
}
