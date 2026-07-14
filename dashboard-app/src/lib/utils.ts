import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className join. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Compact integer: 1234 → 1.2k, 3_400_000 → 3.4M, 1.8e10 → 18.0B. */
export function fmtNum(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(Math.round(v));
}

/** USD: <$1000 → 2dp, else 0dp. */
export function fmtUsd(n: number): string {
  const v = Number(n) || 0;
  return '$' + (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2));
}

/** ms → "1h 12m" / "8m" / "42s". */
export function fmtDuration(ms: number): string {
  const s = Math.round((Number(ms) || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
export const fmtDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
export const shortProject = (p?: string | null) => (p ? p.split('/').filter(Boolean).pop() || p : '—');
