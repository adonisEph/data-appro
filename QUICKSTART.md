# Démarrage rapide — 5 étapes pour aller en production

## Prérequis en 1 minute
- [ ] Node.js 18+ installé
- [ ] `npm install -g wrangler` puis `wrangler login`
- [ ] Credentials Airtel prêts depuis https://developers.airtel.cg

---

## Étape 1 — Installer
```bash
cd data-appro
npm install
```

## Étape 2 — Créer la base D1
```bash
npx wrangler d1 create data-appro-db
# → Copier l'ID affiché dans worker/wrangler.toml (ligne database_id)
npm run db:init
```

## Étape 3 — Configurer les secrets (seulement 4 !)
```bash
cd worker
npx wrangler secret put AIRTEL_CLIENT_ID      # Client ID (portail Airtel)
npx wrangler secret put AIRTEL_CLIENT_SECRET  # Client Secret
npx wrangler secret put AIRTEL_PIN            # Ton PIN Airtel Money EN CLAIR (ex: 1234)
npx wrangler secret put JWT_SECRET            # openssl rand -base64 40
```

> 💡 x-signature et x-key sont générés **automatiquement** à chaque requête
> par chiffrement RSA-OAEP + AES-256-CBC avec la clé publique Airtel CG.
> Tu n'as rien d'autre à configurer côté sécurité.

## Étape 4 — Créer le premier compte admin
```bash
cd ..
npm run seed:admin
# Répondre aux questions interactives
```

## Étape 5 — Déployer

**Worker API :**
```bash
cd worker && npm install && npx wrangler deploy
```

**Frontend → Cloudflare Pages (via GitHub) :**
1. GitHub Desktop → push sur `main`
2. Cloudflare Dashboard → Pages → Create application → Connect to Git
3. Paramètres de build :
   - **Root directory** : `frontend`
   - **Build command** : `npm run build`
   - **Output directory** : `dist`
   - **Node.js version** : `20`

---

## Test local complet
```bash
npm run dev
# Frontend → http://localhost:5173
# API      → http://localhost:8787
```

---

## ⚠️ À valider avec Airtel avant le premier vrai lancement

1. Confirmer les codes forfaits dans `worker/src/types/index.ts`
2. Confirmer les endpoints API dans `worker/src/services/airtel.ts`
3. Déclarer l'URL webhook : `https://[worker-url]/webhooks/airtel`
4. Faire un test avec **2-3 numéros** avant de lancer les 200

---

## Structure des fichiers clés

| Fichier | Rôle |
|---------|------|
| `worker/src/services/airtel.ts` | Appels API Airtel (token, forfait, argent) |
| `worker/src/services/provisionnement.ts` | Moteur bulk 200 agents |
| `worker/src/services/relance.ts` | Relance des échecs |
| `worker/src/routes/webhooks.ts` | Réception accusés Airtel |
| `worker/src/types/index.ts` | Codes forfaits & montants FCFA |
| `migrations/001_schema.sql` | Schéma complet base de données |
| `docs/AIRTEL_API.md` | Référence API Airtel CG |
| `docs/DEPLOYMENT.md` | Guide déploiement complet |
