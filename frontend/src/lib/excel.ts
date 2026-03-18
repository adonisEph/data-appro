// ============================================================
// Utilitaire import Excel → agents JSON
// Colonnes attendues : N° | NUMERO | NOUVELLE OFFRE / Airtel MONEY | PRIX CFA
// ============================================================

import * as XLSX from 'xlsx';
import type { Role } from '../types';

export interface AgentImportRow {
  nom: string;
  prenom: string;
  telephone: string;
  role: Role;
  quota_gb: number;
  prix_cfa: number;
  forfait_label: string; // ex: "6.5GB"
  erreur?: string;
}

// ── Mapping forfait GB → rôle ────────────────────────────────
// Sera mis à jour dès réception des codes Airtel exacts
const GB_TO_ROLE: Array<{ min: number; max: number; role: Role }> = [
  { min: 6,  max: 7,  role: 'technicien' },          // 6.5 GB
  { min: 13, max: 16, role: 'responsable_junior' },   // 14 GB
  { min: 28, max: 32, role: 'responsable_senior' },   // 30 GB
  { min: 44, max: 46, role: 'manager' },              // 45 GB
];

function gbToRole(gbStr: string): { role: Role; quota_gb: number } | null {
  // Extraire le nombre depuis "6.5GB", "6,5 GB", "14 GB", "30GB", etc.
  const match = String(gbStr).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*[Gg][Bb]?/);
  if (!match || !match[1]) return null;
  const gb = parseFloat(match[1]);

  for (const r of GB_TO_ROLE) {
    if (gb >= r.min && gb <= r.max) {
      return { role: r.role, quota_gb: gb };
    }
  }
  return null;
}

// ── Normalisation numéro +242 ────────────────────────────────
// Exemples fichier Airtel CG :
//   55301273   (8 chiffres, sans le 0) → 242055301273
//   40016103   (8 chiffres, sans le 0) → 242040016103
//   052051040  (9 chiffres avec 0)     → 242052051040
function normalizeTel(raw: string | number): string {
  let t = String(raw).replace(/[\s\-().+]/g, '');
  if (/^242\d{9}$/.test(t)) return t;            // Déjà au bon format
  if (/^0[45]\d{7}$/.test(t)) return '242' + t;  // 9 chiffres avec 0 initial (05xxx, 04xxx)
  if (/^[45]\d{7}$/.test(t)) return '2420' + t;  // 8 chiffres commençant par 5 ou 4
  if (/^\d{8}$/.test(t)) return '2420' + t;       // 8 chiffres autres
  return '242' + t;
}

// ── Détection automatique des colonnes ───────────────────────
function findCol(headers: string[], patterns: string[]): string | null {
  const normalized = headers.map(h => h.toLowerCase().trim()
    .replace(/[°\s\/\-_éèêëàâù]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  );
  for (const pat of patterns) {
    const idx = normalized.findIndex(h => h.includes(pat.toLowerCase()));
    if (idx !== -1) return headers[idx] ?? null;
  }
  return null;
}

const COL_NUMERO  = ['numero', 'number', 'telephone', 'tel', 'phone', 'mobile', 'num ro'];
const COL_FORFAIT = ['offre', 'airtel money', 'nouvelle offre', 'data', 'forfait', 'bundle', 'gb', 'go'];
const COL_PRIX    = ['prix', 'montant', 'cfa', 'fcfa', 'cout', 'tarif', 'price'];
const COL_NOM     = ['nom', 'name', 'lastname', 'last name'];
const COL_PRENOM  = ['prenom', 'pr nom', 'firstname', 'first name'];

export function parseExcelFile(file: File): Promise<{
  agents: AgentImportRow[];
  errors: string[];
  total: number;
  summary: Record<Role, number>;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]!];
        if (!sheet) throw new Error('Feuille Excel introuvable');

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        if (rows.length === 0) throw new Error('Fichier Excel vide');

        const headers = Object.keys(rows[0]!);

        // Détection des colonnes
        const colNumero  = findCol(headers, COL_NUMERO);
        const colForfait = findCol(headers, COL_FORFAIT);
        const colPrix    = findCol(headers, COL_PRIX);
        const colNom     = findCol(headers, COL_NOM);
        const colPrenom  = findCol(headers, COL_PRENOM);

        if (!colNumero)  throw new Error(`Colonne NUMERO introuvable. Colonnes trouvées : ${headers.join(', ')}`);
        if (!colForfait) throw new Error(`Colonne OFFRE/GB introuvable. Colonnes trouvées : ${headers.join(', ')}`);

        const agents: AgentImportRow[] = [];
        const errors: string[] = [];
        const summary: Record<Role, number> = {
          technicien: 0,
          responsable_junior: 0,
          responsable_senior: 0,
          manager: 0,
        };

        rows.forEach((row, i) => {
          const lineNum = i + 2;

          const rawNumero  = colNumero  ? String(row[colNumero]  ?? '').trim() : '';
          const rawForfait = colForfait ? String(row[colForfait] ?? '').trim() : '';
          const rawPrix    = colPrix    ? String(row[colPrix]    ?? '').replace(/[\s\u00a0]/g, '').replace(',', '.') : '0';
          const rawNom     = colNom     ? String(row[colNom]     ?? '').trim() : '';
          const rawPrenom  = colPrenom  ? String(row[colPrenom]  ?? '').trim() : '';

          // Ignorer lignes vides
          if (!rawNumero && !rawForfait) return;

          if (!rawNumero) {
            errors.push(`Ligne ${lineNum} : numéro manquant`);
            return;
          }

          const telephone = normalizeTel(rawNumero);

          if (telephone.length < 11) {
            errors.push(`Ligne ${lineNum} : numéro "${rawNumero}" invalide (trop court)`);
            return;
          }

          if (!rawForfait) {
            errors.push(`Ligne ${lineNum} (${rawNumero}) : forfait manquant`);
            return;
          }

          const roleInfo = gbToRole(rawForfait);
          if (!roleInfo) {
            errors.push(`Ligne ${lineNum} (${rawNumero}) : forfait "${rawForfait}" non reconnu. Formats acceptés : 6.5GB, 14GB, 30GB, 45GB`);
            return;
          }

          const prix = parseFloat(rawPrix) || 0;

          agents.push({
            nom:           rawNom     || `Agent_${lineNum}`,
            prenom:        rawPrenom  || '',
            telephone,
            role:          roleInfo.role,
            quota_gb:      roleInfo.quota_gb,
            prix_cfa:      prix,
            forfait_label: rawForfait,
          });

          summary[roleInfo.role]++;
        });

        resolve({ agents, errors, total: rows.length, summary });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsArrayBuffer(file);
  });
}
