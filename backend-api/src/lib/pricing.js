// Approximate public list prices (USD per 1M tokens) by model family. Used to derive a
// session's costUsd from its token breakdown. Rates are best-effort for reporting, not billing.
const RATES = {
  opus:   { in: 15,   out: 75, cacheRead: 1.5,  cacheWrite: 18.75 },
  sonnet: { in: 3,    out: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  haiku:  { in: 0.80, out: 4,  cacheRead: 0.08, cacheWrite: 1.0 },
};

function family(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('haiku')) return 'haiku';
  return 'sonnet'; // default incl. sonnet + unknown
}

/** Cost in USD for one model's token bucket. */
export function costFor(model, { input = 0, output = 0, cacheRead = 0, cacheWrite = 0 } = {}) {
  const r = RATES[family(model)];
  return (input * r.in + output * r.out + cacheRead * r.cacheRead + cacheWrite * r.cacheWrite) / 1e6;
}
