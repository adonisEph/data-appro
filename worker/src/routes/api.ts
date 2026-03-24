import { Hono } from 'hono';
import type { Env, Role, JWTPayload } from '../types/index.js';
import { ROLE_QUOTAS } from '../types/index.js';
import { authMiddleware, superAdminMiddleware, noViewerMiddleware, generateJWT } from '../middleware/auth.js';
import { lancerCampagne } from '../services/provisionnement.js';

type Variables = { user: JWTPayload };
type AppEnv = { Bindings: Env; Variables: Variables };
const api = new Hono<AppEnv>();

// ── Santé ────────────────────────────────────────────────────
api.get('/health', c => c.json({ ok: true, service: 'data-appro-worker', ts: new Date().toISOString() }));

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════
api.post('/auth/login', async c => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return c.json({ error: 'email et password requis' }, 400);

    const resp = await c.env.DB.prepare(
      `SELECT r.id, r.agent_id, r.email, r.password_hash,
              r.is_super_admin, r.is_viewer,
              r.can_import_agents, r.can_launch_campagne,
              r.can_view_historique, r.can_manage_users,
              a.nom, a.prenom
       FROM responsables r JOIN agents a ON a.id = r.agent_id
       WHERE r.email = ? AND r.actif = 1`
    ).bind(email).first<{
      id: number; agent_id: number; email: string; password_hash: string;
      is_super_admin: number; is_viewer: number;
      can_import_agents: number; can_launch_campagne: number;
      can_view_historique: number; can_manage_users: number;
      nom: string; prenom: string;
    }>();

    if (!resp) return c.json({ error: 'Identifiants invalides' }, 401);

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + String(resp.id)));
    const hash = btoa(Array.from(new Uint8Array(hashBuffer)).map(b => String.fromCharCode(b)).join(''));
    if (hash !== resp.password_hash) return c.json({ error: 'Identifiants invalides' }, 401);

    const token = await generateJWT(c.env.JWT_SECRET, {
      sub: String(resp.id),
      email: resp.email,
      agent_id: resp.agent_id,
      is_super_admin: resp.is_super_admin === 1,
      is_viewer: resp.is_viewer === 1,
    });

    return c.json({
      token,
      user: {
        nom: resp.nom, prenom: resp.prenom, email: resp.email,
        is_super_admin: resp.is_super_admin === 1,
        is_viewer: resp.is_viewer === 1,
        droits: {
          can_import_agents:   resp.can_import_agents === 1,
          can_launch_campagne: resp.can_launch_campagne === 1,
          can_view_historique: resp.can_view_historique === 1,
          can_manage_users:    resp.can_manage_users === 1,
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Login Error]', msg);
    return c.json({ error: 'Erreur serveur interne', detail: msg }, 500);
  }
});

// ══════════════════════════════════════════════════════════
// RÔLES MÉTIER — CRUD Super Admin
// ══════════════════════════════════════════════════════════
const rolesRouter = new Hono<AppEnv>();
rolesRouter.use('*', authMiddleware);

rolesRouter.get('/', async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM roles_metier ORDER BY COALESCE(actif, 1) DESC, label`
  ).all();
  return c.json({ roles: results });
});

rolesRouter.post('/', superAdminMiddleware, async c => {
  const { label, description } = await c.req.json<{ label: string; description?: string }>();
  if (!label) return c.json({ error: 'label requis' }, 400);
  try {
    const r = await c.env.DB.prepare(
      `INSERT INTO roles_metier (label, description) VALUES (?, ?) RETURNING id`
    ).bind(label.trim(), description ?? null).first<{ id: number }>();
    return c.json({ ok: true, id: r?.id });
  } catch {
    return c.json({ error: 'Ce rôle existe déjà' }, 409);
  }
});

rolesRouter.put('/:id', superAdminMiddleware, async c => {
  const id = Number(c.req.param('id'));
  const { label, description, actif } = await c.req.json<{ label?: string; description?: string; actif?: number }>();
  const updates: string[] = []; const values: unknown[] = [];
  if (label       !== undefined) { updates.push('label = ?');       values.push(label.trim()); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (actif       !== undefined) { updates.push('actif = ?');       values.push(actif); }
  if (!updates.length) return c.json({ error: 'Rien à modifier' }, 400);
  values.push(id);
  await c.env.DB.prepare(`UPDATE roles_metier SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

rolesRouter.delete('/:id', superAdminMiddleware, async c => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare(`UPDATE roles_metier SET actif = 0 WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

api.route('/roles-metier', rolesRouter);

// ══════════════════════════════════════════════════════════
// AGENTS — CRUD COMPLET
// ══════════════════════════════════════════════════════════
const agentsRouter = new Hono<AppEnv>();
agentsRouter.use('*', authMiddleware);

agentsRouter.get('/', async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM agents WHERE actif = 1 ORDER BY nom, prenom`
  ).all();
  return c.json({ agents: results, total: results.length });
});

agentsRouter.get('/:id', async c => {
  const id = Number(c.req.param('id'));
  const agent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?`).bind(id).first();
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404);
  return c.json({ agent });
});

agentsRouter.post('/import', noViewerMiddleware, async c => {
  const { agents } = await c.req.json<{
    agents: Array<{
      nom: string; prenom: string; telephone: string; role: Role;
      role_label?: string; quota_gb?: number; prix_cfa?: number; forfait_label?: string;
    }>
  }>();
  if (!Array.isArray(agents) || agents.length === 0) return c.json({ error: 'Tableau vide' }, 400);

  let imported = 0; let skipped = 0; const errors: string[] = [];

  for (const agent of agents) {
    if (!agent.telephone || !agent.role) { errors.push(`Invalide: ${JSON.stringify(agent)}`); skipped++; continue; }
    const quota = agent.quota_gb ?? ROLE_QUOTAS[agent.role];
    try {
      await c.env.DB.prepare(
        `INSERT INTO agents (nom, prenom, telephone, role, role_label, quota_gb, forfait_label, prix_cfa)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(telephone) DO UPDATE SET
           nom = excluded.nom, prenom = excluded.prenom,
           role = excluded.role, role_label = excluded.role_label,
           quota_gb = excluded.quota_gb, forfait_label = excluded.forfait_label,
           prix_cfa = excluded.prix_cfa, updated_at = datetime('now')`
      ).bind(
        agent.nom || 'Agent', agent.prenom || '', agent.telephone,
        agent.role, agent.role_label ?? null, quota,
        agent.forfait_label ?? null, agent.prix_cfa ?? 0
      ).run();
      imported++;
    } catch (err) {
      errors.push(`Erreur ${agent.telephone}: ${err instanceof Error ? err.message : 'inconnue'}`);
      skipped++;
    }
  }

  await c.env.DB.prepare(`INSERT INTO audit_logs (responsable_id, action, details) VALUES (?, ?, ?)`)
    .bind(Number((c.get('user') as JWTPayload).sub), 'IMPORT_AGENTS', JSON.stringify({ imported, skipped })).run();

  return c.json({ imported, skipped, errors, total: agents.length });
});

agentsRouter.put('/:id', noViewerMiddleware, async c => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    nom?: string; prenom?: string; telephone?: string;
    role?: Role; role_label?: string; quota_gb?: number;
    prix_cfa?: number; forfait_label?: string; actif?: number;
  }>();

  const updates: string[] = []; const values: unknown[] = [];
  if (body.nom           !== undefined) { updates.push('nom = ?');           values.push(body.nom); }
  if (body.prenom        !== undefined) { updates.push('prenom = ?');         values.push(body.prenom); }
  if (body.telephone     !== undefined) { updates.push('telephone = ?');      values.push(body.telephone); }
  if (body.role_label    !== undefined) { updates.push('role_label = ?');     values.push(body.role_label); }
  if (body.quota_gb      !== undefined) { updates.push('quota_gb = ?');       values.push(body.quota_gb); }
  if (body.prix_cfa      !== undefined) { updates.push('prix_cfa = ?');       values.push(body.prix_cfa); }
  if (body.forfait_label !== undefined) { updates.push('forfait_label = ?');  values.push(body.forfait_label); }
  if (body.actif         !== undefined) { updates.push('actif = ?');          values.push(body.actif); }
  if (body.role          !== undefined) { updates.push('role = ?');           values.push(body.role); }
  if (!updates.length) return c.json({ error: 'Rien à modifier' }, 400);
  updates.push("updated_at = datetime('now')");
  values.push(id);

  await c.env.DB.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  const updated = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, agent: updated });
});

agentsRouter.delete('/:id', superAdminMiddleware, async c => {
  const id = Number(c.req.param('id'));
  const agent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?`).bind(id).first();
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404);
  await c.env.DB.prepare(`UPDATE agents SET actif = 0, updated_at = datetime('now') WHERE id = ?`).bind(id).run();
  await c.env.DB.prepare(`INSERT INTO audit_logs (agent_id, responsable_id, action, details) VALUES (?, ?, ?, ?)`)
    .bind(id, Number((c.get('user') as JWTPayload).sub), 'AGENT_DELETED', JSON.stringify({ agent })).run();
  return c.json({ ok: true });
});

api.route('/agents', agentsRouter);

// ══════════════════════════════════════════════════════════
// UTILISATEURS — Super Admin
// ══════════════════════════════════════════════════════════
const usersRouter = new Hono<AppEnv>();
usersRouter.use('*', authMiddleware, superAdminMiddleware);

usersRouter.get('/', async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.agent_id, r.email, r.is_super_admin, r.is_viewer,
            r.can_import_agents, r.can_launch_campagne, r.can_view_historique, r.can_manage_users,
            r.actif, r.created_at, a.nom, a.prenom, a.telephone, a.role, a.role_label
     FROM responsables r JOIN agents a ON a.id = r.agent_id
     ORDER BY r.created_at DESC`
  ).all();
  return c.json({ users: results });
});

usersRouter.post('/', async c => {
  const body = await c.req.json<{
    nom: string; prenom: string; telephone: string; email: string; password: string;
    role?: Role; role_label?: string; is_viewer?: boolean;
    can_import_agents?: boolean; can_launch_campagne?: boolean;
    can_view_historique?: boolean; can_manage_users?: boolean;
  }>();

  const { nom, prenom, telephone, email, password } = body;
  if (!nom || !telephone || !email || !password) return c.json({ error: 'Champs requis manquants' }, 400);

  let agentId: number;
  const existing = await c.env.DB.prepare(`SELECT id FROM agents WHERE telephone = ?`).bind(telephone).first<{ id: number }>();
  if (existing) {
    agentId = existing.id;
  } else {
    const role: Role = body.role ?? 'manager';
    const inserted = await c.env.DB.prepare(
      `INSERT INTO agents (nom, prenom, telephone, role, role_label, quota_gb)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(nom, prenom || '', telephone, role, body.role_label ?? null, ROLE_QUOTAS[role])
     .first<{ id: number }>();
    if (!inserted) return c.json({ error: 'Erreur création agent' }, 500);
    agentId = inserted.id;
  }

  const isViewer = body.is_viewer ? 1 : 0;
  const tempInsert = await c.env.DB.prepare(
    `INSERT INTO responsables (agent_id, email, password_hash, is_viewer,
       can_import_agents, can_launch_campagne, can_view_historique, can_manage_users)
     VALUES (?, ?, 'temp', ?, ?, ?, ?, ?) RETURNING id`
  ).bind(
    agentId, email, isViewer,
    isViewer ? 0 : (body.can_import_agents   !== false ? 1 : 0),
    isViewer ? 0 : (body.can_launch_campagne !== false ? 1 : 0),
    1, // can_view_historique toujours activé
    isViewer ? 0 : (body.can_manage_users    ? 1 : 0)
  ).first<{ id: number }>();

  if (!tempInsert) return c.json({ error: 'Erreur création responsable' }, 500);

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password + String(tempInsert.id)));
  const hash = btoa(Array.from(new Uint8Array(hashBuffer)).map(b => String.fromCharCode(b)).join(''));
  await c.env.DB.prepare(`UPDATE responsables SET password_hash = ? WHERE id = ?`).bind(hash, tempInsert.id).run();

  return c.json({ ok: true, user_id: tempInsert.id });
});

usersRouter.put('/:id', async c => {
  const id = Number(c.req.param('id'));
  const currentUser = c.get('user');
  if (id === Number(currentUser.sub)) return c.json({ error: 'Impossible de modifier son propre compte ici' }, 400);

  const body = await c.req.json<{
    can_import_agents?: boolean; can_launch_campagne?: boolean;
    can_view_historique?: boolean; can_manage_users?: boolean;
    actif?: boolean; is_viewer?: boolean;
  }>();
  const updates: string[] = []; const values: unknown[] = [];
  if (body.can_import_agents   !== undefined) { updates.push('can_import_agents = ?');   values.push(body.can_import_agents   ? 1 : 0); }
  if (body.can_launch_campagne !== undefined) { updates.push('can_launch_campagne = ?'); values.push(body.can_launch_campagne ? 1 : 0); }
  if (body.can_view_historique !== undefined) { updates.push('can_view_historique = ?'); values.push(body.can_view_historique ? 1 : 0); }
  if (body.can_manage_users    !== undefined) { updates.push('can_manage_users = ?');    values.push(body.can_manage_users    ? 1 : 0); }
  if (body.actif               !== undefined) { updates.push('actif = ?');               values.push(body.actif               ? 1 : 0); }
  if (body.is_viewer           !== undefined) { updates.push('is_viewer = ?');           values.push(body.is_viewer           ? 1 : 0); }
  if (!updates.length) return c.json({ error: 'Rien à modifier' }, 400);
  values.push(id);
  await c.env.DB.prepare(`UPDATE responsables SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

usersRouter.delete('/:id', async c => {
  const id = Number(c.req.param('id'));
  const currentUser = c.get('user');
  if (id === Number(currentUser.sub)) return c.json({ error: 'Impossible de se supprimer soi-même' }, 400);
  await c.env.DB.prepare(`UPDATE responsables SET actif = 0 WHERE id = ?`).bind(id).run();
  await c.env.DB.prepare(`INSERT INTO audit_logs (responsable_id, action, details) VALUES (?, ?, ?)`)
    .bind(Number(currentUser.sub), 'USER_DELETED', JSON.stringify({ deleted_id: id })).run();
  return c.json({ ok: true });
});

usersRouter.post('/:id/reset-password', async c => {
  const id = Number(c.req.param('id'));
  const { new_password } = await c.req.json<{ new_password: string }>();
  if (!new_password || new_password.length < 6) return c.json({ error: 'Mot de passe trop court' }, 400);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(new_password + String(id)));
  const hash = btoa(Array.from(new Uint8Array(hashBuffer)).map(b => String.fromCharCode(b)).join(''));
  await c.env.DB.prepare(`UPDATE responsables SET password_hash = ? WHERE id = ?`).bind(hash, id).run();
  return c.json({ ok: true });
});

api.route('/users', usersRouter);

// ══════════════════════════════════════════════════════════
// CAMPAGNES
// ══════════════════════════════════════════════════════════
const campagnesRouter = new Hono<AppEnv>();
campagnesRouter.use('*', authMiddleware);

campagnesRouter.get('/', async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, r.email as responsable_email, a.nom || ' ' || a.prenom as responsable_nom
     FROM campagnes c
     JOIN responsables r ON r.id = c.responsable_id
     JOIN agents a ON a.id = r.agent_id
     ORDER BY c.mois DESC`
  ).all();
  return c.json({ campagnes: results });
});

campagnesRouter.post('/', noViewerMiddleware, async c => {
  const user = c.get('user');
  const { mois, budget_fcfa, compte_source, option_envoi } = await c.req.json<{
    mois: string; budget_fcfa: number; compte_source: string; option_envoi: string;
  }>();
  if (!mois || !budget_fcfa || !compte_source) return c.json({ error: 'mois, budget_fcfa, compte_source requis' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO campagnes (mois, budget_fcfa, compte_source, responsable_id, option_envoi)
     VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).bind(mois, budget_fcfa, compte_source, Number(user.sub), option_envoi ?? 'argent').first<{ id: number }>();
  return c.json({ ok: true, campagne_id: result?.id });
});

campagnesRouter.get('/:id', async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT * FROM campagnes WHERE id = ?`).bind(id).first();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  const { results: transactions } = await c.env.DB.prepare(
    `SELECT t.*, a.nom, a.prenom, a.role, a.role_label
     FROM transactions t JOIN agents a ON a.id = t.agent_id
     WHERE t.campagne_id = ? ORDER BY t.tente_le DESC`
  ).bind(id).all();
  return c.json({ campagne, transactions });
});

campagnesRouter.post('/:id/lancer', noViewerMiddleware, async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT * FROM campagnes WHERE id = ?`)
    .bind(id).first<import('../types/index.js').Campagne>();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  if (campagne.statut === 'en_cours') return c.json({ error: 'Déjà en cours' }, 409);
  if (campagne.statut === 'terminee') return c.json({ error: 'Déjà terminée' }, 409);

  let body: { agent_ids?: number[] } = {};
  try { body = await c.req.json(); } catch { /* pas de body */ }

  let agents: import('../types/index.js').Agent[];
  if (body.agent_ids && body.agent_ids.length > 0) {
    const ph = body.agent_ids.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM agents WHERE id IN (${ph}) AND actif = 1`
    ).bind(...body.agent_ids).all<import('../types/index.js').Agent>();
    agents = results;
  } else {
    const { results } = await c.env.DB.prepare(`SELECT * FROM agents WHERE actif = 1`).all<import('../types/index.js').Agent>();
    agents = results;
  }

  if (agents.length === 0) return c.json({ error: 'Aucun agent trouvé' }, 400);
  c.executionCtx.waitUntil(lancerCampagne(c.env, campagne, agents));
  return c.json({ ok: true, message: `Provisionnement lancé pour ${agents.length} agent(s)`, mode: body.agent_ids ? 'test_ciblé' : 'tous_agents' });
});

// ── Supprimer une campagne — Super Admin uniquement ────────
campagnesRouter.delete('/:id', superAdminMiddleware, async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT statut, mois FROM campagnes WHERE id = ?`).bind(id).first<{ statut: string; mois: string }>();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  if (campagne.statut === 'en_cours') return c.json({ error: 'Impossible de supprimer une campagne en cours' }, 409);

  await c.env.DB.prepare(`DELETE FROM transactions WHERE campagne_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM campagnes WHERE id = ?`).bind(id).run();

  await c.env.DB.prepare(`INSERT INTO audit_logs (responsable_id, action, details) VALUES (?, ?, ?)`)
    .bind(Number((c.get('user') as JWTPayload).sub), 'CAMPAGNE_DELETED', JSON.stringify({ id, mois: campagne.mois })).run();

  return c.json({ ok: true, message: `Campagne ${campagne.mois} supprimée` });
});

api.route('/campagnes', campagnesRouter);

// ══════════════════════════════════════════════════════════
// HISTORIQUE
// ══════════════════════════════════════════════════════════
const historiqueRouter = new Hono<AppEnv>();
historiqueRouter.use('*', authMiddleware);

historiqueRouter.get('/transactions', async c => {
  const { agent_id, campagne_id, statut, telephone } = c.req.query();
  let query = `SELECT t.*, a.nom, a.prenom, a.role, a.role_label, c.mois
               FROM transactions t JOIN agents a ON a.id = t.agent_id JOIN campagnes c ON c.id = t.campagne_id WHERE 1=1`;
  const params: unknown[] = [];
  if (agent_id)    { query += ' AND t.agent_id = ?';    params.push(Number(agent_id)); }
  if (campagne_id) { query += ' AND t.campagne_id = ?'; params.push(Number(campagne_id)); }
  if (statut)      { query += ' AND t.statut = ?';      params.push(statut); }
  if (telephone)   { query += ' AND t.telephone LIKE ?'; params.push(`%${telephone}%`); }
  query += ' ORDER BY t.tente_le DESC LIMIT 500';
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ transactions: results, total: results.length });
});

historiqueRouter.get('/transactions/:id/preuve', async c => {
  const id = Number(c.req.param('id'));
  const tx = await c.env.DB.prepare(
    `SELECT t.*, a.nom, a.prenom, a.telephone as agent_tel, a.role, a.role_label, c.mois, c.budget_fcfa, c.compte_source
     FROM transactions t JOIN agents a ON a.id = t.agent_id JOIN campagnes c ON c.id = t.campagne_id WHERE t.id = ?`
  ).bind(id).first();
  if (!tx) return c.json({ error: 'Transaction introuvable' }, 404);
  return c.json({ preuve: tx });
});

historiqueRouter.get('/stats', async c => {
  const totalAgents    = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM agents WHERE actif = 1`).first<{ n: number }>();
  const totalCampagnes = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM campagnes`).first<{ n: number }>();
  const lastCampagne   = await c.env.DB.prepare(`SELECT * FROM campagnes ORDER BY mois DESC LIMIT 1`).first();
  const txStats        = await c.env.DB.prepare(`SELECT statut, COUNT(*) as n FROM transactions GROUP BY statut`).all<{ statut: string; n: number }>();
  return c.json({ total_agents: totalAgents?.n ?? 0, total_campagnes: totalCampagnes?.n ?? 0, last_campagne: lastCampagne, transactions_par_statut: txStats.results });
});

api.route('/historique', historiqueRouter);

// ══════════════════════════════════════════════════════════
// RELANCE + EXPORT CSV
// ══════════════════════════════════════════════════════════
const relanceRouter = new Hono<AppEnv>();
relanceRouter.use('*', authMiddleware, noViewerMiddleware);

relanceRouter.post('/campagnes/:id/relancer-echecs', async c => {
  const id = Number(c.req.param('id'));
  const { relancerEchecs } = await import('../services/relance.js');
  const campagne = await c.env.DB.prepare(`SELECT id FROM campagnes WHERE id = ?`).bind(id).first();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  c.executionCtx.waitUntil(relancerEchecs(c.env, id));
  return c.json({ ok: true, message: 'Relance démarrée' });
});

relanceRouter.get('/campagnes/:id/export.csv', async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT mois FROM campagnes WHERE id = ?`).bind(id).first<{ mois: string }>();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  const { results } = await c.env.DB.prepare(
    `SELECT a.nom, a.prenom, a.telephone, a.role, a.role_label, t.option_used, t.statut,
            t.airtel_transaction_id, t.airtel_reference, t.airtel_message, t.montant_fcfa, t.tente_le, t.confirme_le, t.nb_tentatives
     FROM transactions t JOIN agents a ON a.id = t.agent_id WHERE t.campagne_id = ? ORDER BY a.nom, a.prenom`
  ).bind(id).all<Record<string, string | number | null>>();
  const headers = ['Nom','Prénom','Téléphone','Rôle technique','Poste','Option','Statut','ID Airtel','Référence','Message','Montant FCFA','Date tentative','Date confirmation','Nb tentatives'];
  const rows = results.map(r =>
    [r['nom'],r['prenom'],r['telephone'],r['role'],r['role_label']??'',r['option_used'],r['statut'],
     r['airtel_transaction_id']??'',r['airtel_reference']??'',r['airtel_message']??'',
     r['montant_fcfa']??'',r['tente_le'],r['confirme_le']??'',r['nb_tentatives']]
    .map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')
  );
  return new Response([headers.join(','), ...rows].join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="campagne-${campagne.mois}.csv"` },
  });
});

api.route('/', relanceRouter);
export default api;
