# Data Approvisionnement — Airtel CG

Application Professionnelle interne de gestion et d'automatisation des approvisionnements data pour les 200 agents de l'entreprise via l'API Airtel Money Congo Brazzaville.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Cloudflare Workers + Hono |
| Base de données | Cloudflare D1 (SQLite) |
| Hébergement | Cloudflare Pages + Workers  |
| CI/CD | GitHub → Cloudflare (auto-deploy) |

## Structure du projet

```
data-appro/
├── frontend/          # Application React (Cloudflare Pages)
│   ├── src/
│   │   ├── components/   # Composants réutilisables
│   │   ├── pages/        # Vues principales
│   │   ├── hooks/        # Hooks React custom
│   │   ├── lib/          # Utilitaires, client API
│   │   └── types/        # Types TypeScript
│   └── package.json
├── worker/            # API REST (Cloudflare Worker)
│   ├── src/
│   │   ├── routes/       # Endpoints API
│   │   ├── services/     # Logique métier (Airtel, agents…)
│   │   └── middleware/   # Auth, CORS, logs
│   └── wrangler.toml
├── migrations/        # Schéma SQL D1
└── docs/              # Documentation API Airtel
```

## Installation locale

```bash
# 1. Cloner le repo
git clone https://github.com/TON_ORG/data-appro.git
cd data-appro

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp worker/.env.example worker/.env
# → Remplir AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET, JWT_SECRET

# 4. Créer la base de données locale D1
npm run db:init

# 5. Lancer en développement
npm run dev
```

## Déploiement

```bash
# Frontend → Cloudflare Pages (auto via GitHub push)
git push origin main

# Worker → Cloudflare Workers
cd worker && npx wrangler deploy
```

## Rôles & Quotas

| Rôle | Quota mensuel |
|------|---------------|
| Technicien | 6.5 GB |
| Responsable Junior | 14 GB |
| Responsable Senior | 30 GB |
| Manager | 45 GB |

## Provider

- **Airtel CG** — Congo Brazzaville
- Préfixe : +242
- Indices : **05** (ex: 05 XXX XXXX) et **04** (ex: 04 XXX XXXX)
- Portail API : https://developers.airtel.cg
