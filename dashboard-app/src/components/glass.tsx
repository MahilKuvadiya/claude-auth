import { ReactNode, useRef, PointerEvent } from 'react';

/** Liquid-glass panel with a pointer-tracked specular highlight. */
export function GlassPanel({ children, className = '', spec = true }: { children: ReactNode; className?: string; spec?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  return (
    <div ref={ref} onPointerMove={spec ? onMove : undefined} className={`glass ${spec ? 'glass-spec' : ''} ${className}`}>
      {children}
    </div>
  );
}

/** Content card on a solid surface (charts/tables/text — NOT glass, for legibility). */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-glass border border-hairline bg-surface-2 p-5 ${className}`} style={{ borderRadius: 20 }}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: string }) {
  return (
    <GlassPanel className="p-[18px]">
      <div className="font-mono text-[.66rem] uppercase tracking-[.1em] text-accent">{label}</div>
      <div className="mt-[10px] mb-[2px] text-[1.85rem] tracking-[-.03em] tnum">
        {value}
        {unit && <span className="text-[.9rem] font-medium text-ink-faint">{unit}</span>}
      </div>
      {sub && <div className="text-[.82rem] text-ink-soft">{sub}</div>}
    </GlassPanel>
  );
}

export function Meter({ pct, warn = false }: { pct: number; warn?: boolean }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <span className="inline-block h-[7px] w-[88px] overflow-hidden rounded-full align-middle" style={{ background: 'var(--track)' }}>
      <span className="block h-full rounded-full" style={{ width: `${w}%`, background: warn ? 'var(--warn)' : 'var(--accent)' }} />
    </span>
  );
}

export function Pill({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'warn' }) {
  const c = tone === 'warn' ? { color: 'var(--warn)', background: 'var(--warn-wash)' } : { color: 'var(--accent)', background: 'var(--accent-wash)' };
  return <span className="rounded-full px-[9px] py-[4px] font-mono text-[.64rem] uppercase tracking-[.06em]" style={c}>{children}</span>;
}

export function Button({ children, onClick, variant = 'primary', disabled, type }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const base = 'inline-flex items-center gap-2 rounded-xl px-4 py-[9px] text-[.86rem] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = variant === 'primary'
    ? { background: 'var(--accent)', color: '#fff' }
    : variant === 'danger'
    ? { background: 'var(--warn-wash)', color: 'var(--warn)', border: '1px solid var(--hairline)' }
    : { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--hairline)' };
  return <button type={type || 'button'} onClick={onClick} disabled={disabled} className={base} style={styles}>{children}</button>;
}

export function GlassModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(0,0,0,.35)' }} onClick={onClose}>
      <GlassPanel className="w-full max-w-[520px] p-6" spec={false}>
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="m-0 text-[1.05rem] font-semibold">{title}</h3>
            <button onClick={onClose} className="text-ink-faint" aria-label="Close">✕</button>
          </div>
          {children}
        </div>
      </GlassPanel>
    </div>
  );
}

// state primitives — no mock data ever renders in their place
export const Skeleton = ({ h = 20, w = '100%' }: { h?: number; w?: number | string }) => (
  <div className="animate-pulse rounded-md" style={{ height: h, width: w, background: 'var(--track)' }} />
);

export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <Card>
      <div className="text-[.9rem]" style={{ color: 'var(--warn)' }}>Couldn't load this. {error}</div>
      {retry && <div className="mt-3"><Button variant="ghost" onClick={retry}>Retry</Button></div>}
    </Card>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="text-center">
      <div className="py-8">
        <div className="text-[1.05rem] font-semibold">{title}</div>
        {hint && <div className="mt-2 text-[.9rem] text-ink-soft">{hint}</div>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </Card>
  );
}
