// ============================================================
// Middleware Auth — Vérification JWT
// ============================================================

import type { Context, Next } from 'hono';
import type { Env, JWTPayload } from '../types/index.js';

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Non autorisé — token manquant' }, 401);
  }

  const token = auth.slice(7);

  try {
    // Décodage JWT manuel (jose non dispo en edge, on utilise la Web Crypto API)
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) throw new Error('Token malformé');

    // Vérification signature HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(c.env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const data = encoder.encode(`${header}.${payload}`);
    const sig = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, data);

    if (!valid) throw new Error('Signature invalide');

    const decoded = JSON.parse(atob(payload)) as JWTPayload;

    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return c.json({ error: 'Token expiré' }, 401);
    }

    c.set('user', decoded);
    await next();
  } catch (err) {
    return c.json({ error: 'Token invalide' }, 401);
  }
}

// --- Génère un JWT (utilisé lors du login) ---
export async function generateJWT(
  secret: string,
  payload: Omit<JWTPayload, 'iat' | 'exp'>
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = btoa(JSON.stringify({ ...payload, iat: now, exp: now + 86400 * 7 }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${fullPayload}`));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${header}.${fullPayload}.${sig}`;
}
