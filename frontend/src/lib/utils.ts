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

export function fmtTelephone(tel: string | null | undefined): string {
  if (!tel) return '—';
  // "242052051040" → "+242 05 205 1040"
  const t = tel.replace(/\D/g, '');
  if (t.startsWith('242') && t.length === 12) {
    return `+242 ${t.slice(3, 5)} ${t.slice(5, 8)} ${t.slice(8)}`;
  }
  return tel;
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
