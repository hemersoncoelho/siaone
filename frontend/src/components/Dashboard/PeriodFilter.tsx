import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

export type Period = 'today' | '7d' | '30d';

export const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje',
  '7d': '7 Dias',
  '30d': 'Este Mês',
};

/** Returns the ISO start datetime for a given period */
export function periodToStartDate(period: Period): string {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (period === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return start.toISOString();
  }
  // 30d — start of current month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.toISOString();
}

interface PeriodFilterProps {
  value: Period;
  onChange: (p: Period) => void;
}

export const PeriodFilter: React.FC<PeriodFilterProps> = ({ value, onChange }) => {
  const periods: Period[] = ['today', '7d', '30d'];

  return (
    <div className="flex items-center gap-2 bg-[#1A1A1A] border border-white/5 rounded-lg p-1">
      <div className="flex items-center pl-3 pr-2 text-gray-400">
        <Calendar size={16} />
      </div>
      {periods.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            value === p
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          )}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
};
