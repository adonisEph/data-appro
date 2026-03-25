// ============================================================
// Webhook Airtel Money — Réception des accusés de réception
// Airtel appelle ce endpoint après chaque transaction
// URL à déclarer sur https://developers.airtel.cg
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../types/index.js';

const webhookRouter = new Hono<{ Bindings: Env }>();

// ── Webhook principal ────────────────────────────────────────
// Airtel POST sur /api/webhooks/airtel avec le statut final
webhookRouter.post('/airtel', async c => {
  const raw = await c.req.text();
  let payload: AirtelWebhookPayload;

  try {
    payload = JSON.parse(raw) as AirtelWebhookPayload;
  } catch {
    console.error('[Webhook] Payload invalide:', raw);
    return c.json({ error: 'Payload invalide' }, 400);
  }

  // Validation signature (si Airtel fournit un header de signature)
  const sig = c.req.header('X-Airtel-Signature');
  if (sig) {
    const valid = await verifyWebhookSignature(raw, sig, c.env.AIRTEL_CLIENT_SECRET);
    if (!valid) {
      console.error('[Webhook] Signature invalide');
      return c.json({ error: 'Signature invalide' }, 401);
    }
  }

  // Extraction des champs
  const txId      = payload.transaction?.id ?? payload.data?.transaction?.id;
  const status    = payload.transaction?.status ?? payload.data?.transaction?.status;
  const message   = payload.message ?? payload.status?.message ?? '';
  const msisdn    = payload.subscriber?.msisdn ?? payload.data?.transaction?.msisdn;

  if (!txId) {
    console.warn('[Webhook] Pas de transaction ID dans le payload:', raw);
    return c.json({ ok: true }); // Répondre 200 quand même pour éviter les retries Airtel
  }

  // Retrouver la transaction en base via l'airtel_transaction_id OU la référence
  const tx = await c.env.DB.prepare(
    `SELECT id, statut, campagne_id, agent_id FROM transactions
     WHERE airtel_transaction_id = ? OR airtel_reference = ?
     LIMIT 1`
  ).bind(txId, txId).first<{ id: number; statut: string; campagne_id: number; agent_id: number }>();

  if (!tx) {
    // Peut arriver si le webhook arrive avant qu'on enregistre (race condition)
    console.warn('[Webhook] Transaction inconnue:', txId);
    return c.json({ ok: true });
  }

  // Ne pas re-traiter si déjà confirmé
  if (tx.statut === 'confirme') {
    return c.json({ ok: true, already: 'confirmed' });
  }

  const isSuccess = ['TS', 'SUCCESS', 'COMPLETED', '200'].includes(
    String(status).toUpperCase()
  );

  const newStatut = isSuccess ? 'confirme' : 'echec';

  // Mise à jour transaction
  await c.env.DB.prepare(
    `UPDATE transactions
     SET statut = ?,
         airtel_status = ?,
         airtel_message = ?,
         accuse_recu_le = datetime('now'),
         accuse_raw = ?,
         confirme_le = CASE WHEN ? = 'confirme' THEN datetime('now') ELSE confirme_le END
     WHERE id = ?`
  ).bind(newStatut, String(status), message, raw, newStatut, tx.id).run();

  // Mise à jour compteurs campagne
  if (isSuccess) {
    await c.env.DB.prepare(
      `UPDATE campagnes SET agents_ok = agents_ok + 1 WHERE id = ?`
    ).bind(tx.campagne_id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE campagnes SET agents_echec = agents_echec + 1 WHERE id = ?`
    ).bind(tx.campagne_id).run();
  }

  // Log audit
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (campagne_id, agent_id, action, details)
     VALUES (?, ?, ?, ?)`
  ).bind(
    tx.campagne_id,
    tx.agent_id,
    isSuccess ? 'WEBHOOK_CONFIRM' : 'WEBHOOK_ECHEC',
    JSON.stringify({ tx_airtel_id: txId, status, message, msisdn })
  ).run();

  console.log(`[Webhook] TX ${txId} → ${newStatut} (agent ${tx.agent_id})`);

  // Toujours répondre 200 à Airtel pour arrêter les retries
  return c.json({ ok: true, statut: newStatut });
});

// ── Webhook de test (Airtel sandbox) ────────────────────────
webhookRouter.post('/airtel/test', async c => {
  const body = await c.req.json();
  console.log('[Webhook TEST]', JSON.stringify(body));
  return c.json({ received: true, timestamp: new Date().toISOString() });
});

// ── Vérification signature HMAC-SHA256 ──────────────────────
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = hexToBytes(signature);

    const sigAb = new ArrayBuffer(sigBytes.byteLength);
    new Uint8Array(sigAb).set(sigBytes);

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigAb,
      encoder.encode(payload)
    );
    return valid;
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ── Types webhook Airtel ─────────────────────────────────────
interface AirtelWebhookPayload {
  transaction?: {
    id?: string;
    status?: string;
    msisdn?: string;
    amount?: string;
    currency?: string;
  };
  data?: {
    transaction?: {
      id?: string;
      status?: string;
      msisdn?: string;
    };
  };
  status?: {
    code?: string;
    message?: string;
    result_code?: string;
    success?: boolean;
  };
  subscriber?: {
    msisdn?: string;
    country?: string;
  };
  message?: string;
}

export default webhookRouter;
