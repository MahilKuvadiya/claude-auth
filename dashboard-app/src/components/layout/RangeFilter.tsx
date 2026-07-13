import { Segmented } from '@/components/ui/segmented';

const OPTS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
];

export function RangeFilter({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return <Segmented value={value} onChange={onChange} options={OPTS} />;
}
