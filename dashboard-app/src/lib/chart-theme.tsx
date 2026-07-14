import type { ReactNode } from 'react';

// Ported from Atlas-HR-Dashboard chart-theme.tsx — the canonical devx teal scale + the
// shared recharts styling helpers. Axes/grid/tooltip read CSS tokens via var(--…) so
// charts auto-match the theme; fills are flat brand colors and animation is off.

export const TEAL_SCALE = ['#A2D7D4', '#7AC2BC', '#52A39D', '#2E847E', '#1A6E68', '#055F59', '#034A45', '#002925'];

export const REPORT_COLORS = {
  primary: '#1D9E75',
  deep: '#0F6E56',
  positive: '#97C459',
  negative: '#F5585E',
  warning: '#fbbf24',
  neutral: '#a8a29e',
} as const;

/** Interpolate the teal scale across N categories. */
export function tealSpread(n: number): string[] {
  if (n <= 1) return [TEAL_SCALE[2]];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(TEAL_SCALE[Math.round(t * (TEAL_SCALE.length - 1))]);
  }
  return out;
}

export const CHART_HEIGHT = 260;
export const CHART_MARGIN = { top: 8, right: 12, left: 6, bottom: 0 };
export const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' };
export const GRID_STROKE = 'var(--border)';
export const TOOLTIP_CURSOR = { fill: 'var(--muted)', opacity: 0.4 };

/** Keeps a chart card's height stable during load/empty so layout never jumps. */
export function ChartState({ isLoading, isEmpty, emptyLabel = 'No data in this range', height = CHART_HEIGHT }:
  { isLoading?: boolean; isEmpty?: boolean; emptyLabel?: string; height?: number }) {
  return (
    <div className="grid place-items-center text-[.82rem] text-muted-foreground" style={{ height }}>
      {isLoading ? 'Loading…' : isEmpty ? emptyLabel : null}
    </div>
  );
}

type TooltipRow = { name?: string; value?: number | string; color?: string; dataKey?: string };

/** Card-styled recharts tooltip matching the popover surface. */
export function ReportTooltip({ active, payload, label, unit, valueFormatter, footer }:
  {
    active?: boolean; payload?: TooltipRow[]; label?: string; unit?: string;
    valueFormatter?: (v: number) => string; footer?: ReactNode;
  }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-[.78rem] shadow-md">
      {label != null && <div className="mb-1 font-medium text-foreground">{label}</div>}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 tabular-nums">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || 'var(--primary)' }} />
            <span className="text-muted-foreground">{p.name || p.dataKey}</span>
            <span className="ml-auto font-medium text-foreground">
              {valueFormatter && typeof p.value === 'number' ? valueFormatter(p.value) : String(p.value)}{unit ? ` ${unit}` : ''}
            </span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1 border-t border-border pt-1 text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** Right-aligned single-line Y-axis category tick. */
export function CategoryTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
      {payload?.value}
    </text>
  );
}
