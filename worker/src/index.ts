// ============================================================
// Data Approvisionnement — Cloudflare Worker Entry Point
// ============================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/index.js';
import api from './routes/api.js';
import webhooks from './routes/webhooks.js';

const app = new Hono<{ Bindings: Env }>();

// CORS — autorise le frontend Cloudflare Pages
app.use('*', cors({
  origin: [
    'http://localhost:5173',
    'https://data-appro.pages.dev',
    // Ajouter ici ton domaine personnalisé si besoin
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Routes API (protégées JWT)
app.route('/api', api);

// Webhooks Airtel (pas de JWT — Airtel appelle directement)
app.route('/webhooks', webhooks);

// 404 par défaut
app.notFound(c => c.json({ error: 'Route introuvable' }, 404));

// Gestion des erreurs globales
app.onError((err, c) => {
  console.error('[Worker Error]', err);
  return c.json({ error: 'Erreur serveur interne', detail: err.message }, 500);
});

export default app;
