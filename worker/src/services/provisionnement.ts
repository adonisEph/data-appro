// ============================================================
// Moteur de provisionnement — Envoi bulk vers 200 agents
// Option unique : envoi d'argent (Airtel CG n'a pas d'API bundle)
// ============================================================

import type { Env, Agent, Campagne } from '../types/index.js';
import { MONTANTS_FCFA } from '../types/index.js';
import { envoyerArgent, genTransactionId, normalizeMsisdn, isAirtelSuccess } from './airtel.js';

export interface ProvisionResult {
  agent_id: number;
  telephone: string;
  statut: 'confirme' | 'echec';
  transaction_id: string | null;
  airtel_id: string | null;
  message: string;
}

// --- Lance le provisionnement pour tous les agents actifs ---
export async function lancerCampagne(
  env: Env,
  campagne: Campagne,
  agents: Agent[]
): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];

  // Statut → en_cours
  await env.DB.prepare(
    `UPDATE campagnes SET statut = 'en_cours', lance_le = datetime('now'), total_agents = ? WHERE id = ?`
  ).bind(agents.length, campagne.id).run();

  // Traitement par batches de 10 (rate limiting Airtel)
  const BATCH = 10;
  for (let i = 0; i < agents.length; i += BATCH) {
    const batch = agents.slice(i, i + BATCH);

    const settled = await Promise.allSettled(
      batch.map(agent => provisionnerAgent(env, campagne, agent))
    );

    for (let j = 0; j < settled.length; j++) {
      const res = settled[j];
      const agent = batch[j];
      if (!agent || !res) continue;

      if (res.status === 'fulfilled') {
        results.push(res.value);
      } else {
        const msg = res.reason instanceof Error ? res.reason.message : 'Erreur inconnue';
        results.push({
          agent_id: agent.id, telephone: agent.telephone,
          statut: 'echec', transaction_id: null, airtel_id: null, message: msg,
        });
      }
    }

    // Pause entre batches pour respecter le rate limit Airtel
    if (i + BATCH < agents.length) await new Promise(r => setTimeout(r, 600));
  }

  // Mise à jour statut final
  const ok    = results.filter(r => r.statut === 'confirme').length;
  const echec = results.filter(r => r.statut === 'echec').length;
  const final = echec === 0 ? 'terminee' : ok === 0 ? 'annulee' : 'partielle';

  await env.DB.prepare(
    `UPDATE campagnes SET statut = ?, agents_ok = ?, agents_echec = ?, termine_le = datetime('now') WHERE id = ?`
  ).bind(final, ok, echec, campagne.id).run();

  return results;
}

// --- Provisionne un agent : envoi d'argent ─────────────────
async function provisionnerAgent(
  env: Env,
  campagne: Campagne,
  agent: Agent
): Promise<ProvisionResult> {
  const txId   = genTransactionId(agent.id, campagne.id);
  const msisdn = normalizeMsisdn(agent.telephone);

  // Anti-doublon : vérifier si déjà approvisionné cette campagne
  const existing = await env.DB.prepare(
    `SELECT id FROM transactions
     WHERE campagne_id = ? AND agent_id = ? AND statut IN ('envoye','confirme')
     LIMIT 1`
  ).bind(campagne.id, agent.id).first();

  if (existing) {
    return {
      agent_id: agent.id, telephone: agent.telephone,
      statut: 'echec', transaction_id: null, airtel_id: null,
      message: 'Doublon — déjà approvisionné cette campagne',
    };
  }

  // Montant : priorité au prix_cfa stocké sur l'agent (issu du fichier Excel)
  // Fallback sur le tableau MONTANTS_FCFA si pas défini
  const montant = agent.prix_cfa > 0
    ? agent.prix_cfa
    : (MONTANTS_FCFA[agent.role] ?? 0);

  if (montant === 0) {
    return {
      agent_id: agent.id, telephone: agent.telephone,
      statut: 'echec', transaction_id: txId, airtel_id: null,
      message: 'Montant FCFA non défini pour cet agent',
    };
  }

  // Créer la transaction en DB
  const insert = await env.DB.prepare(
    `INSERT INTO transactions (campagne_id, agent_id, telephone, montant_fcfa, option_used, statut)
     VALUES (?, ?, ?, ?, 'argent', 'en_attente') RETURNING id`
  ).bind(campagne.id, agent.id, msisdn, montant).first<{ id: number }>();

  if (!insert) throw new Error('Impossible de créer la transaction en base');

  try {
    const ref = `APPRO-${campagne.mois}-${agent.id}`;
    const airtelRes = await envoyerArgent(env, agent.telephone, montant, ref, txId);
    const success   = isAirtelSuccess(airtelRes);
    const airtelTx  = airtelRes.data?.transaction;
    const statutTx  = success ? 'confirme' : 'echec';

    await env.DB.prepare(
      `UPDATE transactions
       SET statut = ?, airtel_transaction_id = ?, airtel_reference = ?,
           airtel_status = ?, airtel_message = ?, airtel_raw_response = ?,
           confirme_le = CASE WHEN ? = 'confirme' THEN datetime('now') ELSE NULL END
       WHERE id = ?`
    ).bind(
      statutTx,
      airtelTx?.airtel_money_id ?? airtelTx?.id ?? null,
      airtelTx?.reference_id ?? txId,
      airtelTx?.status ?? airtelRes.status?.code ?? null,
      airtelTx?.message ?? airtelRes.status?.message ?? null,
      JSON.stringify(airtelRes),
      statutTx,
      insert.id
    ).run();

    // Log audit
    await logAudit(env, campagne.id, agent.id, 'PROVISION_' + statutTx.toUpperCase(), {
      tx_id: txId, montant, msisdn,
      airtel_id: airtelTx?.airtel_money_id ?? airtelTx?.id,
    });

    return {
      agent_id: agent.id, telephone: agent.telephone,
      statut: success ? 'confirme' : 'echec',
      transaction_id: txId,
      airtel_id: airtelTx?.airtel_money_id ?? airtelTx?.id ?? null,
      message: airtelTx?.message ?? airtelRes.status?.message ?? (success ? 'OK' : 'Échec'),
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await env.DB.prepare(
      `UPDATE transactions SET statut = 'echec', airtel_message = ? WHERE id = ?`
    ).bind(msg, insert.id).run();

    return {
      agent_id: agent.id, telephone: agent.telephone,
      statut: 'echec', transaction_id: txId, airtel_id: null, message: msg,
    };
  }
}

// ── Log d'audit ───────────────────────────────────────────────
async function logAudit(env: Env, campagneId: number, agentId: number, action: string, details: object) {
  await env.DB.prepare(
    `INSERT INTO audit_logs (campagne_id, agent_id, action, details) VALUES (?, ?, ?, ?)`
  ).bind(campagneId, agentId, action, JSON.stringify(details)).run();
}
