// ============================================================
// Routes API — Hono Router
// ============================================================

import { Hono } from 'hono';
import type { Env, Role } from '../types/index.js';
import { ROLE_QUOTAS } from '../types/index.js';
import { authMiddleware, generateJWT } from '../middleware/auth.js';
import { lancerCampagne } from '../services/provisionnement.js';

type Variables = { user: { sub: string; email: string; agent_id: number } };
type AppEnv = { Bindings: Env; Variables: Variables };

const api = new Hono<AppEnv>();

// ── Santé ──────────────────────────────────────────────────
api.get('/health', c => c.json({ ok: true, service: 'data-appro-worker', ts: new Date().toISOString() }));

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════

api.post('/auth/login', async c => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: 'email et password requis' }, 400);

  const resp = await c.env.DB.prepare(
    `SELECT r.id, r.agent_id, r.email, r.password_hash, a.nom, a.prenom
     FROM responsables r JOIN agents a ON a.id = r.agent_id
     WHERE r.email = ? AND r.actif = 1`
  ).bind(email).first<{ id: number; agent_id: number; email: string; password_hash: string; nom: string; prenom: string }>();

  if (!resp) return c.json({ error: 'Identifiants invalides' }, 401);

  // Vérification du hash bcrypt-like (SHA-256 simple pour CF Workers)
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + resp.id));
  const hash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

  if (hash !== resp.password_hash) return c.json({ error: 'Identifiants invalides' }, 401);

  const token = await generateJWT(c.env.JWT_SECRET, {
    sub: String(resp.id),
    email: resp.email,
    agent_id: resp.agent_id,
  });

  return c.json({ token, user: { nom: resp.nom, prenom: resp.prenom, email: resp.email } });
});

// ══════════════════════════════════════════════════════════
// AGENTS (protégé)
// ══════════════════════════════════════════════════════════

const agentsRouter = new Hono<AppEnv>();
agentsRouter.use('*', authMiddleware);

// Lister tous les agents
agentsRouter.get('/', async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM agents WHERE actif = 1 ORDER BY nom, prenom`
  ).all();
  return c.json({ agents: results, total: results.length });
});

// Importer depuis JSON (payload converti depuis Excel côté frontend)
agentsRouter.post('/import', async c => {
  const { agents } = await c.req.json<{
    agents: Array<{
      nom: string;
      prenom: string;
      telephone: string;
      role: Role;
      quota_gb?: number;
      prix_cfa?: number;
      forfait_label?: string;
    }>
  }>();

  if (!Array.isArray(agents) || agents.length === 0) {
    return c.json({ error: 'Tableau agents vide ou invalide' }, 400);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const agent of agents) {
    if (!agent.nom || !agent.telephone || !agent.role) {
      errors.push(`Ligne invalide: ${JSON.stringify(agent)}`);
      skipped++;
      continue;
    }

    const quota = agent.quota_gb ?? ROLE_QUOTAS[agent.role];
    if (!quota) {
      errors.push(`Rôle inconnu: ${agent.role}`);
      skipped++;
      continue;
    }

    try {
      await c.env.DB.prepare(
        `INSERT INTO agents (nom, prenom, telephone, role, quota_gb, forfait_label, prix_cfa)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(telephone) DO UPDATE SET
           nom = excluded.nom, prenom = excluded.prenom,
           role = excluded.role, quota_gb = excluded.quota_gb,
           forfait_label = excluded.forfait_label,
           prix_cfa = excluded.prix_cfa,
           updated_at = datetime('now')`
      ).bind(
        agent.nom, agent.prenom ?? '', agent.telephone,
        agent.role, quota,
        agent.forfait_label ?? null,
        agent.prix_cfa ?? 0
      ).run();
      imported++;
    } catch (err) {
      errors.push(`Erreur ${agent.telephone}: ${err instanceof Error ? err.message : 'inconnue'}`);
      skipped++;
    }
  }

  return c.json({ imported, skipped, errors, total: agents.length });
});

// Modifier un agent
agentsRouter.put('/:id', async c => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ nom?: string; prenom?: string; telephone?: string; role?: Role; actif?: number }>();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.nom)       { updates.push('nom = ?');       values.push(body.nom); }
  if (body.prenom)    { updates.push('prenom = ?');     values.push(body.prenom); }
  if (body.telephone) { updates.push('telephone = ?');  values.push(body.telephone); }
  if (body.role)      {
    updates.push('role = ?', 'quota_gb = ?');
    values.push(body.role, ROLE_QUOTAS[body.role]);
  }
  if (body.actif !== undefined) { updates.push('actif = ?'); values.push(body.actif); }

  if (updates.length === 0) return c.json({ error: 'Aucun champ à modifier' }, 400);
  updates.push("updated_at = datetime('now')");
  values.push(id);

  await c.env.DB.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

api.route('/agents', agentsRouter);

// ══════════════════════════════════════════════════════════
// CAMPAGNES (protégé)
// ══════════════════════════════════════════════════════════

const campagnesRouter = new Hono<AppEnv>();
campagnesRouter.use('*', authMiddleware);

// Lister les campagnes
campagnesRouter.get('/', async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, r.email as responsable_email,
            a.nom || ' ' || a.prenom as responsable_nom
     FROM campagnes c
     JOIN responsables r ON r.id = c.responsable_id
     JOIN agents a ON a.id = r.agent_id
     ORDER BY c.mois DESC`
  ).all();
  return c.json({ campagnes: results });
});

// Créer une campagne
campagnesRouter.post('/', async c => {
  const user = c.get('user');
  const { mois, budget_fcfa, compte_source, option_envoi } = await c.req.json<{
    mois: string; budget_fcfa: number; compte_source: string; option_envoi: 'argent';
  }>();

  if (!mois || !budget_fcfa || !compte_source) {
    return c.json({ error: 'mois, budget_fcfa, compte_source requis' }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO campagnes (mois, budget_fcfa, compte_source, responsable_id, option_envoi)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`
  ).bind(mois, budget_fcfa, compte_source, Number(user.sub), option_envoi ?? 'argent')
   .first<{ id: number }>();

  return c.json({ ok: true, campagne_id: result?.id });
});

// Détail d'une campagne + ses transactions
campagnesRouter.get('/:id', async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT * FROM campagnes WHERE id = ?`).bind(id).first();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);

  const { results: transactions } = await c.env.DB.prepare(
    `SELECT t.*, a.nom, a.prenom, a.role
     FROM transactions t JOIN agents a ON a.id = t.agent_id
     WHERE t.campagne_id = ?
     ORDER BY t.tente_le DESC`
  ).bind(id).all();

  return c.json({ campagne, transactions });
});

// Lancer une campagne → déclenche le provisionnement bulk
campagnesRouter.post('/:id/lancer', async c => {
  const id = Number(c.req.param('id'));

  const campagne = await c.env.DB.prepare(`SELECT * FROM campagnes WHERE id = ?`)
    .bind(id).first<import('../types/index.js').Campagne>();

  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  if (campagne.statut === 'en_cours') return c.json({ error: 'Campagne déjà en cours' }, 409);
  if (campagne.statut === 'terminee') return c.json({ error: 'Campagne déjà terminée' }, 409);

  const { results: agents } = await c.env.DB.prepare(
    `SELECT * FROM agents WHERE actif = 1`
  ).all<import('../types/index.js').Agent>();

  if (agents.length === 0) return c.json({ error: 'Aucun agent actif trouvé' }, 400);

  // Lance en arrière-plan (Cloudflare Workers: waitUntil pour ne pas bloquer)
  const ctx = c.executionCtx;
  ctx.waitUntil(
    lancerCampagne(c.env, campagne, agents)
  );

  return c.json({
    ok: true,
    message: `Provisionnement lancé pour ${agents.length} agents`,
    campagne_id: id,
  });
});

api.route('/campagnes', campagnesRouter);

// ══════════════════════════════════════════════════════════
// HISTORIQUE & AUDIT (protégé)
// ══════════════════════════════════════════════════════════

const historiqueRouter = new Hono<AppEnv>();
historiqueRouter.use('*', authMiddleware);

// Recherche transactions par agent/mois/statut
historiqueRouter.get('/transactions', async c => {
  const { agent_id, campagne_id, statut, telephone } = c.req.query();
  let query = `SELECT t.*, a.nom, a.prenom, a.role, c.mois
               FROM transactions t
               JOIN agents a ON a.id = t.agent_id
               JOIN campagnes c ON c.id = t.campagne_id
               WHERE 1=1`;
  const params: unknown[] = [];

  if (agent_id)   { query += ' AND t.agent_id = ?';   params.push(Number(agent_id)); }
  if (campagne_id){ query += ' AND t.campagne_id = ?'; params.push(Number(campagne_id)); }
  if (statut)     { query += ' AND t.statut = ?';      params.push(statut); }
  if (telephone)  { query += ' AND t.telephone LIKE ?'; params.push(`%${telephone}%`); }

  query += ' ORDER BY t.tente_le DESC LIMIT 200';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ transactions: results, total: results.length });
});

// Preuve complète d'une transaction (pour litige)
historiqueRouter.get('/transactions/:id/preuve', async c => {
  const id = Number(c.req.param('id'));
  const tx = await c.env.DB.prepare(
    `SELECT t.*, a.nom, a.prenom, a.telephone as agent_tel, a.role,
            c.mois, c.budget_fcfa, c.compte_source
     FROM transactions t
     JOIN agents a ON a.id = t.agent_id
     JOIN campagnes c ON c.id = t.campagne_id
     WHERE t.id = ?`
  ).bind(id).first();

  if (!tx) return c.json({ error: 'Transaction introuvable' }, 404);
  return c.json({ preuve: tx });
});

// Stats globales pour le dashboard
historiqueRouter.get('/stats', async c => {
  const totalAgents = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM agents WHERE actif = 1`).first<{ n: number }>();
  const totalCampagnes = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM campagnes`).first<{ n: number }>();
  const lastCampagne = await c.env.DB.prepare(`SELECT * FROM campagnes ORDER BY mois DESC LIMIT 1`).first();
  const txStats = await c.env.DB.prepare(
    `SELECT statut, COUNT(*) as n FROM transactions GROUP BY statut`
  ).all<{ statut: string; n: number }>();

  return c.json({
    total_agents: totalAgents?.n ?? 0,
    total_campagnes: totalCampagnes?.n ?? 0,
    last_campagne: lastCampagne,
    transactions_par_statut: txStats.results,
  });
});

api.route('/historique', historiqueRouter);

// ══════════════════════════════════════════════════════════
// RELANCE — Retenter les échecs d'une campagne
// ══════════════════════════════════════════════════════════

const relanceRouter = new Hono<AppEnv>();
relanceRouter.use('*', authMiddleware);

relanceRouter.post('/campagnes/:id/relancer-echecs', async c => {
  const id = Number(c.req.param('id'));
  const { relancerEchecs } = await import('../services/relance.js');
  const campagne = await c.env.DB.prepare(`SELECT id FROM campagnes WHERE id = ?`).bind(id).first();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  c.executionCtx.waitUntil(relancerEchecs(c.env, id));
  return c.json({ ok: true, message: 'Relance des échecs démarrée' });
});

// ── Export CSV d'une campagne ──────────────────────────────
relanceRouter.get('/campagnes/:id/export.csv', async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT mois FROM campagnes WHERE id = ?`).bind(id).first<{ mois: string }>();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT a.nom, a.prenom, a.telephone, a.role, t.option_used, t.statut,
            t.airtel_transaction_id, t.airtel_reference, t.airtel_message,
            t.tente_le, t.confirme_le, t.nb_tentatives
     FROM transactions t JOIN agents a ON a.id = t.agent_id
     WHERE t.campagne_id = ? ORDER BY a.nom, a.prenom`
  ).bind(id).all<Record<string, string | number | null>>();

  const headers = ['Nom','Prénom','Téléphone','Rôle','Option','Statut','ID Airtel','Référence','Message Airtel','Date tentative','Date confirmation','Nb tentatives'];
  const rows = results.map(r =>
    [r['nom'],r['prenom'],r['telephone'],r['role'],r['option_used'],r['statut'],
     r['airtel_transaction_id']??'',r['airtel_reference']??'',r['airtel_message']??'',
     r['tente_le'],r['confirme_le']??'',r['nb_tentatives']]
    .map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')
  );

  return new Response([headers.join(','), ...rows].join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="campagne-${campagne.mois}.csv"`,
    },
  });
});

api.route('/', relanceRouter);

export default api;
