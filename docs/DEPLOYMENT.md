# Guide de déploiement — Data Approvisionnement

## Prérequis
- Node.js 18+
- Compte Cloudflare (gratuit suffit)
- Compte GitHub + GitHub Desktop
- Windsurf (IDE)
- Credentials Airtel : https://developers.airtel.cg

---

## Étape 1 — Cloner et ouvrir dans Windsurf

```bash
git clone https://github.com/TON_ORG/data-appro.git
cd data-appro
```

Ouvrir le dossier `data-appro` dans Windsurf.

---

## Étape 2 — Installer les dépendances

```bash
npm install
```

---

## Étape 3 — Créer la base de données D1 sur Cloudflare

```bash
# Connexion à Cloudflare
npx wrangler login

# Créer la base
npx wrangler d1 create data-appro-db
```

→ Copier l'ID retourné et le coller dans `worker/wrangler.toml` :
```toml
database_id = "COLLER_L_ID_ICI"
```

---

## Étape 4 — Appliquer le schéma SQL

```bash
# En local (développement)
npx wrangler d1 execute data-appro-db --local --file=migrations/001_schema.sql

# En production (Cloudflare)
npx wrangler d1 execute data-appro-db --file=migrations/001_schema.sql
```

---

## Étape 5 — Configurer les secrets du Worker

```bash
cd worker

npx wrangler secret put AIRTEL_CLIENT_ID
# → Entrer ton Client ID Airtel

npx wrangler secret put AIRTEL_CLIENT_SECRET
# → Entrer ton Client Secret Airtel

npx wrangler secret put JWT_SECRET
# → Entrer une longue chaîne aléatoire (min 32 chars)
# Exemple pour générer : openssl rand -base64 40
```

---

## Étape 6 — Créer le premier responsable (admin)

Après la migration SQL, insérer manuellement le premier compte :

```bash
# Générer le hash du mot de passe (SHA-256 + ID)
# Le responsable aura l'ID = 1, donc password_hash = SHA256(motdepasse + "1")
# Utiliser ce script Node pour générer le hash :

node -e "
const crypto = require('crypto');
const password = 'TonMotDePasse';
const id = 1;
const hash = crypto.createHash('sha256').update(password + id).digest('base64');
console.log('Hash:', hash);
"
```

```sql
-- Insérer l'agent responsable
INSERT INTO agents (nom, prenom, telephone, role, quota_gb)
VALUES ('Nom', 'Prénom', '242XXXXXXXXX', 'manager', 45);

-- Insérer le compte responsable
INSERT INTO responsables (agent_id, email, password_hash)
VALUES (1, 'email@entreprise.com', 'HASH_GENERE_CI_DESSUS');
```

```bash
# Exécuter en local
npx wrangler d1 execute data-appro-db --local --command="INSERT INTO agents ..."

# Exécuter en production
npx wrangler d1 execute data-appro-db --command="INSERT INTO agents ..."
```

---

## Étape 7 — Tester en local

```bash
# Dans le dossier racine, lancer les deux serveurs
npm run dev

# Frontend : http://localhost:5173
# Worker   : http://localhost:8787
```

---

## Étape 8 — Déployer sur Cloudflare

### Worker (API)
```bash
cd worker
npx wrangler deploy
```
→ Note l'URL du worker : `https://data-appro-worker.TON_COMPTE.workers.dev`

### Frontend (Pages)

**Via GitHub (recommandé) :**
1. Pusher le code sur GitHub via GitHub Desktop
2. Connecter le repo sur https://dash.cloudflare.com → Pages → Create application
3. Configurer le build **exactement** comme suit :

| Paramètre | Valeur |
|-----------|--------|
| Framework preset | None (ou Vite) |
| **Root directory** | `frontend` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| Node.js version | 20 |

> ⚠️ Le champ "Root directory" = `frontend` est crucial.
> Cloudflare se placera dans ce dossier avant d'exécuter le build.

**Via CLI :**
```bash
cd frontend
npm install && npm run build
npx wrangler pages deploy dist --project-name=data-appro
```

---

## Étape 9 — Configurer le CORS (URL finale)

Dans `worker/src/index.ts`, ajouter l'URL de ton Pages :
```typescript
origin: [
  'http://localhost:5173',
  'https://data-appro.pages.dev',         // ← URL Pages auto
  'https://ton-domaine-custom.com',        // ← Si domaine perso
],
```

Redéployer le worker.

---

## Structure des URLs Airtel à valider

Vérifier sur https://developers.airtel.cg que ces endpoints correspondent :

| Action | Méthode | Endpoint |
|--------|---------|----------|
| Auth Token | POST | `/auth/oauth2/token` |
| Forfait internet | POST | `/standard/v1/subscribers/data/bundle/buy` |
| Envoi d'argent B2C | POST | `/standard/v1/disbursements/` |
| Statut transaction | GET | `/standard/v1/payments/{id}` |

⚠️ Si les endpoints diffèrent, modifier `worker/src/services/airtel.ts`

---

## Codes forfaits Airtel à configurer

Dans `worker/src/types/index.ts`, adapter les codes selon la documentation Airtel CG :

```typescript
export const FORFAIT_CODES: Record<Role, string> = {
  technicien:          'DATA_6500MB_30J',    // ← À vérifier avec Airtel
  responsable_junior:  'DATA_14GB_30J',       // ← À vérifier avec Airtel
  responsable_senior:  'DATA_30GB_30J',       // ← À vérifier avec Airtel
  manager:             'DATA_45GB_30J',       // ← À vérifier avec Airtel
};
```

---

## Checklist finale avant go-live

- [ ] D1 créée et schéma appliqué en production
- [ ] Secrets Airtel configurés via `wrangler secret`
- [ ] Premier compte responsable créé en base
- [ ] Test connexion login fonctionne
- [ ] Codes forfaits Airtel validés
- [ ] CORS configuré avec l'URL Pages finale
- [ ] Import fichier Excel testé avec vrais numéros
- [ ] Test campagne avec 2-3 numéros avant lancement des 200
