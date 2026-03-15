import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon, trend, trendUp }) => {
  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-5 hover:border-white/10 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-stone-500 font-medium leading-snug">{title}</span>
        <div className="text-stone-700 group-hover:text-stone-500 transition-colors shrink-0 mt-0.5">
          {icon}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[2rem] font-light tracking-tight text-white leading-none tabular-nums">
          {value}
        </span>
        {trend && (
          <span className={`text-xs font-medium ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};
