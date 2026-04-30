import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Building2, TrendingUp, DollarSign, Bot, AlertCircle,
  RefreshCw, Users, Briefcase, CheckCircle, XCircle, Clock, Zap,
  BarChart2, Trophy, Settings,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, LabelList,
  AreaChart, Area,
} from 'recharts';
import { useTenant } from '../../contexts/TenantContext';
import { NewCompanyModal } from '../../components/admin/NewCompanyModal';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminKpiGlobal = {
  total_companies: number;
  active_companies: number;
  trial_companies: number;
  churned_companies: number;
  churn_rate_pct: number;
  mrr: number;
  avg_ticket: number;
  open_deals_count: number;
  open_deals_value: number;
  closed_won_count: number;
  closed_won_value: number;
  ai_managed_conversations: number;
};

type AdminTenantRow = {
  company_id: string;
  company_name: string;
  status: string;
  plan_name: string;
  price_monthly: number;
  subscribed_at: string | null;
  churned_at: string | null;
  open_deals_count: number;
  open_deals_value: number;
  closed_won_value: number;
  ai_managed_conversations: number;
  total_conversations: number;
};

type Period = '7d' | '30d' | '90d';

type StatusConfig = { label: string; dot: string; bg: string; text: string; border: string };

type KpiCardData = {
  title: string;
  value: string;
  rawValue: number;
  formatFn?: (v: number) => string;
  sub?: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  accentColor?: string;
  delay?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBRLCompact(value: number): string {
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(0)}k`;
  return formatBRL(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function hashHSL(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 30%)`;
}

// ─── useCountUp ───────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 800, delay = 0): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    timerRef.current = setTimeout(() => {
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(target * eased));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return count;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

const statusConfig: Record<string, StatusConfig> = {
  active:    { label: 'Ativo',     dot: 'bg-emerald-400', bg: 'bg-emerald-500/10',  text: 'text-emerald-400',  border: 'border-emerald-500/20' },
  trial:     { label: 'Trial',     dot: 'bg-amber-400',   bg: 'bg-amber-500/10',    text: 'text-amber-400',    border: 'border-amber-500/20' },
  churned:   { label: 'Churned',   dot: 'bg-rose-400',    bg: 'bg-rose-500/10',     text: 'text-rose-400',     border: 'border-rose-500/20' },
  suspended: { label: 'Suspenso',  dot: 'bg-stone-400',   bg: 'bg-stone-500/10',    text: 'text-stone-400',    border: 'border-stone-500/20' },
  none:      { label: 'Sem plano', dot: 'bg-stone-600',   bg: 'bg-stone-800/40',    text: 'text-stone-500',    border: 'border-stone-700/30' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = statusConfig[status] ?? statusConfig.none;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
};

// ─── Skeletons ────────────────────────────────────────────────────────────────

const KpiCardSkeleton: React.FC = () => (
  <div className="rounded-xl p-5 flex flex-col gap-5 animate-pulse bg-white/[0.03] border border-white/[0.08]">
    <div className="flex items-start justify-between">
      <div className="h-2.5 w-20 bg-white/[0.07] rounded" />
      <div className="h-8 w-8 bg-white/[0.07] rounded-lg" />
    </div>
    <div className="flex flex-col gap-2">
      <div className="h-9 w-28 bg-white/[0.07] rounded" />
      <div className="h-2.5 w-16 bg-white/[0.04] rounded" />
    </div>
  </div>
);

const AiCardSkeleton: React.FC = () => (
  <div className="rounded-xl p-5 flex flex-col gap-4 animate-pulse bg-violet-500/[0.04] border border-violet-500/[0.12]">
    <div className="flex items-start justify-between">
      <div className="h-2.5 w-36 bg-white/[0.07] rounded" />
      <div className="h-8 w-8 bg-white/[0.07] rounded-lg" />
    </div>
    <div className="h-9 w-32 bg-white/[0.07] rounded" />
    <div className="h-16 w-full bg-white/[0.04] rounded-lg" />
  </div>
);

const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 240 }) => (
  <div className="rounded-xl p-5 animate-pulse flex flex-col gap-4 bg-white/[0.03] border border-white/[0.08]">
    <div className="h-2.5 w-32 bg-white/[0.07] rounded" />
    <div className="bg-white/[0.04] rounded-lg w-full" style={{ height }} />
  </div>
);

const TableRowSkeleton: React.FC = () => (
  <tr className="border-b border-white/[0.05] animate-pulse">
    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
      <td key={i} className="px-4 py-4">
        <div className="h-4 bg-white/[0.05] rounded" style={{ width: `${50 + (i * 17) % 40}%` }} />
      </td>
    ))}
  </tr>
);

// ─── Tooltip base ─────────────────────────────────────────────────────────────

const tooltipStyle: React.CSSProperties = {
  background: 'rgba(15, 15, 15, 0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '10px 14px',
  color: '#fff',
  fontSize: '13px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
};

type DarkTooltipProps = {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  currency?: boolean;
};

const DarkTooltip: React.FC<DarkTooltipProps> = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      {label && <p className="text-stone-400 mb-1.5 text-xs font-medium">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-stone-400">{p.name}:</span>
          <span className="font-mono font-semibold" style={{ color: p.color }}>
            {currency ? formatBRLCompact(p.value) : p.value.toLocaleString('pt-BR')}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Error Banner ─────────────────────────────────────────────────────────────

const ErrorBanner: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
    <AlertCircle size={16} className="shrink-0" />
    <span className="flex-1">{message}</span>
    <button
      onClick={onRetry}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded border border-rose-500/30 hover:bg-rose-500/10 transition-colors"
    >
      <RefreshCw size={12} /> Tentar novamente
    </button>
  </div>
);

// ─── KPI Card Premium ─────────────────────────────────────────────────────────

const AdminKpiCard: React.FC<KpiCardData> = ({
  title, value, rawValue, formatFn, sub, icon, iconColor, iconBg, accentColor, delay = 0,
}) => {
  const count = useCountUp(rawValue, 800, delay);
  const displayValue = formatFn ? formatFn(count) : count.toLocaleString('pt-BR');

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-4 overflow-hidden transition-all duration-300 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.05] group"
      style={{ animation: 'fadeSlideUp 0.4s ease both', animationDelay: `${delay}ms` }}
    >
      {accentColor && (
        <div
          className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.07] blur-2xl pointer-events-none"
          style={{ background: accentColor, transform: 'translate(40%, -40%)' }}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-stone-500 font-mono leading-snug">
          {title}
        </span>
        <div className={`shrink-0 p-2 rounded-lg ${iconBg} ${iconColor} transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-4xl font-bold text-white leading-none tabular-nums">
          {displayValue}
        </span>
        {sub && <span className="text-xs text-stone-500 font-mono mt-0.5">{sub}</span>}
      </div>
    </div>
  );
};

// ─── AI KPI Card (destaque com sparkline) ─────────────────────────────────────

const AiKpiCard: React.FC<{ kpi: AdminKpiGlobal; delay?: number }> = ({ kpi, delay = 0 }) => {
  const count = useCountUp(kpi.ai_managed_conversations, 800, delay);
  const sparkData = [
    { w: 1, v: kpi.ai_managed_conversations },
    { w: 2, v: kpi.ai_managed_conversations },
    { w: 3, v: kpi.ai_managed_conversations },
    { w: 4, v: kpi.ai_managed_conversations },
  ];

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-4 overflow-hidden transition-all duration-300 bg-violet-500/[0.06] border border-violet-500/[0.15] hover:border-violet-500/[0.25] hover:bg-violet-500/[0.09] group"
      style={{ animation: 'fadeSlideUp 0.4s ease both', animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at top right, rgba(139,92,246,0.08) 0%, transparent 60%)' }} />
      <div className="flex items-start justify-between gap-2 relative">
        <span className="text-[10px] uppercase tracking-widest text-violet-400/70 font-mono leading-snug">
          Conversas Gerenciadas por IA
        </span>
        <div className="shrink-0 p-2 rounded-lg bg-violet-500/15 text-violet-400 transition-transform duration-300 group-hover:scale-110">
          <Bot size={14} />
        </div>
      </div>
      <div className="relative">
        <span className="text-4xl font-bold text-white leading-none tabular-nums">
          {count.toLocaleString('pt-BR')}
        </span>
        <span className="text-xs text-violet-400/60 font-mono ml-2">conversas</span>
      </div>
      <div className="h-16 w-full min-w-0 relative shrink-0">
        <ResponsiveContainer width="100%" height={64} debounce={50}>
          <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke="#8B5CF6"
              strokeWidth={1.5}
              fill="url(#aiGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─── Status: Progress Bars ────────────────────────────────────────────────────

const StatusProgressBars: React.FC<{ kpi: AdminKpiGlobal }> = ({ kpi }) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(t);
  }, []);

  const total = kpi.total_companies || 1;
  const suspended = Math.max(0, total - kpi.active_companies - kpi.trial_companies - kpi.churned_companies);
  const items = [
    { label: 'Active',    value: kpi.active_companies,  barColor: 'bg-emerald-500', textColor: 'text-emerald-400', dotColor: 'bg-emerald-500' },
    { label: 'Trial',     value: kpi.trial_companies,   barColor: 'bg-amber-500',   textColor: 'text-amber-400',   dotColor: 'bg-amber-500' },
    { label: 'Churned',   value: kpi.churned_companies,  barColor: 'bg-rose-500',    textColor: 'text-rose-400',    dotColor: 'bg-rose-500' },
    { label: 'Sem plano', value: suspended,              barColor: 'bg-stone-600',   textColor: 'text-stone-500',   dotColor: 'bg-stone-600' },
  ].filter((i) => i.value > 0);

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-5 bg-white/[0.03] border border-white/[0.08]"
      style={{ animation: 'fadeSlideUp 0.5s ease both', animationDelay: '100ms' }}
    >
      <div className="flex items-center gap-2">
        <Users size={14} className="text-amber-500" />
        <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">Distribuição de Status</span>
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-3xl font-bold text-white tabular-nums">{kpi.total_companies}</span>
        <span className="text-[10px] text-stone-500 font-mono uppercase tracking-widest">total tenants</span>
      </div>
      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const pct = (item.value / total) * 100;
          return (
            <div key={item.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${item.dotColor}`} />
                  <span className="text-[10px] uppercase tracking-widest text-stone-500 font-mono">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold ${item.textColor}`}>{item.value}</span>
                  <span className="text-[10px] text-stone-600 font-mono">{Math.round(pct)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.barColor} transition-all duration-1000 ease-out`}
                  style={{ width: animated ? `${pct}%` : '0%' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Chart: Pipeline por Tenant ───────────────────────────────────────────────

const PipelineChart: React.FC<{ tenants: AdminTenantRow[] }> = ({ tenants }) => {
  const data = tenants
    .filter((t) => (t.open_deals_value > 0) || (t.closed_won_value > 0))
    .slice(0, 8)
    .map((t) => ({
      name: t.company_name.length > 14 ? t.company_name.slice(0, 13) + '…' : t.company_name,
      'Em Aberto': t.open_deals_value,
      'Fechados (Won)': t.closed_won_value,
    }));

  const noData = data.length === 0;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.03] border border-white/[0.08] min-w-0"
      style={{ animation: 'fadeSlideUp 0.5s ease both', animationDelay: '200ms' }}
    >
      <div className="flex items-center gap-2">
        <Briefcase size={14} className="text-amber-500" />
        <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">Pipeline por Tenant</span>
      </div>

      {noData ? (
        <div className="flex items-center justify-center h-52 text-stone-600 text-sm">Nenhum deal registrado</div>
      ) : (
        <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height={220} debounce={50}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" strokeDasharray="0" />
            <XAxis
              type="number"
              tickFormatter={formatBRLCompact}
              tick={{ fill: '#57534E', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fill: '#A8A29E', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<DarkTooltip currency />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11, color: '#78716C', paddingTop: 8 }}
            />
            <Bar dataKey="Em Aberto" fill="#F59E0B" radius={[0, 4, 4, 0]} animationDuration={700}>
              <LabelList
                dataKey="Em Aberto"
                position="right"
                formatter={(v: number) => (v > 0 ? formatBRLCompact(v) : '')}
                style={{ fill: '#78716C', fontSize: 9, fontFamily: 'monospace' }}
              />
            </Bar>
            <Bar dataKey="Fechados (Won)" fill="#10B981" radius={[0, 4, 4, 0]} animationDuration={900}>
              <LabelList
                dataKey="Fechados (Won)"
                position="right"
                formatter={(v: number) => (v > 0 ? formatBRLCompact(v) : '')}
                style={{ fill: '#78716C', fontSize: 9, fontFamily: 'monospace' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ─── Chart: AI Adoption ───────────────────────────────────────────────────────

const AiAdoptionChart: React.FC<{ tenants: AdminTenantRow[] }> = ({ tenants }) => {
  const data = tenants
    .filter((t) => t.total_conversations > 0)
    .slice(0, 8)
    .map((t) => {
      const pct = Math.round((t.ai_managed_conversations / t.total_conversations) * 100);
      return {
        name: t.company_name.length > 12 ? t.company_name.slice(0, 11) + '…' : t.company_name,
        'IA (%)': pct,
        'Humano (%)': 100 - pct,
        ai: t.ai_managed_conversations,
        total: t.total_conversations,
        iaPct: pct,
      };
    })
    .sort((a, b) => b['IA (%)'] - a['IA (%)']);

  const noData = data.length === 0;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.03] border border-white/[0.08] min-w-0"
      style={{ animation: 'fadeSlideUp 0.5s ease both', animationDelay: '300ms' }}
    >
      <div className="flex items-center gap-2">
        <Bot size={14} className="text-violet-400" />
        <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">Adoção de IA por Tenant</span>
      </div>

      {noData ? (
        <div className="flex items-center justify-center h-52 text-stone-600 text-sm">Sem conversas registradas</div>
      ) : (
        <div className="h-[240px] w-full min-w-0">
        <ResponsiveContainer width="100%" height={240} debounce={50}>
          <BarChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" strokeDasharray="0" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#A8A29E', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: '#57534E', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = data.find((d) => d.name === label);
                return (
                  <div style={tooltipStyle}>
                    <p className="font-medium mb-1.5 text-xs">{label}</p>
                    <p className="text-violet-400 font-mono text-xs">IA: {row?.ai ?? 0} conv ({row?.iaPct ?? 0}%)</p>
                    <p className="text-stone-400 font-mono text-xs">Humano: {(row?.total ?? 0) - (row?.ai ?? 0)} conv ({100 - (row?.iaPct ?? 0)}%)</p>
                    <p className="text-stone-500 font-mono text-xs mt-1">Total: {row?.total ?? 0}</p>
                  </div>
                );
              }}
              cursor={{ fill: 'rgba(255,255,255,0.02)' }}
            />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11, color: '#78716C', paddingTop: 8 }}
            />
            <Bar
              dataKey="IA (%)"
              stackId="a"
              fill="#8B5CF6"
              animationDuration={700}
              style={{ filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.45))' }}
            />
            <Bar
              dataKey="Humano (%)"
              stackId="a"
              fill="#292524"
              radius={[3, 3, 0, 0]}
              animationDuration={900}
            >
              <LabelList
                dataKey="iaPct"
                position="top"
                formatter={(v: number) => (v > 0 ? `${v}%` : '')}
                style={{ fill: '#A78BFA', fontSize: 10, fontFamily: 'monospace' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ─── Chart: MRR por Plano ─────────────────────────────────────────────────────

const MrrChart: React.FC<{ tenants: AdminTenantRow[] }> = ({ tenants }) => {
  const planTotals: Record<string, number> = {};
  tenants.forEach((t) => {
    if (t.price_monthly > 0 && t.status === 'active') {
      planTotals[t.plan_name] = (planTotals[t.plan_name] ?? 0) + t.price_monthly;
    }
  });

  const COLORS = ['#F59E0B', '#10B981', '#8B5CF6', '#F43F5E', '#06B6D4'];
  const data = Object.entries(planTotals)
    .map(([name, total], i) => ({ name, total, fill: COLORS[i % COLORS.length] }))
    .sort((a, b) => b.total - a.total);

  const totalMrr = data.reduce((acc, d) => acc + d.total, 0);
  const noData = data.length === 0;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.03] border border-white/[0.08] min-w-0"
      style={{ animation: 'fadeSlideUp 0.5s ease both', animationDelay: '400ms' }}
    >
      <div className="flex items-center gap-2">
        <DollarSign size={14} className="text-emerald-400" />
        <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">MRR por Plano</span>
      </div>

      {noData ? (
        <div className="flex flex-col items-center justify-center gap-4 h-52">
          <div className="p-4 rounded-full bg-white/[0.04] border border-white/[0.08]">
            <DollarSign size={28} className="text-stone-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-stone-400">Nenhum plano configurado ainda</p>
            <p className="text-xs text-stone-600 mt-1">Configure planos para visualizar o MRR</p>
          </div>
          <button
            onClick={() => {}}
            className="text-xs font-medium px-4 py-2 rounded-lg border border-white/[0.1] text-stone-400 hover:border-amber-500/40 hover:text-amber-400 transition-all"
          >
            <Settings size={12} className="inline mr-1.5" />
            Configurar Planos
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-2xl font-bold text-emerald-400 tabular-nums">{formatBRLCompact(totalMrr)}</span>
            <span className="text-[10px] text-stone-500 font-mono uppercase tracking-widest">MRR total</span>
          </div>
          <div className="h-[160px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={160} debounce={50}>
            <BarChart data={data} margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" strokeDasharray="0" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#A8A29E', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatBRLCompact}
                tick={{ fill: '#57534E', fontSize: 10, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0];
                  return (
                    <div style={tooltipStyle}>
                      <p className="font-medium mb-1 text-xs">{p.name}</p>
                      <p className="font-mono text-emerald-400 text-xs">{formatBRL(p.value as number)}/mês</p>
                    </div>
                  );
                }}
                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Tenant AI Ranking ────────────────────────────────────────────────────────

const TenantAiRanking: React.FC<{ tenants: AdminTenantRow[] }> = ({ tenants }) => {
  const ranked = tenants
    .filter((t) => t.total_conversations > 0)
    .map((t) => ({
      ...t,
      aiPct: Math.round((t.ai_managed_conversations / t.total_conversations) * 100),
    }))
    .sort((a, b) => b.aiPct - a.aiPct)
    .slice(0, 8);

  const noData = ranked.length === 0;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.03] border border-white/[0.08]"
      style={{ animation: 'fadeSlideUp 0.6s ease both', animationDelay: '500ms' }}
    >
      <div className="flex items-center gap-2">
        <Trophy size={14} className="text-amber-500" />
        <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">Ranking — Adoção de IA</span>
      </div>

      {noData ? (
        <div className="flex items-center justify-center h-40 text-stone-600 text-sm">Sem dados de conversas</div>
      ) : (
        <div className="flex flex-col gap-1">
          {ranked.map((t, idx) => (
            <div
              key={t.company_id}
              className="flex items-center gap-3 py-2.5 px-2 rounded-lg transition-colors hover:bg-white/[0.03]"
              style={{ animation: 'fadeSlideUp 0.3s ease both', animationDelay: `${600 + idx * 50}ms` }}
            >
              <span className="w-5 text-center text-xs font-mono text-stone-600 shrink-0">
                {idx + 1}
              </span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: hashHSL(t.company_name) }}
              >
                {initials(t.company_name)}
              </div>
              <span className="flex-1 text-sm text-stone-300 truncate">{t.company_name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-20 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${t.aiPct}%` }}
                  />
                </div>
                <span className="text-xs font-mono font-bold text-violet-400 w-9 text-right tabular-nums">
                  {t.aiPct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const CompaniesList: React.FC = () => {
  const { refreshCompanies } = useTenant();
  const navigate = useNavigate();
  const [showNewModal, setShowNewModal] = useState(false);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('30d');

  const [kpi, setKpi] = useState<AdminKpiGlobal | null>(null);
  const [tenants, setTenants] = useState<AdminTenantRow[]>([]);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const isLoading = kpiLoading || tenantsLoading;

  const fetchKpi = useCallback(async () => {
    setKpiLoading(true);
    setKpiError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_get_admin_kpi_global');
      if (error) throw error;
      const d = data as AdminKpiGlobal & { error?: string };
      if (d?.error) throw new Error(d.error);
      setKpi(d as AdminKpiGlobal);
    } catch (err) {
      setKpiError(err instanceof Error ? err.message : 'Erro ao carregar KPIs globais.');
    } finally {
      setKpiLoading(false);
    }
  }, []);

  const fetchTenants = useCallback(async () => {
    setTenantsLoading(true);
    setTenantsError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_get_admin_tenants_table');
      if (error) throw error;
      setTenants((data as AdminTenantRow[]) ?? []);
    } catch (err) {
      setTenantsError(err instanceof Error ? err.message : 'Erro ao carregar dados dos tenants.');
    } finally {
      setTenantsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKpi();
    fetchTenants();
  }, [fetchKpi, fetchTenants]);

  const handleCompanyCreated = () => {
    refreshCompanies();
    fetchKpi();
    fetchTenants();
  };

  const handleRefresh = () => {
    fetchKpi();
    fetchTenants();
  };

  const filteredTenants = tenants.filter((t) =>
    t.company_name.toLowerCase().includes(search.toLowerCase())
  );

  const kpiCards: KpiCardData[] = kpi
    ? [
        {
          title: 'Total de Empresas',
          value: String(kpi.total_companies),
          rawValue: kpi.total_companies,
          icon: <Building2 size={14} />,
          iconColor: 'text-orange-400',
          iconBg: 'bg-orange-500/10',
          accentColor: '#F59E0B',
          delay: 0,
        },
        {
          title: 'Clientes Ativos',
          value: String(kpi.active_companies),
          rawValue: kpi.active_companies,
          sub: `de ${kpi.total_companies} empresas`,
          icon: <Users size={14} />,
          iconColor: 'text-emerald-400',
          iconBg: 'bg-emerald-500/10',
          accentColor: '#10B981',
          delay: 50,
        },
        {
          title: 'Em Trial',
          value: String(kpi.trial_companies),
          rawValue: kpi.trial_companies,
          icon: <Clock size={14} />,
          iconColor: 'text-amber-400',
          iconBg: 'bg-amber-500/10',
          accentColor: '#F59E0B',
          delay: 100,
        },
        {
          title: 'Churn',
          value: String(kpi.churned_companies),
          rawValue: kpi.churned_companies,
          sub: `${kpi.churn_rate_pct}% da base`,
          icon: <XCircle size={14} />,
          iconColor: 'text-rose-400',
          iconBg: 'bg-rose-500/10',
          accentColor: '#F43F5E',
          delay: 150,
        },
        {
          title: 'MRR — Receita Mensal',
          value: formatBRL(kpi.mrr),
          rawValue: kpi.mrr,
          formatFn: formatBRL,
          icon: <DollarSign size={14} />,
          iconColor: 'text-emerald-400',
          iconBg: 'bg-emerald-500/10',
          accentColor: '#10B981',
          delay: 200,
        },
        {
          title: 'Ticket Médio',
          value: formatBRL(kpi.avg_ticket),
          rawValue: kpi.avg_ticket,
          formatFn: formatBRL,
          sub: 'por cliente ativo',
          icon: <TrendingUp size={14} />,
          iconColor: 'text-orange-400',
          iconBg: 'bg-orange-500/10',
          accentColor: '#F59E0B',
          delay: 250,
        },
        {
          title: 'Negociações em Aberto',
          value: String(kpi.open_deals_count),
          rawValue: kpi.open_deals_count,
          sub: `${formatBRL(kpi.open_deals_value)} em aberto`,
          icon: <Briefcase size={14} />,
          iconColor: 'text-orange-400',
          iconBg: 'bg-orange-500/10',
          accentColor: '#F59E0B',
          delay: 300,
        },
        {
          title: 'Negociações Fechadas (Won)',
          value: String(kpi.closed_won_count),
          rawValue: kpi.closed_won_count,
          sub: `${formatBRL(kpi.closed_won_value)} fechados`,
          icon: <CheckCircle size={14} />,
          iconColor: 'text-emerald-400',
          iconBg: 'bg-emerald-500/10',
          accentColor: '#10B981',
          delay: 350,
        },
      ]
    : [];

  const chartsReady = !kpiLoading && !tenantsLoading;

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-8 reveal active">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-amber-500 block mb-2 tracking-widest">
              Gestão Global
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Dashboard Admin
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Visão consolidada de todos os tenants da plataforma
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Period selector */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.08]">
              {(['7d', '30d', '90d'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all duration-200 ${
                    period === p
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'text-stone-500 hover:text-stone-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg border border-white/[0.08] text-stone-500 hover:text-white hover:border-white/[0.2] transition-all duration-200 disabled:opacity-40"
              title="Recarregar todos os dados"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 hover:bg-amber-400 transition-colors"
            >
              <Plus size={16} /> Nova Empresa
            </button>
          </div>
        </div>

        {/* ── KPI Error ───────────────────────────────────────────────────── */}
        {kpiError && <ErrorBanner message={kpiError} onRetry={fetchKpi} />}

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={13} className="text-amber-500" />
            <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">KPIs da Plataforma</span>
          </div>
          {kpiLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)}
              <div className="col-span-2 md:col-span-4"><AiCardSkeleton /></div>
            </div>
          ) : kpi ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {kpiCards.map((card) => <AdminKpiCard key={card.title} {...card} />)}
              </div>
              <AiKpiCard kpi={kpi} delay={400} />
            </>
          ) : null}
        </section>

        {/* ── Charts ──────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={13} className="text-amber-500" />
            <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">Analytics</span>
          </div>

          {!chartsReady ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
                <ChartSkeleton height={200} />
                <div className="md:col-span-1 xl:col-span-2"><ChartSkeleton height={200} /></div>
                <ChartSkeleton height={200} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2"><ChartSkeleton height={260} /></div>
                <ChartSkeleton height={260} />
              </div>
            </>
          ) : (
            <>
              {/* Row 1: Status Bars + Pipeline + MRR */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4 min-w-0">
                {kpi && <StatusProgressBars kpi={kpi} />}
                <div className="md:col-span-1 xl:col-span-2 min-w-0">
                  <PipelineChart tenants={tenants} />
                </div>
                <div className="min-w-0">
                  <MrrChart tenants={tenants} />
                </div>
              </div>

              {/* Row 2: AI Adoption + AI Ranking */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-w-0">
                <div className="xl:col-span-2 min-w-0">
                  <AiAdoptionChart tenants={tenants} />
                </div>
                <TenantAiRanking tenants={tenants} />
              </div>
            </>
          )}
        </section>

        {/* ── Tenants Table ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-2">
              <Building2 size={13} className="text-amber-500" />
              <span className="text-[10px] font-mono uppercase text-stone-500 tracking-widest">Tenants</span>
              {!tenantsLoading && (
                <span className="text-[10px] text-stone-600 font-mono">({filteredTenants.length})</span>
              )}
            </div>
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          {tenantsError && <ErrorBanner message={tenantsError} onRetry={fetchTenants} />}

          <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500">Empresa</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500">Plano</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500">Status</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500 text-right">MRR</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500 text-right">Deals Abertos</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500 text-right">Deals Won</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500 text-right">IA Conv.</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500">Desde</th>
                    <th className="px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-stone-500 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)
                  ) : filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-16 text-center text-stone-500 text-sm">
                        {search ? 'Nenhuma empresa encontrada.' : 'Nenhum tenant cadastrado ainda.'}
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((tenant, idx) => {
                      const aiPct = tenant.total_conversations > 0
                        ? Math.round((tenant.ai_managed_conversations / tenant.total_conversations) * 100)
                        : 0;
                      return (
                        <tr
                          key={tenant.company_id}
                          className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors group"
                          style={{ animation: 'fadeSlideUp 0.3s ease both', animationDelay: `${idx * 40}ms` }}
                        >
                          {/* Empresa */}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                style={{ background: hashHSL(tenant.company_name) }}
                              >
                                {initials(tenant.company_name)}
                              </div>
                              <div>
                                <span className="text-sm font-medium text-white leading-none">{tenant.company_name}</span>
                                <span className="text-[10px] text-stone-600 font-mono block mt-0.5">{tenant.company_id.slice(0, 8)}…</span>
                              </div>
                            </div>
                          </td>

                          {/* Plano */}
                          <td className="px-4 py-4">
                            <span className="text-sm text-stone-400">{tenant.plan_name || '—'}</span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4">
                            <StatusBadge status={tenant.status} />
                          </td>

                          {/* MRR */}
                          <td className="px-4 py-4 text-right">
                            <span className={`text-sm font-mono ${tenant.price_monthly > 0 ? 'text-emerald-400' : 'text-stone-600'}`}>
                              {tenant.price_monthly > 0 ? formatBRL(tenant.price_monthly) : '—'}
                            </span>
                          </td>

                          {/* Deals Abertos */}
                          <td className="px-4 py-4 text-right">
                            <div>
                              <span className={`text-sm font-mono ${tenant.open_deals_count > 0 ? 'text-white' : 'text-stone-600'}`}>
                                {tenant.open_deals_count}
                              </span>
                              {tenant.open_deals_value > 0 && (
                                <span className="text-[10px] text-stone-500 block font-mono">{formatBRL(tenant.open_deals_value)}</span>
                              )}
                            </div>
                          </td>

                          {/* Deals Won */}
                          <td className="px-4 py-4 text-right">
                            <span className={`text-sm font-mono ${tenant.closed_won_value > 0 ? 'text-emerald-400' : 'text-stone-600'}`}>
                              {tenant.closed_won_value > 0 ? formatBRL(tenant.closed_won_value) : '—'}
                            </span>
                          </td>

                          {/* IA Conv. */}
                          <td className="px-4 py-4 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1.5">
                                {tenant.ai_managed_conversations > 0 && (
                                  <Bot size={11} className="text-violet-400 shrink-0" />
                                )}
                                <span className="text-sm font-mono text-stone-300">
                                  {tenant.ai_managed_conversations}
                                  <span className="text-stone-600">/{tenant.total_conversations}</span>
                                </span>
                              </div>
                              {tenant.total_conversations > 0 && (
                                <div className="w-16 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-violet-500"
                                    style={{ width: `${aiPct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Desde */}
                          <td className="px-4 py-4">
                            <span className="text-sm text-stone-500 font-mono">{formatDate(tenant.subscribed_at)}</span>
                          </td>

                          {/* Ações */}
                          <td className="px-4 py-4 text-right">
                            <button
                              onClick={() => navigate(`/admin/companies/${tenant.company_id}`)}
                              className="text-xs font-medium text-stone-400 border border-white/[0.1] px-3 py-1.5 rounded-lg transition-all hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/[0.06]"
                            >
                              Gerenciar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>

      {showNewModal && (
        <NewCompanyModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onSuccess={handleCompanyCreated}
        />
      )}
    </>
  );
};
