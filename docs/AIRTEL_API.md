# Documentation API Airtel Money — Congo Brazzaville

> Portail développeur : https://developers.airtel.cg
> Portail UAT (tests)  : https://openapiuat.airtel.cg
> Préfixe pays : +242 | Code pays : CG | Devise : XAF (FCFA)

---

## URL des environnements

| Env | Base URL |
|-----|----------|
| **UAT (tests)** | `https://openapiuat.airtel.cg` |
| **Production** | `https://openapi.airtel.cg` |

⚠️ Commencer impérativement par UAT avant de passer en production.

---

## 1. Authentification OAuth2

```
POST /auth/oauth2/token
Content-Type: application/json
Accept: */*

Body :
{
  "client_id": "ton_client_id",
  "client_secret": "ton_client_secret",
  "grant_type": "client_credentials"
}
```

**Réponse :**
```json
{
  "access_token": "...",
  "expires_in": "180",
  "token_type": "bearer"
}
```

⚠️ **`expires_in` = 180 secondes (3 minutes seulement)**
Le service renouvelle le token automatiquement 30s avant expiration.

---

## 2. Envoi d'argent — Disbursement v3

```
POST /standard/v3/disbursements
Content-Type: application/json
Accept: */*
X-Country: CG
X-Currency: XAF
Authorization: Bearer {access_token}
x-signature: {valeur fournie par Airtel dans le portail}
x-key: {valeur fournie par Airtel dans le portail}

Body :
{
  "payee": {
    "msisdn": "242055301273",
    "wallet_type": "SALARY"
  },
  "reference": "APPRO-2024-07-42",
  "pin": "{pin_chiffré_fourni_par_airtel}",
  "transaction": {
    "amount": 5500,
    "id": "APPRO-1-42-ABC123",
    "type": "B2B"
  }
}
```

**Réponse succès :**
```json
{
  "data": {
    "transaction": {
      "reference_id": "APC...",
      "airtel_money_id": "product-partner-...",
      "id": "APPRO-1-42-ABC123",
      "status": "TS",
      "message": "Transaction Successful"
    }
  },
  "status": {
    "response_code": "DP00900001001",
    "code": "200",
    "success": true,
    "message": "SUCCESS"
  }
}
```

**Codes statut transaction :**

| Code | Signification |
|------|---------------|
| `TS` | Transaction Successful ✅ |
| `TF` | Transaction Failed ❌ |
| `TA` | Transaction Ambiguous ⚠️ |
| `TIP` | Transaction In Progress ⏳ |

---

## 3. Secrets à configurer dans Wrangler

```bash
npx wrangler secret put AIRTEL_CLIENT_ID      # Client ID portail Airtel
npx wrangler secret put AIRTEL_CLIENT_SECRET  # Client Secret
npx wrangler secret put AIRTEL_PIN            # PIN Airtel Money EN CLAIR (ex: 1234)
npx wrangler secret put JWT_SECRET            # openssl rand -base64 40
```

### Chiffrement automatique RSA+AES

Les headers `x-signature` et `x-key` sont **calculés automatiquement** à chaque requête
par le service `worker/src/services/airtel.ts` :

1. Une clé AES-256 aléatoire est générée
2. `x-key` = cette clé AES chiffrée avec la clé publique RSA Airtel CG (embarquée dans le code)
3. `x-signature` = le body JSON chiffré avec cette clé AES (AES-256-CBC)
4. `pin` dans le body = le PIN saisi chiffré RSA-OAEP

La clé publique RSA Airtel CG est déjà intégrée dans `services/airtel.ts`.
Si Airtel change de clé, mettre à jour la constante `AIRTEL_RSA_PUBLIC_KEY`.

---

## 4. Format MSISDN

Les numéros sont normalisés automatiquement :

| Format fichier Excel | Format envoyé à Airtel |
|---------------------|----------------------|
| `55301273` (8 chiffres) | `242055301273` |
| `40016103` (8 chiffres) | `242040016103` |
| `052051040` (9 chiffres) | `242052051040` |
| `+242052051040` | `242052051040` |

---

## 5. Montants FCFA par agent

Les montants sont lus **directement depuis le fichier Excel** (colonne `PRIX CFA`),
stockés sur chaque agent en base et utilisés au moment du provisionnement.

Exemple observé : **6.5 GB → 5 500 FCFA**

Pour les agents sans prix_cfa défini, fallback par rôle :

| Rôle | Quota | Montant fallback |
|------|-------|-----------------|
| Technicien | 6.5 GB | 5 500 FCFA |
| Resp. Junior | 14 GB | 9 000 FCFA |
| Resp. Sénior | 30 GB | 15 000 FCFA |
| Manager | 45 GB | 22 000 FCFA |

---

## 6. URL Webhook à déclarer

```
https://[ton-worker].workers.dev/webhooks/airtel
```

Déclarer cette URL dans le portail `developers.airtel.cg` pour recevoir
les confirmations asynchrones de chaque transaction.
