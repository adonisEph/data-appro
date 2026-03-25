// ============================================================
// Service Airtel Money CG — Chiffrement RSA+AES natif
// POST /standard/v3/disbursements
// POST /auth/oauth2/token (expire en 180s)
//
// Schéma de sécurité Airtel v3 :
//   1. Générer une clé AES-256 aléatoire
//   2. x-key       = AES key chiffrée avec la clé publique RSA Airtel (PKCS#1 v1.5 ou OAEP)
//   3. x-signature = body JSON chiffré avec la clé AES (AES-256-CBC, IV aléatoire préfixé)
//   4. pin (dans body) = PIN Airtel chiffré avec la clé publique RSA Airtel
// ============================================================

import type { Env } from '../types/index.js';

// ── Clé publique RSA Airtel CG (fournie dans le portail) ─────
// Utilisée pour chiffrer la clé AES et le PIN
const AIRTEL_RSA_PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArUj2SQKLCdTqJ3/ZL6nk\
h1N3rtjXBBM+0hBUrhJ/VNSMTBixpD+JjeNaHbONcrvJGSstC2tcVfD04s9xGIKr\
9TT6hCYaqGojLeuLimVdXzaP5DzDyrHY8mYgHL+/EGRDh+/7B56Gw8UZxOBPtF6W\
jjq0TWGcw5YOW1lSPUeaD+kupmDFlMRk26fASELwkYo5NkHgL/w+XzXw8gDZtrNS\
6L8UX2mfqdQ9qKpdMP3ztfOUPjmTvIbTKrGLx0U2sUSQINtMxZQzsYaXIGoZ2thv\
bIhJMDFBNbznuv1n8b03Q3MAnEK/xCduQBUkUg1syy7jZMT4ETDeFuW2NMZhteaad\
wIDAQAB`;

// ── Cache token (expire en 180s !) ────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getAirtelToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;

  const res = await fetch(`${env.AIRTEL_BASE_URL}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
    body: JSON.stringify({
      client_id:     env.AIRTEL_CLIENT_ID,
      client_secret: env.AIRTEL_CLIENT_SECRET,
      grant_type:    'client_credentials',
    }),
  });

  if (!res.ok) throw new Error(`Airtel auth ${res.status}: ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: string | number };
  if (!data.access_token) throw new Error('Airtel: access_token absent');

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in) || 150) * 1000;
  return cachedToken;
}

// ── Importer la clé publique RSA ─────────────────────────────
async function importRsaPublicKey(): Promise<CryptoKey> {
  const b64 = AIRTEL_RSA_PUBLIC_KEY.replace(/\s+/g, '');
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'spki',            // SubjectPublicKeyInfo — format PEM base64 sans header/footer
    bin.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

// ── Chiffrer avec RSA-OAEP (PIN et AES key) ──────────────────
async function rsaEncrypt(rsaKey: CryptoKey, data: Uint8Array): Promise<string> {
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, ab);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// ── Chiffrer le body avec AES-256-CBC ────────────────────────
// Format : IV (16 bytes) | ciphertext
async function aesEncryptBody(aesKey: CryptoKey, bodyJson: string): Promise<string> {
  const iv        = crypto.getRandomValues(new Uint8Array(16));
  const encoder   = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    aesKey,
    encoder.encode(bodyJson)
  );
  // Concaténer IV + ciphertext et encoder en base64
  const combined = new Uint8Array(16 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 16);
  return btoa(String.fromCharCode(...combined));
}

// ── Construire les headers de sécurité v3 ────────────────────
async function buildSecurityHeaders(
  bodyJson: string,
  airtelPin: string  // PIN Airtel Money en clair (depuis env)
): Promise<{ xKey: string; xSignature: string; encryptedPin: string }> {
  const rsaKey = await importRsaPublicKey();

  // 1. Générer une clé AES-256 aléatoire
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-CBC', length: 256 },
    true,   // extractable = true pour pouvoir exporter les bytes
    ['encrypt']
  );

  // 2. Exporter la clé AES brute
  const rawAes = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));

  // 3. x-key = AES key chiffrée RSA
  const xKey = await rsaEncrypt(rsaKey, rawAes);

  // 4. x-signature = body chiffré AES
  const xSignature = await aesEncryptBody(aesKey, bodyJson);

  // 5. PIN chiffré RSA
  const encoder     = new TextEncoder();
  const encryptedPin = await rsaEncrypt(rsaKey, encoder.encode(airtelPin));

  return { xKey, xSignature, encryptedPin };
}

// ── Types réponse Airtel ──────────────────────────────────────
export interface AirtelDisbursementResponse {
  data?: {
    transaction?: {
      reference_id?: string;
      airtel_money_id?: string;
      id?: string;
      status?: string;   // "TS" = Transaction Successful
      message?: string;
    };
  };
  status?: {
    response_code?: string;
    code?: string;
    success?: boolean;
    message?: string;
    result_code?: string;
  };
}

// ── Envoi d'argent — POST /standard/v3/disbursements ─────────
export async function envoyerArgent(
  env: Env,
  telephone: string,
  montantFcfa: number,
  reference: string,
  transactionId: string
): Promise<AirtelDisbursementResponse> {
  const token  = await getAirtelToken(env);
  const msisdn = normalizeMsisdn(telephone);

  // Body avant chiffrement
  const bodyObj = {
    payee: { msisdn, wallet_type: 'SALARY' },
    reference,
    pin: '__PIN_PLACEHOLDER__',   // sera remplacé ci-dessous
    transaction: { amount: montantFcfa, id: transactionId, type: 'B2B' },
  };

  // Construire les headers de sécurité (PIN chiffré + AES key + signature)
  const bodyJsonForSig    = JSON.stringify({ ...bodyObj, pin: env.AIRTEL_PIN });
  const { xKey, xSignature, encryptedPin } = await buildSecurityHeaders(
    bodyJsonForSig,
    env.AIRTEL_PIN   // PIN en clair depuis les secrets Wrangler
  );

  // Body final avec PIN chiffré
  const finalBody = JSON.stringify({ ...bodyObj, pin: encryptedPin });

  const res = await fetch(`${env.AIRTEL_BASE_URL}/standard/v3/disbursements`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        '*/*',
      'X-Country':     env.AIRTEL_COUNTRY_CODE,
      'X-Currency':    env.AIRTEL_CURRENCY,
      'Authorization': `Bearer ${token}`,
      'x-key':         xKey,
      'x-signature':   xSignature,
    },
    body: finalBody,
  });

  const raw = await res.text();
  let data: AirtelDisbursementResponse;
  try { data = JSON.parse(raw) as AirtelDisbursementResponse; }
  catch { throw new Error(`Airtel réponse non-JSON (${res.status}): ${raw.slice(0, 300)}`); }

  console.log(`[Airtel] ${msisdn} ${montantFcfa}XAF → ${data.status?.message ?? '?'} / ${data.data?.transaction?.status ?? '?'}`);
  return data;
}

// ── Vérification statut ───────────────────────────────────────
export async function verifierTransaction(
  env: Env,
  transactionId: string
): Promise<AirtelDisbursementResponse> {
  const token = await getAirtelToken(env);
  const res = await fetch(
    `${env.AIRTEL_BASE_URL}/standard/v3/disbursements/${transactionId}`,
    { headers: { 'Authorization': `Bearer ${token}`, 'X-Country': env.AIRTEL_COUNTRY_CODE, 'X-Currency': env.AIRTEL_CURRENCY, 'Accept': '*/*' } }
  );
  const raw = await res.text();
  try { return JSON.parse(raw) as AirtelDisbursementResponse; }
  catch { return { status: { success: false, message: raw.slice(0, 200) } }; }
}

// ── Succès Airtel CG ──────────────────────────────────────────
export function isAirtelSuccess(r: AirtelDisbursementResponse): boolean {
  if (r.status?.success === true) return true;
  if (r.data?.transaction?.status === 'TS') return true;
  if (r.data?.transaction?.status === 'SUCCESS') return true;
  if (r.status?.code === '200' && r.status?.message === 'SUCCESS') return true;
  return false;
}

// ── Normalisation MSISDN +242 ─────────────────────────────────
export function normalizeMsisdn(telephone: string): string {
  let n = telephone.replace(/[\s\-+().]/g, '');
  if (/^242\d{9}$/.test(n)) return n;
  if (/^0[45]\d{7}$/.test(n)) return '242' + n;
  if (/^[45]\d{7}$/.test(n)) return '2420' + n;
  if (/^\d{8}$/.test(n)) return '2420' + n;
  return '242' + n;
}

// ── ID de transaction unique ──────────────────────────────────
export function genTransactionId(agentId: number, campagneId: number): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `APPRO-${campagneId}-${agentId}-${ts}-${rand}`;
}
