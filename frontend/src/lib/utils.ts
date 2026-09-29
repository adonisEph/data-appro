// ============================================================
// Utilitaires de formatage
// ============================================================

import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// ── Dates ─────────────────────────────────────────────────────

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: fr });
  } catch {
    return '—';
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy à HH:mm', { locale: fr });
  } catch {
    return '—';
  }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: fr });
  } catch {
    return '—';
  }
}

export function fmtMois(mois: string): string {
  // "2024-07" → "Juillet 2024"
  try {
    return format(parseISO(mois + '-01'), 'MMMM yyyy', { locale: fr });
  } catch {
    return mois;
  }
}

// ── Devises ───────────────────────────────────────────────────

export function fmtFCFA(montant: number | null | undefined): string {
  if (montant == null) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(montant);
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('fr-FR').format(n);
}

// ── Téléphone ─────────────────────────────────────────────────

// Nettoyer un numéro: retirer préfixe +242/242 et espaces → chiffres locaux uniquement
export function cleanTel(tel: string | null | undefined): string {
  if (!tel) return '';
  let t = tel.replace(/[\s\-+().]/g, '');
  if (t.startsWith('242') && t.length > 9) t = t.slice(3);
  if (t.startsWith('0') && t.length === 10) t = t.slice(1);
  return t;
}

// Chiffres significatifs du numéro — sans indicatif 242 ni 0 initial.
// À utiliser pour les comparaisons et recherches, jamais pour l'affichage.
export function telDigits(tel: string | null | undefined): string {
  let t = (tel ?? '').replace(/\D/g, '');
  if (t.startsWith('242') && t.length > 9) t = t.slice(3);
  if (t.startsWith('0')) t = t.replace(/^0+/, '');
  return t;
}

// Numéro local canonique, toujours préfixé par 0 (ex: "052051040").
// À utiliser pour l'affichage compact, la copie et les exports.
export function telLocal(tel: string | null | undefined): string {
  const d = telDigits(tel);
  return d ? '0' + d : '';
}

// Format affichable, toujours préfixé par 0 : "052051040" → "05 205 1040"
export function fmtTelephone(tel: string | null | undefined): string {
  const local = telLocal(tel);
  if (!local) return '—';
  if (local.length <= 2) return local;
  if (local.length <= 5) return `${local.slice(0, 2)} ${local.slice(2)}`;
  return `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}

// ── Pourcentage ───────────────────────────────────────────────

export function fmtPct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// ── Fichier size ──────────────────────────────────────────────

export function fmtGb(gb: number): string {
  return `${gb} GB`;
}
