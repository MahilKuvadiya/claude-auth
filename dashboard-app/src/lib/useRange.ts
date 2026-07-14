import { useSearchParams } from 'react-router-dom';

/** Date-range (in days) synced to the URL search params, so filters are shareable. */
export function useRange(def = 30): [number, (d: number) => void] {
  const [sp, setSp] = useSearchParams();
  const days = Number(sp.get('days')) || def;
  const setDays = (d: number) => {
    const next = new URLSearchParams(sp);
    next.set('days', String(d));
    setSp(next, { replace: true });
  };
  return [days, setDays];
}
