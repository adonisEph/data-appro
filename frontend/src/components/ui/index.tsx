import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import type { StatutCampagne, StatutTransaction, Role } from '../../types';
import { STATUT_LABELS, TX_STATUT_LABELS, ROLE_LABELS } from '../../types';

// ── Button ─────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2',
        {
          'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 active:scale-95':
            variant === 'primary',
          'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-brand-500 active:scale-95':
            variant === 'secondary',
          'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:scale-95':
            variant === 'danger',
          'text-gray-600 hover:bg-gray-100 focus:ring-gray-400':
            variant === 'ghost',
          'px-2.5 py-1.5 text-xs': size === 'sm',
          'px-4 py-2 text-sm':     size === 'md',
          'px-6 py-3 text-base':   size === 'lg',
          'opacity-60 cursor-not-allowed': disabled || loading,
        },
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  );
}

// ── Spinner ─────────────────────────────────────────────────

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <svg
      className={clsx('animate-spin', className, {
        'h-4 w-4': size === 'sm',
        'h-6 w-6': size === 'md',
        'h-8 w-8': size === 'lg',
      })}
      fill="none" viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Card ────────────────────────────────────────────────────

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm', className)}>
      {children}
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────

export function StatCard({
  label, value, sub, icon, color = 'indigo',
}: {
  label: string; value: string | number; sub?: string; icon?: ReactNode; color?: string;
}) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green:  'bg-green-50 text-green-600',
    amber:  'bg-amber-50 text-amber-600',
    red:    'bg-red-50 text-red-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {icon && (
          <span className={clsx('p-2 rounded-lg', colors[color] ?? colors['indigo'])}>{icon}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Card>
  );
}

// ── Badge ────────────────────────────────────────────────────

export function CampagneBadge({ statut }: { statut: StatutCampagne }) {
  const styles: Record<StatutCampagne, string> = {
    brouillon:  'bg-gray-100 text-gray-700',
    en_cours:   'bg-blue-100 text-blue-700 animate-pulse',
    terminee:   'bg-green-100 text-green-700',
    partielle:  'bg-amber-100 text-amber-700',
    annulee:    'bg-red-100 text-red-700',
  };
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', styles[statut])}>
      {STATUT_LABELS[statut]}
    </span>
  );
}

export function TxBadge({ statut }: { statut: StatutTransaction }) {
  const styles: Record<StatutTransaction, string> = {
    en_attente:       'bg-gray-100 text-gray-600',
    envoye:           'bg-blue-100 text-blue-700',
    confirme:         'bg-green-100 text-green-700',
    echec:            'bg-red-100 text-red-700',
    double_detected:  'bg-orange-100 text-orange-700',
  };
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', styles[statut])}>
      {TX_STATUT_LABELS[statut]}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    technicien:          'bg-slate-100 text-slate-700',
    responsable_junior:  'bg-sky-100 text-sky-700',
    responsable_senior:  'bg-violet-100 text-violet-700',
    manager:             'bg-amber-100 text-amber-700',
  };
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', styles[role])}>
      {ROLE_LABELS[role]}
    </span>
  );
}

// ── Modal ────────────────────────────────────────────────────

export function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-lg shadow-xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">
          {children}
        </div>
      </Card>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────

export function EmptyState({ title, description, action }: {
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ── ProgressBar ───────────────────────────────────────────────

export function ProgressBar({ value, max, color = 'indigo' }: {
  value: number; max: number; color?: 'indigo' | 'green' | 'red' | 'amber';
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const colorMap = {
    indigo: 'bg-indigo-500',
    green:  'bg-green-500',
    red:    'bg-red-500',
    amber:  'bg-amber-500',
  };
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className={clsx('h-2 rounded-full transition-all duration-500', colorMap[color])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
