import { Hono } from 'hono';
import type { Env, Role, JWTPayload } from '../types/index.js';
import { MONTANTS_FCFA, ROLE_QUOTAS } from '../types/index.js';
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

    try {
      const ua = (c.req.header('User-Agent') ?? '').slice(0, 300);
      const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? null;
      await c.env.DB.prepare(
        `INSERT INTO session_events (responsable_id, agent_id, email, event_type, path, page_title, user_agent, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        resp.id,
        resp.agent_id,
        resp.email,
        'login',
        '/login',
        'Login',
        ua,
        ip
      ).run();
    } catch {
      /* ignore */
    }

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

api.post('/auth/change-password', authMiddleware, async c => {
  const user = c.get('user');
  const { old_password, new_password } = await c.req.json<{ old_password: string; new_password: string }>();
  if (!old_password || !new_password) return c.json({ error: 'old_password et new_password requis' }, 400);
  if (new_password.length < 6) return c.json({ error: 'Mot de passe trop court' }, 400);

  const id = Number(user.sub);
  const resp = await c.env.DB.prepare(
    `SELECT id, password_hash FROM responsables WHERE id = ? AND actif = 1`
  ).bind(id).first<{ id: number; password_hash: string }>();
  if (!resp) return c.json({ error: 'Utilisateur introuvable' }, 404);

  const encoder = new TextEncoder();
  const oldHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(old_password + String(resp.id)));
  const oldHash = btoa(Array.from(new Uint8Array(oldHashBuffer)).map(b => String.fromCharCode(b)).join(''));
  if (oldHash !== resp.password_hash) return c.json({ error: 'Ancien mot de passe incorrect' }, 401);

  const newHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(new_password + String(resp.id)));
  const newHash = btoa(Array.from(new Uint8Array(newHashBuffer)).map(b => String.fromCharCode(b)).join(''));
  await c.env.DB.prepare(`UPDATE responsables SET password_hash = ? WHERE id = ?`).bind(newHash, resp.id).run();

  await c.env.DB.prepare(`INSERT INTO audit_logs (responsable_id, action, details) VALUES (?, ?, ?)`).bind(
    resp.id,
    'USER_PASSWORD_CHANGED',
    JSON.stringify({ by_self: true })
  ).run();

  return c.json({ ok: true });
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

agentsRouter.post('/', noViewerMiddleware, async c => {
  const body = await c.req.json<{
    nom: string; prenom: string; telephone: string;
    role?: Role; role_label?: string | null;
    quota_gb?: number; prix_cfa?: number; forfait_label?: string | null;
  }>();

  const nom = (body.nom ?? '').trim();
  const prenom = (body.prenom ?? '').trim();
  const telephone = (body.telephone ?? '').trim();
  const role: Role = body.role ?? 'technicien';

  if (!nom || !prenom || !telephone) return c.json({ error: 'nom, prenom, telephone requis' }, 400);
  if (!['technicien', 'responsable_junior', 'responsable_senior', 'manager'].includes(role)) {
    return c.json({ error: 'role invalide' }, 400);
  }

  const quota = body.quota_gb !== undefined ? body.quota_gb : ROLE_QUOTAS[role];
  const prix = body.prix_cfa !== undefined ? body.prix_cfa : 0;

  try {
    const inserted = await c.env.DB.prepare(
      `INSERT INTO agents (nom, prenom, telephone, role, role_label, quota_gb, prix_cfa, forfait_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(
      nom,
      prenom,
      telephone,
      role,
      body.role_label ?? null,
      quota,
      prix,
      body.forfait_label ?? null,
    ).first<{ id: number }>();

    if (!inserted) return c.json({ error: 'Erreur création agent' }, 500);

    await c.env.DB.prepare(`INSERT INTO audit_logs (agent_id, responsable_id, action, details) VALUES (?, ?, ?, ?)`).bind(
      inserted.id,
      Number((c.get('user') as JWTPayload).sub),
      'AGENT_CREATED',
      JSON.stringify({ nom, prenom, telephone, role, quota_gb: quota, prix_cfa: prix, forfait_label: body.forfait_label ?? null, role_label: body.role_label ?? null })
    ).run();

    const agent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?`).bind(inserted.id).first();
    return c.json({ ok: true, agent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('constraint')) {
      return c.json({ error: 'Ce numéro existe déjà' }, 409);
    }
    console.error('[Agent Create Error]', msg);
    return c.json({ error: 'Erreur serveur interne', detail: msg }, 500);
  }
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

  const before = await c.env.DB.prepare(`SELECT nom, prenom, telephone, quota_gb FROM agents WHERE id = ?`).bind(id).first<{ nom: string; prenom: string; telephone: string; quota_gb: number }>();

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

  const user = c.get('user');
  const beforeQuota = before?.quota_gb;
  const afterQuota = (updated as { quota_gb?: number } | null)?.quota_gb;
  const quotaChanged = beforeQuota !== undefined && afterQuota !== undefined && beforeQuota !== afterQuota;

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (agent_id, responsable_id, action, details) VALUES (?, ?, ?, ?)`
  ).bind(
    id,
    Number((user as JWTPayload).sub),
    quotaChanged ? 'AGENT_QUOTA_CHANGED' : 'AGENT_UPDATED',
    JSON.stringify({
      updates: body,
      before: before ? { nom: before.nom, prenom: before.prenom, telephone: before.telephone, quota_gb: before.quota_gb } : { quota_gb: beforeQuota },
      after: updated ? {
        nom: (updated as { nom?: string } | null)?.nom,
        prenom: (updated as { prenom?: string } | null)?.prenom,
        telephone: (updated as { telephone?: string } | null)?.telephone,
        quota_gb: (updated as { quota_gb?: number } | null)?.quota_gb,
      } : { quota_gb: afterQuota },
    })
  ).run();

  return c.json({ ok: true, agent: updated });
});

agentsRouter.delete('/:id', superAdminMiddleware, async c => {
  const id = Number(c.req.param('id'));
  const agent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?`).bind(id).first();
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404);
  await c.env.DB.prepare(`UPDATE agents SET actif = 0, updated_at = datetime('now') WHERE id = ?`).bind(id).run();

  // Si l'agent est supprimé pendant une campagne en cours, le traiter comme confirmé
  // (pour que les compteurs/budgets/progression et l'historique reflètent la réalité).
  const { results: campagnesEnCours } = await c.env.DB.prepare(
    `SELECT id, total_agents, agents_ok, agents_echec, lance_le, created_at
     FROM campagnes
     WHERE statut = 'en_cours'`
  ).all<{
    id: number;
    total_agents: number;
    agents_ok: number;
    agents_echec: number;
    lance_le: string | null;
    created_at: string | null;
  }>();

  const agentCreatedAt = (agent as { created_at?: string | null }).created_at ?? null;
  const agentTelephone = (agent as { telephone?: string | null }).telephone ?? null;
  const agentRole = (agent as { role?: Role | null }).role ?? null;
  const agentPrix = (agent as { prix_cfa?: number | null }).prix_cfa ?? 0;

  const agentCreatedMs = agentCreatedAt ? new Date(agentCreatedAt).getTime() : NaN;
  const montantSuppression = agentPrix > 0
    ? agentPrix
    : (agentRole ? (MONTANTS_FCFA[agentRole] ?? 0) : 0);

  for (const camp of (campagnesEnCours ?? [])) {
    const cutoff = camp.lance_le ?? camp.created_at;
    const cutoffMs = cutoff ? new Date(cutoff).getTime() : NaN;

    // Si on n'a pas de dates fiables, on évite toute auto-confirmation.
    if (!Number.isFinite(agentCreatedMs) || !Number.isFinite(cutoffMs)) continue;

    // Snapshot: agent inclus si créé avant le cutoff.
    if (agentCreatedMs > cutoffMs) continue;

    const existingTx = await c.env.DB.prepare(
      `SELECT id, statut FROM transactions WHERE campagne_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(camp.id, id).first<{ id: number; statut: string }>();

    if (existingTx && (existingTx.statut === 'confirme' || existingTx.statut === 'echec')) continue;

    if (existingTx) {
      await c.env.DB.prepare(
        `UPDATE transactions
         SET statut = 'confirme',
             option_used = COALESCE(option_used, 'argent'),
             montant_fcfa = COALESCE(?, montant_fcfa),
             airtel_message = 'Confirmé (agent supprimé)',
             airtel_raw_response = ?,
             tente_le = datetime('now'),
             confirme_le = datetime('now')
         WHERE id = ?`
      ).bind(
        montantSuppression > 0 ? montantSuppression : null,
        JSON.stringify({ mode: 'system', reason: 'agent_deleted', agent_id: id, campagne_id: camp.id }),
        existingTx.id
      ).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO transactions (campagne_id, agent_id, telephone, montant_fcfa, option_used, statut, airtel_message, airtel_raw_response, tente_le, confirme_le)
         VALUES (?, ?, ?, ?, 'argent', 'confirme', 'Confirmé (agent supprimé)', ?, datetime('now'), datetime('now'))`
      ).bind(
        camp.id,
        id,
        agentTelephone,
        montantSuppression > 0 ? montantSuppression : null,
        JSON.stringify({ mode: 'system', reason: 'agent_deleted', agent_id: id, campagne_id: camp.id })
      ).run();
    }

    await c.env.DB.prepare(`UPDATE campagnes SET agents_ok = agents_ok + 1 WHERE id = ?`).bind(camp.id).run();

    const updated = await c.env.DB.prepare(
      `SELECT total_agents, agents_ok, agents_echec FROM campagnes WHERE id = ?`
    ).bind(camp.id).first<{ total_agents: number; agents_ok: number; agents_echec: number }>();

    if (updated) {
      const done = (updated.agents_ok + updated.agents_echec);
      if (updated.total_agents > 0 && done >= updated.total_agents) {
        const final = updated.agents_echec === 0 ? 'terminee' : updated.agents_ok === 0 ? 'annulee' : 'partielle';
        await c.env.DB.prepare(
          `UPDATE campagnes SET statut = ?, termine_le = datetime('now') WHERE id = ?`
        ).bind(final, camp.id).run();
      }
    }
  }

  await c.env.DB.prepare(`INSERT INTO audit_logs (agent_id, responsable_id, action, details) VALUES (?, ?, ?, ?)`)
    .bind(id, Number((c.get('user') as JWTPayload).sub), 'AGENT_DELETED', JSON.stringify({ agent })).run();
  return c.json({ ok: true });
});

api.route('/agents', agentsRouter);

// ══════════════════════════════════════════════════════════
// EVENTS (audit_logs) — temps réel via polling
// ══════════════════════════════════════════════════════════
const eventsRouter = new Hono<AppEnv>();
eventsRouter.use('*', authMiddleware);

eventsRouter.get('/', async c => {
  const sinceIdRaw = c.req.query('since_id');
  const limitRaw = c.req.query('limit');

  const sinceId = sinceIdRaw ? Number(sinceIdRaw) : 0;
  const limit = Math.min(200, Math.max(1, limitRaw ? Number(limitRaw) : 50));

  const { results } = await c.env.DB.prepare(
    `SELECT id, campagne_id, agent_id, responsable_id, action, details, created_at
     FROM audit_logs
     WHERE id > ?
     ORDER BY id ASC
     LIMIT ?`
  ).bind(Number.isFinite(sinceId) ? sinceId : 0, Number.isFinite(limit) ? limit : 50).all();

  const events = results ?? [];
  const next_since_id = events.length > 0
    ? (events[events.length - 1] as { id: number }).id
    : (Number.isFinite(sinceId) ? sinceId : 0);

  return c.json({ events, next_since_id });
});

api.route('/events', eventsRouter);

const auditLogsRouter = new Hono<AppEnv>();
auditLogsRouter.use('*', authMiddleware);

auditLogsRouter.get('/', async c => {
  const q = c.req.query();
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  const email = q.email ? String(q.email).trim() : null;
  const action = q.action ? String(q.action).trim() : null;
  const search = q.q ? String(q.q).trim() : null;
  const limit = Math.min(200, Math.max(1, q.limit ? Number(q.limit) : 50));
  const offset = Math.max(0, q.offset ? Number(q.offset) : 0);

  let sql =
    `SELECT l.id, l.campagne_id, l.agent_id, l.responsable_id, l.action, l.details, l.ip_address, l.created_at,
            r.email AS responsable_email,
            a.nom AS agent_nom, a.prenom AS agent_prenom, a.telephone AS agent_telephone
     FROM audit_logs l
     LEFT JOIN responsables r ON r.id = l.responsable_id
     LEFT JOIN agents a ON a.id = l.agent_id
     WHERE 1=1`;
  const params: unknown[] = [];

  if (from) { sql += ' AND l.created_at >= ?'; params.push(from); }
  if (to) { sql += ' AND l.created_at <= ?'; params.push(to); }
  if (email) { sql += ' AND r.email LIKE ?'; params.push(`%${email}%`); }
  if (action) { sql += ' AND l.action = ?'; params.push(action); }
  if (search) {
    sql += ' AND (COALESCE(l.action,\'\') LIKE ? OR COALESCE(l.details,\'\') LIKE ? OR COALESCE(r.email,\'\') LIKE ?)';
    const pat = `%${search}%`;
    params.push(pat, pat, pat);
  }

  sql += ' ORDER BY l.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ logs: results ?? [], limit, offset });
});

api.route('/audit-logs', auditLogsRouter);

// ══════════════════════════════════════════════════════════
// SESSIONS (présence) — heartbeat + listing Super Admin
// ══════════════════════════════════════════════════════════
const sessionsRouter = new Hono<AppEnv>();
sessionsRouter.use('*', authMiddleware);

sessionsRouter.post('/heartbeat', async c => {
  const user = c.get('user') as JWTPayload;
  let body: { path?: string; page_title?: string } = {};
  try {
    body = await c.req.json<{ path?: string; page_title?: string }>();
  } catch {
    /* ignore */
  }

  const responsableId = Number(user.sub);
  const agentId = typeof user.agent_id === 'number' ? user.agent_id : null;
  const email = String(user.email ?? '');
  const isSuperAdmin = user.is_super_admin ? 1 : 0;
  const isViewer = user.is_viewer ? 1 : 0;
  const path = body.path ? String(body.path).slice(0, 300) : null;
  const pageTitle = body.page_title ? String(body.page_title).slice(0, 120) : null;
  const userAgent = (c.req.header('User-Agent') ?? '').slice(0, 300);
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? null;

  if (!Number.isFinite(responsableId)) return c.json({ error: 'Utilisateur invalide' }, 400);

  const prev = await c.env.DB.prepare(
    `SELECT path, page_title FROM active_sessions WHERE responsable_id = ? LIMIT 1`
  ).bind(responsableId).first<{ path: string | null; page_title: string | null }>();

  await c.env.DB.prepare(
    `INSERT INTO active_sessions (responsable_id, agent_id, email, is_super_admin, is_viewer, path, page_title, user_agent, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(responsable_id) DO UPDATE SET
       agent_id = excluded.agent_id,
       email = excluded.email,
       is_super_admin = excluded.is_super_admin,
       is_viewer = excluded.is_viewer,
       path = excluded.path,
       page_title = excluded.page_title,
       user_agent = excluded.user_agent,
       last_seen_at = datetime('now')`
  ).bind(
    responsableId,
    agentId,
    email,
    isSuperAdmin,
    isViewer,
    path,
    pageTitle,
    userAgent
  ).run();

  if (path && (prev?.path !== path || (pageTitle && prev?.page_title !== pageTitle))) {
    await c.env.DB.prepare(
      `INSERT INTO session_events (responsable_id, agent_id, email, event_type, path, page_title, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      responsableId,
      agentId,
      email,
      'navigate',
      path,
      pageTitle,
      userAgent,
      ip
    ).run();
  }

  return c.json({ ok: true });
});

sessionsRouter.get('/active', superAdminMiddleware, async c => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.responsable_id, s.agent_id, s.email, s.is_super_admin, s.is_viewer,
            s.path, s.page_title, s.last_seen_at,
            a.nom, a.prenom, a.telephone
     FROM active_sessions s
     LEFT JOIN agents a ON a.id = s.agent_id
     WHERE s.last_seen_at >= datetime('now', '-2 minutes')
     ORDER BY s.last_seen_at DESC`
  ).all();
  return c.json({ sessions: results ?? [] });
});

sessionsRouter.get('/history', superAdminMiddleware, async c => {
  const q = c.req.query();
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  const email = q.email ? String(q.email).trim() : null;
  const activity = q.activity ? String(q.activity).trim() : null;
  const limit = Math.min(500, Math.max(1, q.limit ? Number(q.limit) : 100));

  let sql =
    `SELECT e.id, e.responsable_id, e.agent_id, e.email, e.event_type, e.path, e.page_title, e.user_agent, e.ip_address, e.created_at,
            a.nom, a.prenom, a.telephone
     FROM session_events e
     LEFT JOIN agents a ON a.id = e.agent_id
     WHERE 1=1`;
  const params: unknown[] = [];

  if (from) { sql += ' AND e.created_at >= ?'; params.push(from); }
  if (to) { sql += ' AND e.created_at <= ?'; params.push(to); }
  if (email) { sql += ' AND e.email LIKE ?'; params.push(`%${email}%`); }
  if (activity) {
    sql += ' AND (COALESCE(e.path,\'\') LIKE ? OR COALESCE(e.page_title,\'\') LIKE ? OR COALESCE(e.event_type,\'\') LIKE ?)';
    const pat = `%${activity}%`;
    params.push(pat, pat, pat);
  }

  sql += ' ORDER BY e.created_at DESC LIMIT ?';
  params.push(limit);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ events: results ?? [] });
});

sessionsRouter.get('/history.csv', superAdminMiddleware, async c => {
  const q = c.req.query();
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  const email = q.email ? String(q.email).trim() : null;
  const activity = q.activity ? String(q.activity).trim() : null;
  const limit = Math.min(2000, Math.max(1, q.limit ? Number(q.limit) : 1000));

  let sql =
    `SELECT e.id, e.email, e.event_type, e.path, e.page_title, e.ip_address, e.created_at,
            a.nom, a.prenom, a.telephone
     FROM session_events e
     LEFT JOIN agents a ON a.id = e.agent_id
     WHERE 1=1`;
  const params: unknown[] = [];
  if (from) { sql += ' AND e.created_at >= ?'; params.push(from); }
  if (to) { sql += ' AND e.created_at <= ?'; params.push(to); }
  if (email) { sql += ' AND e.email LIKE ?'; params.push(`%${email}%`); }
  if (activity) {
    sql += ' AND (COALESCE(e.path,\'\') LIKE ? OR COALESCE(e.page_title,\'\') LIKE ? OR COALESCE(e.event_type,\'\') LIKE ?)';
    const pat = `%${activity}%`;
    params.push(pat, pat, pat);
  }
  sql += ' ORDER BY e.created_at DESC LIMIT ?';
  params.push(limit);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>();

  const headers = ['ID', 'Email', 'Nom', 'Prénom', 'Téléphone', 'Type', 'Path', 'Page', 'IP', 'Date'];
  const rows = (results ?? []).map(r => [
    r['id'],
    r['email'],
    r['nom'] ?? '',
    r['prenom'] ?? '',
    r['telephone'] ?? '',
    r['event_type'],
    r['path'] ?? '',
    r['page_title'] ?? '',
    r['ip_address'] ?? '',
    r['created_at'],
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

  return new Response([headers.join(','), ...rows].join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sessions-history.csv"`,
    },
  });
});

api.route('/sessions', sessionsRouter);

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
    quota_gb?: number; prix_cfa?: number; forfait_label?: string;
    can_import_agents?: boolean; can_launch_campagne?: boolean;
    can_view_historique?: boolean; can_manage_users?: boolean;
  }>();

  const { nom, prenom, telephone, email, password } = body;
  if (!nom || !telephone || !email || !password) return c.json({ error: 'Champs requis manquants' }, 400);

  let agentId: number;
  const existing = await c.env.DB.prepare(`SELECT id FROM agents WHERE telephone = ?`).bind(telephone).first<{ id: number }>();
  if (existing) {
    agentId = existing.id;

    // Mettre à jour les infos agent si elles sont fournies
    await c.env.DB.prepare(
      `UPDATE agents
       SET nom = ?, prenom = ?,
           role_label = COALESCE(?, role_label),
           quota_gb = COALESCE(?, quota_gb),
           prix_cfa = COALESCE(?, prix_cfa),
           forfait_label = COALESCE(?, forfait_label)
       WHERE id = ?`
    ).bind(
      nom,
      prenom || '',
      body.role_label ? body.role_label : null,
      body.quota_gb !== undefined ? body.quota_gb : null,
      body.prix_cfa !== undefined ? body.prix_cfa : null,
      body.forfait_label ? body.forfait_label : null,
      agentId
    ).run();
  } else {
    const role: Role = body.role ?? 'manager';
    const quota = body.quota_gb !== undefined ? body.quota_gb : ROLE_QUOTAS[role];
    const prix = body.prix_cfa !== undefined ? body.prix_cfa : 0;
    const inserted = await c.env.DB.prepare(
      `INSERT INTO agents (nom, prenom, telephone, role, role_label, quota_gb, prix_cfa, forfait_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(
      nom,
      prenom || '',
      telephone,
      role,
      body.role_label ?? null,
      quota,
      prix,
      body.forfait_label ?? null
    )
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
    `SELECT c.*, r.email as responsable_email, a.nom || ' ' || a.prenom as responsable_nom,
            COALESCE(SUM(CASE WHEN t.statut = 'confirme' THEN COALESCE(t.montant_fcfa, 0) ELSE 0 END), 0) AS budget_confirme_fcfa,
            (
              SELECT COALESCE(SUM(COALESCE(ag.prix_cfa, 0)), 0)
              FROM agents ag
              WHERE ag.actif = 1
                AND datetime(ag.created_at) <= datetime(COALESCE(c.lance_le, c.created_at))
                AND NOT EXISTS (
                  SELECT 1 FROM transactions tt
                  WHERE tt.campagne_id = c.id AND tt.agent_id = ag.id AND tt.statut = 'confirme'
                )
            ) AS budget_restant_manuel_fcfa
     FROM campagnes c
     JOIN responsables r ON r.id = c.responsable_id
     JOIN agents a ON a.id = r.agent_id
     LEFT JOIN transactions t ON t.campagne_id = c.id
     GROUP BY c.id
     ORDER BY c.mois DESC`
  ).all();
  return c.json({ campagnes: results });
});

campagnesRouter.get('/:id/eligible-agents', async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT lance_le, created_at FROM campagnes WHERE id = ?`).bind(id).first<{ lance_le: string | null; created_at: string }>();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);

  const cutoff = campagne.lance_le ?? campagne.created_at;

  const totalAll = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM agents
     WHERE datetime(created_at) <= datetime(?)`
  ).bind(cutoff).first<{ n: number }>();

  const totalActive = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM agents
     WHERE actif = 1 AND datetime(created_at) <= datetime(?)`
  ).bind(cutoff).first<{ n: number }>();

  const deletedBudget = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(COALESCE(prix_cfa, 0)), 0) as s FROM agents
     WHERE actif = 0 AND datetime(created_at) <= datetime(?)`
  ).bind(cutoff).first<{ s: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM agents
     WHERE actif = 1 AND datetime(created_at) <= datetime(?)
     ORDER BY nom, prenom`
  ).bind(cutoff).all();

  return c.json({
    agents: results,
    total: results.length,
    total_all: totalAll?.n ?? results.length,
    total_active: totalActive?.n ?? results.length,
    deleted_budget_fcfa: deletedBudget?.s ?? 0,
    cutoff,
  });
});

campagnesRouter.post('/', noViewerMiddleware, async c => {
  const user = c.get('user');
  const { mois, budget_fcfa, compte_source, option_envoi, mode } = await c.req.json<{
    mois: string; budget_fcfa: number; compte_source: string; option_envoi: string; mode?: string;
  }>();
  if (!mois || !budget_fcfa || !compte_source) return c.json({ error: 'mois, budget_fcfa, compte_source requis' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO campagnes (mois, budget_fcfa, compte_source, responsable_id, option_envoi)
     VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).bind(mois, budget_fcfa, compte_source, Number(user.sub), option_envoi ?? 'argent').first<{ id: number }>();

  if (mode === 'manuel' && result?.id) {
    await c.env.DB.prepare(`UPDATE campagnes SET mode = 'manuel' WHERE id = ?`).bind(result.id).run();
  }

  if (result?.id) {
    await c.env.DB.prepare(`INSERT INTO audit_logs (campagne_id, responsable_id, action, details) VALUES (?, ?, ?, ?)`).bind(
      result.id,
      Number(user.sub),
      'CAMPAGNE_CREATED',
      JSON.stringify({ mois, budget_fcfa, compte_source, option_envoi: option_envoi ?? 'argent', mode: mode ?? 'auto' })
    ).run();
  }

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
  if ((campagne as unknown as { mode?: string }).mode === 'manuel') {
    return c.json({ error: 'Campagne en mode manuel : le lancement automatique est désactivé' }, 409);
  }
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

campagnesRouter.post('/:id/manual/validate', noViewerMiddleware, async c => {
  const campagneId = Number(c.req.param('id'));
  const user = c.get('user');
  const body = await c.req.json<{
    agent_id: number;
    action: 'argent' | 'forfait';
    statut: 'confirme' | 'echec';
    sms: string;
    montant_fcfa?: number;
  }>();

  if (!body.agent_id || !body.action || !body.statut || !body.sms) {
    return c.json({ error: 'agent_id, action, statut, sms requis' }, 400);
  }

  const campagne = await c.env.DB.prepare(`SELECT * FROM campagnes WHERE id = ?`).bind(campagneId).first<Record<string, unknown>>();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  if (campagne['mode'] !== 'manuel') return c.json({ error: 'Campagne non-manuel' }, 409);

  const agent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ? AND actif = 1`).bind(body.agent_id).first<import('../types/index.js').Agent>();
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404);

  // Calcul montant : priorité au montant fourni, sinon prix agent, sinon fallback rôle
  const montant = body.montant_fcfa !== undefined
    ? body.montant_fcfa
    : (agent.prix_cfa > 0 ? agent.prix_cfa : (MONTANTS_FCFA[agent.role] ?? 0));

  // Si total_agents n'est pas initialisé sur une campagne manuelle, le fixer au nombre d'agents actifs
  if ((campagne['total_agents'] as number | undefined) === 0) {
    const total = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM agents WHERE actif = 1`).first<{ n: number }>();
    await c.env.DB.prepare(`UPDATE campagnes SET total_agents = ? WHERE id = ?`).bind(total?.n ?? 0, campagneId).run();
  }

  // Passer la campagne en cours au premier traitement
  if (campagne['statut'] === 'brouillon') {
    await c.env.DB.prepare(`UPDATE campagnes SET statut = 'en_cours', lance_le = datetime('now') WHERE id = ?`).bind(campagneId).run();
  }

  // Upsert transaction pour cet agent
  const existing = await c.env.DB.prepare(
    `SELECT id, statut FROM transactions WHERE campagne_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 1`
  ).bind(campagneId, body.agent_id).first<{ id: number; statut: string }>();

  const shouldApplyCounters = !existing || existing.statut !== body.statut;

  if (existing) {
    // Ajuster compteurs si on change le statut final
    if (existing.statut !== body.statut) {
      if (existing.statut === 'confirme') {
        await c.env.DB.prepare(`UPDATE campagnes SET agents_ok = MAX(0, agents_ok - 1) WHERE id = ?`).bind(campagneId).run();
      }
      if (existing.statut === 'echec') {
        await c.env.DB.prepare(`UPDATE campagnes SET agents_echec = MAX(0, agents_echec - 1) WHERE id = ?`).bind(campagneId).run();
      }
    }

    await c.env.DB.prepare(
      `UPDATE transactions
       SET option_used = ?, statut = ?, montant_fcfa = ?,
           airtel_message = ?, airtel_raw_response = ?,
           confirme_le = CASE WHEN ? = 'confirme' THEN datetime('now') ELSE NULL END,
           tente_le = datetime('now')
       WHERE id = ?`
    ).bind(
      body.action,
      body.statut,
      body.action === 'argent' ? montant : null,
      body.sms,
      JSON.stringify({ mode: 'manuel', sms: body.sms, action: body.action, responsable_id: Number(user.sub) }),
      body.statut,
      existing.id
    ).run();
  } else {
    const inserted = await c.env.DB.prepare(
      `INSERT INTO transactions (campagne_id, agent_id, telephone, montant_fcfa, option_used, statut, airtel_message, airtel_raw_response, tente_le, confirme_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), CASE WHEN ? = 'confirme' THEN datetime('now') ELSE NULL END)
       RETURNING id`
    ).bind(
      campagneId,
      body.agent_id,
      agent.telephone,
      body.action === 'argent' ? montant : null,
      body.action,
      body.statut,
      body.sms,
      JSON.stringify({ mode: 'manuel', sms: body.sms, action: body.action, responsable_id: Number(user.sub) }),
      body.statut
    ).first<{ id: number }>();

    if (!inserted) return c.json({ error: 'Impossible de créer la transaction' }, 500);
  }

  // Incrémenter compteurs campagne selon le statut
  if (shouldApplyCounters) {
    if (body.statut === 'confirme') {
      await c.env.DB.prepare(`UPDATE campagnes SET agents_ok = agents_ok + 1 WHERE id = ?`).bind(campagneId).run();
    } else {
      await c.env.DB.prepare(`UPDATE campagnes SET agents_echec = agents_echec + 1 WHERE id = ?`).bind(campagneId).run();
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (campagne_id, agent_id, responsable_id, action, details) VALUES (?, ?, ?, ?, ?)`
  ).bind(
    campagneId,
    body.agent_id,
    Number(user.sub),
    body.action === 'argent'
      ? (body.statut === 'confirme' ? 'MANUAL_ARGENT_CONFIRME' : 'MANUAL_ARGENT_ECHEC')
      : (body.statut === 'confirme' ? 'MANUAL_FORFAIT_CONFIRME' : 'MANUAL_FORFAIT_ECHEC'),
    JSON.stringify({ sms: body.sms, montant_fcfa: body.action === 'argent' ? montant : null })
  ).run();

  // Statut final si terminé
  const updated = await c.env.DB.prepare(`SELECT total_agents, agents_ok, agents_echec FROM campagnes WHERE id = ?`)
    .bind(campagneId).first<{ total_agents: number; agents_ok: number; agents_echec: number }>();
  if (updated) {
    const done = (updated.agents_ok + updated.agents_echec);
    if (updated.total_agents > 0 && done >= updated.total_agents) {
      const final = updated.agents_echec === 0 ? 'terminee' : updated.agents_ok === 0 ? 'annulee' : 'partielle';
      await c.env.DB.prepare(`UPDATE campagnes SET statut = ?, termine_le = datetime('now') WHERE id = ?`).bind(final, campagneId).run();
    }
  }

  return c.json({ ok: true });
});

// ── Supprimer une campagne — Super Admin uniquement ────────
campagnesRouter.delete('/:id', superAdminMiddleware, async c => {
  const id = Number(c.req.param('id'));
  const campagne = await c.env.DB.prepare(`SELECT statut, mois FROM campagnes WHERE id = ?`).bind(id).first<{ statut: string; mois: string }>();
  if (!campagne) return c.json({ error: 'Campagne introuvable' }, 404);
  if (campagne.statut === 'en_cours') return c.json({ error: 'Impossible de supprimer une campagne en cours' }, 409);

  try {
    await c.env.DB.prepare(`DELETE FROM transactions WHERE campagne_id = ?`).bind(id).run();
    await c.env.DB.prepare(`DELETE FROM audit_logs WHERE campagne_id = ?`).bind(id).run();
    await c.env.DB.prepare(`DELETE FROM campagnes WHERE id = ?`).bind(id).run();

    await c.env.DB.prepare(`INSERT INTO audit_logs (responsable_id, action, details) VALUES (?, ?, ?)`)
      .bind(Number((c.get('user') as JWTPayload).sub), 'CAMPAGNE_DELETED', JSON.stringify({ id, mois: campagne.mois })).run();

    return c.json({ ok: true, message: `Campagne ${campagne.mois} supprimée` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'Erreur serveur interne', details: msg }, 500);
  }
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
  const budgetAgents   = await c.env.DB.prepare(`SELECT COALESCE(SUM(prix_cfa), 0) as n FROM agents WHERE actif = 1`).first<{ n: number }>();
  const lastCampagne   = await c.env.DB.prepare(`SELECT * FROM campagnes ORDER BY mois DESC LIMIT 1`).first();
  const txStats        = await c.env.DB.prepare(`SELECT statut, COUNT(*) as n FROM transactions GROUP BY statut`).all<{ statut: string; n: number }>();
  return c.json({
    total_agents: totalAgents?.n ?? 0,
    total_campagnes: totalCampagnes?.n ?? 0,
    budget_total_agents: budgetAgents?.n ?? 0,
    last_campagne: lastCampagne,
    transactions_par_statut: txStats.results,
  });
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
