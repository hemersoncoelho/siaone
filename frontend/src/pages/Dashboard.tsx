import React, { useEffect, useState, useCallback } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PeriodFilter, periodToStartDate } from '../components/Dashboard/PeriodFilter';
import type { Period } from '../components/Dashboard/PeriodFilter';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  TrendingUp, DollarSign, Trophy, Percent, AlertCircle,
  MessageSquare, Target, Inbox, BadgeCheck, Zap, Users,
  Clock, BarChart2, ArrowUpRight, ArrowDownRight, Minus,
  ChevronRight, Activity,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

interface KPIData {
  total_messages:     number;
  total_leads:        number;
  open_conversations: number;
  qualified_leads:    number;
  overdue_tasks:      number;
}

interface ChartData {
  conversasPorCanal:      { canal: string; total: number }[];
  contatosPorEstagio:     { estagio: string; total: number }[];
  tasksPorStatus:         { status: string; total: number; color: string }[];
  conversasPorPrioridade: { prioridade: string; total: number; color: string }[];
}

interface CommercialData {
  pipelineValue:  number;
  wonValue:       number;
  wonCount:       number;
  lostCount:      number;
  conversionRate: number;
  dealsByStage:   { stage: string; count: number; value: number; color: string; position: number }[];
  dealsByStatus:  { status: string; total: number; color: string }[];
}

interface TrendPoint {
  date:      string;
  wonAmount: number;
  newDeals:  number;
  wonDeals:  number;
  lostDeals: number;
  newLeads:  number;
}

// ── Label maps ──────────────────────────────────────────────────

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'E-mail', webchat: 'WebChat',
  instagram: 'Instagram', telegram: 'Telegram', facebook: 'Facebook',
};
const ESTAGIO_LABELS: Record<string, string> = {
  lead: 'Lead', qualified: 'Qualificado',
  opportunity: 'Oportunidade', customer: 'Cliente', lost: 'Perdido',
};
const ESTAGIO_ORDER = ['lead', 'qualified', 'opportunity', 'customer', 'lost'];
const TASK_COLORS: Record<string, string> = {
  open: '#60a5fa', in_progress: '#f59e0b', done: '#34d399', cancelled: '#6b7280',
};
const TASK_LABELS: Record<string, string> = {
  open: 'Aberta', in_progress: 'Em andamento', done: 'Concluída', cancelled: 'Cancelada',
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f43f5e', high: '#f97316', normal: '#60a5fa', low: '#a8a29e',
};
const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgente', high: 'Alta', normal: 'Normal', low: 'Baixa',
};

// ── Helpers ─────────────────────────────────────────────────────

const fmt = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

const fmtShort = (val: number): string => {
  if (val >= 1_000_000) return `R$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `R$${(val / 1_000).toFixed(0)}k`;
  return `R$${val.toFixed(0)}`;
};

// ── Tooltip ─────────────────────────────────────────────────────

const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-2xl">
      {label && <p className="text-stone-500 mb-1 font-mono">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill || '#fff' }}>
          {p.name ? `${p.name}: ` : ''}
          <strong>{p.name === 'Receita' ? fmt(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Micro components ─────────────────────────────────────────────

/** Stat chip exibido no header hero */
const HeroStat: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'emerald' | 'rose' | 'blue' | 'amber';
}> = ({ label, value, icon, color }) => {
  const colors = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    rose:    'bg-rose-500/10    border-rose-500/20    text-rose-400',
    blue:    'bg-blue-500/10    border-blue-500/20    text-blue-400',
    amber:   'bg-amber-500/10   border-amber-500/20   text-amber-400',
  }[color];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${colors}`}>
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider opacity-70">{label}</p>
        <p className="text-sm font-semibold leading-tight">{value}</p>
      </div>
    </div>
  );
};

/** Cartão KPI secundário */
const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendDir?: 'up' | 'down' | 'flat';
  accent?: string;
  loading?: boolean;
}> = ({ title, value, icon, trend, trendDir, accent = 'text-stone-400', loading }) => {
  if (loading) return <div className="glass-panel rounded-xl p-5 animate-pulse h-28" />;
  const TrendIcon = trendDir === 'up' ? ArrowUpRight : trendDir === 'down' ? ArrowDownRight : Minus;
  const trendColor = trendDir === 'up' ? 'text-emerald-400' : trendDir === 'down' ? 'text-rose-400' : 'text-stone-500';
  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-4 hover:border-white/10 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] text-stone-500 font-medium leading-snug">{title}</span>
        <span className={`${accent} group-hover:opacity-100 opacity-60 transition-opacity shrink-0`}>{icon}</span>
      </div>
      <div>
        <span className="text-[1.85rem] font-light tracking-tight text-text-main leading-none tabular-nums">{value}</span>
        {trend && (
          <div className={`flex items-center gap-0.5 mt-1.5 text-xs font-medium ${trendColor}`}>
            <TrendIcon size={12} />
            {trend}
          </div>
        )}
      </div>
    </div>
  );
};

/** Painel de gráfico padrão */
const Panel: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, children, className = '' }) => (
  <div className={`glass-panel rounded-xl p-5 flex flex-col gap-4 ${className}`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <h3 className="text-[11px] font-medium text-stone-400 uppercase tracking-widest">{title}</h3>
        {subtitle && <p className="text-[10px] text-stone-600 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

/** Barra de valor de pipeline por etapa */
const StageBar: React.FC<{
  label: string;
  count: number;
  value: number;
  color: string;
  maxValue: number;
}> = ({ label, count, value, color, maxValue }) => {
  const pct = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 4;
  return (
    <div className="flex items-center gap-3 group">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-stone-400 truncate">{label}</span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-[10px] text-stone-600 font-mono">{count} deal{count !== 1 ? 's' : ''}</span>
            <span className="text-[11px] font-semibold text-stone-200">{fmtShort(value)}</span>
          </div>
        </div>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
};

/** Sinal de urgência */
const UrgencySignal: React.FC<{
  count: number;
  label: string;
  icon: React.ReactNode;
  level: 'critical' | 'warn' | 'ok';
}> = ({ count, label, icon, level }) => {
  const styles = {
    critical: 'bg-rose-500/8 border-rose-500/20 text-rose-400',
    warn:     'bg-amber-500/8 border-amber-500/20 text-amber-400',
    ok:       'bg-emerald-500/8 border-emerald-500/20 text-emerald-400',
  }[level];
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${styles}`}>
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-lg font-semibold leading-none">{count}</p>
        <p className="text-[10px] font-mono uppercase tracking-wider opacity-70 mt-0.5">{label}</p>
      </div>
    </div>
  );
};

/** Placeholder "em breve" redesenhado */
const ComingSoon: React.FC<{ title: string; desc: string; className?: string }> = ({ title, desc, className = '' }) => (
  <div className={`glass-panel rounded-xl p-5 flex flex-col gap-3 ${className}`}>
    <div className="flex items-center justify-between">
      <h4 className="text-[11px] font-medium text-stone-600 uppercase tracking-widest">{title}</h4>
      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-amber-500/15 bg-amber-500/5 text-amber-600">
        em breve
      </span>
    </div>
    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/[0.04] rounded-lg p-6 min-h-[140px] gap-4">
      {/* phantom bars */}
      <div className="flex items-end gap-1 h-10 w-full max-w-[200px] opacity-[0.12]">
        {[35, 55, 42, 78, 60, 88, 50, 92, 65, 45].map((h, i) => (
          <div key={i} className="flex-1 bg-stone-400 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
      <p className="text-[11px] text-stone-600 text-center leading-relaxed max-w-[220px]">{desc}</p>
    </div>
  </div>
);

// ── Skeleton rows ─────────────────────────────────────────────────

const SkeletonPanel = ({ h = 'h-56' }: { h?: string }) => (
  <div className={`glass-panel rounded-xl p-5 animate-pulse ${h}`}>
    <div className="h-2.5 bg-white/5 rounded w-1/5 mb-6" />
    <div className="h-full bg-white/5 rounded" />
  </div>
);

// ── Dashboard ────────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { currentCompany, companyRole, impersonatedUser } = useTenant();
  const { user } = useAuth();

  const [period, setPeriod]                       = useState<Period>('30d');
  const [loading, setLoading]                     = useState(true);
  const [chartsLoading, setChartsLoading]         = useState(true);
  const [error, setError]                         = useState<string | null>(null);
  const [kpis, setKpis]                           = useState<KPIData | null>(null);
  const [charts, setCharts]                       = useState<ChartData | null>(null);
  const [commercial, setCommercial]               = useState<CommercialData | null>(null);
  const [commercialLoading, setCommercialLoading] = useState(true);
  const [trend, setTrend]                         = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading]           = useState(true);

  const isAgentView     = companyRole === 'agent';
  const effectiveUserId = (impersonatedUser ?? user)?.id ?? null;

  // ── fetchKPIs ───────────────────────────────────────────────
  const fetchKPIs = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setLoading(true); setError(null);
    const since = periodToStartDate(activePeriod);
    try {
      if (isAgentView && effectiveUserId) {
        const [convRes, messagesRes, leadsRes, qualifiedRes, overdueRes] = await Promise.all([
          supabase.from('conversations').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'open').eq('assigned_to', effectiveUserId),
          supabase.from('messages')
            .select('id, conversations!inner(company_id, assigned_to)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id)
            .eq('conversations.assigned_to', effectiveUserId).gte('created_at', since),
          supabase.from('contacts').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'lead')
            .eq('owner_user_id', effectiveUserId).gte('created_at', since),
          supabase.from('contacts').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'active')
            .eq('owner_user_id', effectiveUserId).gte('created_at', since),
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('assigned_to_user_id', effectiveUserId)
            .lt('due_at', new Date().toISOString()).or('status.eq.pending,status.eq.open'),
        ]);
        setKpis({
          total_messages: messagesRes.count ?? 0, total_leads: leadsRes.count ?? 0,
          open_conversations: convRes.count ?? 0, qualified_leads: qualifiedRes.count ?? 0,
          overdue_tasks: overdueRes.count ?? 0,
        });
      } else {
        const [viewRes, messagesRes, qualifiedRes] = await Promise.all([
          supabase.from('v_company_kpis').select('total_leads, open_conversations, overdue_tasks')
            .eq('company_id', currentCompany.id).single(),
          supabase.from('messages')
            .select('id, conversations!inner(company_id)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id).gte('created_at', since),
          supabase.from('contacts').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'active').gte('created_at', since),
        ]);
        if (viewRes.error && viewRes.error.code !== 'PGRST116') throw viewRes.error;
        const v = viewRes.data;
        setKpis({
          total_messages: messagesRes.count ?? 0, total_leads: v?.total_leads ?? 0,
          open_conversations: v?.open_conversations ?? 0, qualified_leads: qualifiedRes.count ?? 0,
          overdue_tasks: v?.overdue_tasks ?? 0,
        });
      }
    } catch (err: any) { setError(err.message || 'Erro ao carregar KPIs.'); }
    finally { setLoading(false); }
  }, [currentCompany, isAgentView, effectiveUserId]);

  // ── fetchCharts ─────────────────────────────────────────────
  const fetchCharts = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setChartsLoading(true);
    const since = periodToStartDate(activePeriod);
    let convQuery     = supabase.from('conversations').select('channel, priority').eq('company_id', currentCompany.id).gte('created_at', since);
    let contactsQuery = supabase.from('contacts').select('status').eq('company_id', currentCompany.id).gte('created_at', since);
    let tasksQuery    = supabase.from('tasks').select('status').eq('company_id', currentCompany.id).gte('created_at', since);
    if (isAgentView && effectiveUserId) {
      convQuery = convQuery.eq('assigned_to', effectiveUserId);
      contactsQuery = contactsQuery.eq('owner_user_id', effectiveUserId);
      tasksQuery = tasksQuery.eq('assigned_to_user_id', effectiveUserId);
    }
    try {
      const [convRes, contatosRes, tasksRes] = await Promise.all([convQuery, contactsQuery, tasksQuery]);
      const canalCount: Record<string, number> = {};
      convRes.data?.forEach(r => { const k = r.channel || 'outro'; canalCount[k] = (canalCount[k] ?? 0) + 1; });
      const conversasPorCanal = Object.entries(canalCount)
        .map(([canal, total]) => ({ canal: CANAL_LABELS[canal] ?? canal, total }))
        .sort((a, b) => b.total - a.total);
      const statusToEstagio: Record<string, string> = { lead: 'lead', active: 'qualified', inactive: 'lost' };
      const estagioCount: Record<string, number> = {};
      contatosRes.data?.forEach(r => { const k = statusToEstagio[r.status ?? 'lead'] ?? 'lead'; estagioCount[k] = (estagioCount[k] ?? 0) + 1; });
      const contatosPorEstagio = ESTAGIO_ORDER.filter(e => estagioCount[e]).map(e => ({ estagio: ESTAGIO_LABELS[e], total: estagioCount[e] }));
      const taskCount: Record<string, number> = {};
      tasksRes.data?.forEach(r => { const k = r.status ?? 'open'; taskCount[k] = (taskCount[k] ?? 0) + 1; });
      const tasksPorStatus = Object.entries(taskCount).map(([status, total]) => ({
        status: TASK_LABELS[status] ?? status, total, color: TASK_COLORS[status] ?? '#a8a29e',
      }));
      const priorCount: Record<string, number> = {};
      convRes.data?.forEach(r => { const k = r.priority ?? 'normal'; priorCount[k] = (priorCount[k] ?? 0) + 1; });
      const conversasPorPrioridade = ['urgent', 'high', 'normal', 'low'].filter(p => priorCount[p]).map(p => ({
        prioridade: PRIORITY_LABELS[p], total: priorCount[p], color: PRIORITY_COLORS[p],
      }));
      setCharts({ conversasPorCanal, contatosPorEstagio, tasksPorStatus, conversasPorPrioridade });
    } finally { setChartsLoading(false); }
  }, [currentCompany, isAgentView, effectiveUserId]);

  // ── fetchCommercial ─────────────────────────────────────────
  const fetchCommercial = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setCommercialLoading(true);
    const since = periodToStartDate(activePeriod);
    try {
      const { data: dealsRaw } = await supabase
        .from('deals').select('status, amount, pipeline_stages(name, color, position)')
        .eq('company_id', currentCompany.id).gte('created_at', since);
      if (!dealsRaw) return;
      let pipelineValue = 0, wonValue = 0, wonCount = 0, lostCount = 0, openCount = 0;
      const stageMap: Record<string, { count: number; value: number; color: string; position: number }> = {};
      for (const d of dealsRaw) {
        const amt = Number(d.amount) || 0;
        const stage = (d as any).pipeline_stages;
        const stageName  = stage?.name     ?? 'Sem etapa';
        const stageColor = stage?.color    ?? '#60a5fa';
        const stagePos   = stage?.position ?? 99;
        if (d.status === 'open') {
          pipelineValue += amt; openCount++;
          if (!stageMap[stageName]) stageMap[stageName] = { count: 0, value: 0, color: stageColor, position: stagePos };
          stageMap[stageName].count++;
          stageMap[stageName].value += amt;
        } else if (d.status === 'won')  { wonValue += amt; wonCount++; }
        else if (d.status === 'lost')   { lostCount++; }
      }
      const total = wonCount + lostCount;
      const conversionRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;
      const dealsByStage = Object.entries(stageMap)
        .map(([stage, v]) => ({ stage, ...v }))
        .sort((a, b) => a.position - b.position);
      const dealsByStatus = [
        { status: 'Em aberto', total: openCount, color: '#60a5fa' },
        { status: 'Ganhos',    total: wonCount,  color: '#34d399' },
        { status: 'Perdidos',  total: lostCount, color: '#f43f5e' },
      ].filter(s => s.total > 0);
      setCommercial({ pipelineValue, wonValue, wonCount, lostCount, conversionRate, dealsByStage, dealsByStatus });
    } finally { setCommercialLoading(false); }
  }, [currentCompany]);

  // ── fetchTrend ──────────────────────────────────────────────
  const fetchTrend = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setTrendLoading(true);
    const sinceDate = periodToStartDate(activePeriod).substring(0, 10);
    try {
      const { data } = await supabase
        .from('kpi_company_daily_snapshots')
        .select('snapshot_date, won_amount, new_deals, won_deals, lost_deals, new_leads')
        .eq('company_id', currentCompany.id)
        .gte('snapshot_date', sinceDate)
        .order('snapshot_date', { ascending: true });
      if (!data) return;
      setTrend(data.map(row => ({
        date: new Date(row.snapshot_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        wonAmount: Number(row.won_amount) || 0,
        newDeals:  row.new_deals  || 0,
        wonDeals:  row.won_deals  || 0,
        lostDeals: row.lost_deals || 0,
        newLeads:  row.new_leads  || 0,
      })));
    } finally { setTrendLoading(false); }
  }, [currentCompany]);

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    fetchKPIs(p); fetchCharts(p); fetchCommercial(p); fetchTrend(p);
  }, [fetchKPIs, fetchCharts, fetchCommercial, fetchTrend]);

  useEffect(() => {
    fetchKPIs(period); fetchCharts(period); fetchCommercial(period); fetchTrend(period);
  }, [currentCompany, period, fetchKPIs, fetchCharts, fetchCommercial, fetchTrend]);

  if (!currentCompany) return (
    <div className="p-8 text-stone-500 font-mono uppercase text-xs tracking-widest text-center mt-20">
      Nenhuma empresa no contexto.
    </div>
  );

  const hasTrendData  = trend.some(p => p.wonAmount > 0 || p.newDeals > 0);
  const maxStageValue = commercial ? Math.max(...commercial.dealsByStage.map(s => s.value), 1) : 1;

  // ── Urgency counts ──────────────────────────────────────────
  const urgentConvs = charts?.conversasPorPrioridade.find(p => p.prioridade === 'Urgente')?.total ?? 0;
  const overdueTasks = kpis?.overdue_tasks ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">

      {/* ══════════════════════════════════════════════════════════
          HEADER — Título + filtro de período
      ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <span className="text-[10px] font-mono uppercase text-stone-600 tracking-widest block mb-1.5">
            Visão Comercial
          </span>
          <h1 className="text-3xl font-medium tracking-tight text-primary flex items-baseline gap-3">
            Dashboard
            <span className="text-stone-500 text-xl font-normal">{currentCompany.name}</span>
          </h1>
        </div>
        <PeriodFilter value={period} onChange={handlePeriodChange} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          ERRO
      ══════════════════════════════════════════════════════════ */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-2"><AlertCircle size={16} />{error}</div>
          <button
            onClick={() => { fetchKPIs(period); fetchCharts(period); }}
            className="text-xs font-mono px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          HERO STRIP — Receita + pipeline + conversão em destaque
      ══════════════════════════════════════════════════════════ */}
      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        {/* faint glow accent */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Receita fechada — número principal */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">
              Receita Fechada no Período
            </p>
            {commercialLoading ? (
              <div className="h-14 w-48 bg-white/5 rounded-lg animate-pulse" />
            ) : (
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-light tracking-tight text-emerald-400 tabular-nums">
                  {fmtShort(commercial?.wonValue ?? 0)}
                </span>
                {(commercial?.wonCount ?? 0) > 0 && (
                  <span className="text-sm text-stone-500 font-mono">
                    {commercial!.wonCount} deal{commercial!.wonCount > 1 ? 's' : ''} ganho{commercial!.wonCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Stats chips */}
          <div className="flex flex-wrap gap-2 lg:gap-3 lg:shrink-0">
            {commercialLoading ? (
              <div className="h-14 w-64 bg-white/5 rounded-lg animate-pulse" />
            ) : commercial ? (
              <>
                <HeroStat
                  label="Pipeline em Aberto"
                  value={fmtShort(commercial.pipelineValue)}
                  icon={<DollarSign size={14} />}
                  color="blue"
                />
                <HeroStat
                  label="Taxa de Conversão"
                  value={`${commercial.conversionRate}%`}
                  icon={<Percent size={14} />}
                  color="emerald"
                />
                <HeroStat
                  label="Deals Perdidos"
                  value={commercial.lostCount.toString()}
                  icon={<Trophy size={14} />}
                  color="rose"
                />
              </>
            ) : null}
          </div>
        </div>

        {/* Sparkline de receita embutida no hero */}
        {!trendLoading && hasTrendData && (
          <div className="mt-5 h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#34d399" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="wonAmount" stroke="#34d399" strokeWidth={1.5}
                  fill="url(#heroGrad)" dot={false} activeDot={{ r: 3, fill: '#34d399', strokeWidth: 0 }} />
                <Tooltip content={<DarkTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          SINAIS DE URGÊNCIA
      ══════════════════════════════════════════════════════════ */}
      {(!loading && !chartsLoading) && (urgentConvs > 0 || overdueTasks > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <UrgencySignal
            count={urgentConvs}
            label="Conversas Urgentes"
            icon={<Zap size={16} />}
            level={urgentConvs > 0 ? 'critical' : 'ok'}
          />
          <UrgencySignal
            count={overdueTasks}
            label="Tarefas Atrasadas"
            icon={<Clock size={16} />}
            level={overdueTasks >= 5 ? 'critical' : overdueTasks > 0 ? 'warn' : 'ok'}
          />
          <UrgencySignal
            count={kpis?.open_conversations ?? 0}
            label="Conversas Abertas"
            icon={<Inbox size={16} />}
            level="ok"
          />
          <UrgencySignal
            count={kpis?.qualified_leads ?? 0}
            label="Leads Qualificados"
            icon={<BadgeCheck size={16} />}
            level="ok"
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          FAIXA DE KPIs OPERACIONAIS
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          title="Mensagens Trocadas"
          value={kpis?.total_messages.toLocaleString('pt-BR') ?? '—'}
          icon={<MessageSquare size={15} />}
          accent="text-blue-400"
          loading={loading}
        />
        <StatCard
          title="Leads Ativos"
          value={kpis?.total_leads ?? '—'}
          icon={<Target size={15} />}
          accent="text-violet-400"
          loading={loading}
        />
        <StatCard
          title="Conversas Abertas"
          value={kpis?.open_conversations ?? '—'}
          icon={<Inbox size={15} />}
          accent="text-blue-400"
          loading={loading}
        />
        <StatCard
          title="Leads Qualificados"
          value={kpis?.qualified_leads ?? '—'}
          icon={<BadgeCheck size={15} />}
          accent="text-emerald-400"
          loading={loading}
        />
        <StatCard
          title="Tarefas Atrasadas"
          value={kpis?.overdue_tasks ?? '—'}
          icon={<AlertCircle size={15} />}
          trend={
            kpis
              ? kpis.overdue_tasks === 0 ? 'Em dia' : `${kpis.overdue_tasks} pendente${kpis.overdue_tasks > 1 ? 's' : ''}`
              : undefined
          }
          trendDir={kpis ? (kpis.overdue_tasks === 0 ? 'up' : 'down') : undefined}
          accent="text-rose-400"
          loading={loading}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════
          LINHA PRINCIPAL — Receita + Pipeline
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Receita Fechada por Dia — área grande */}
        <div className="lg:col-span-2">
          {trendLoading ? (
            <SkeletonPanel h="h-72" />
          ) : (
            <Panel
              title="Receita Fechada por Dia"
              subtitle="Evolução de deals ganhos no período"
              action={
                <span className="flex items-center gap-1 text-[10px] font-mono text-stone-600 hover:text-stone-400 cursor-pointer transition-colors">
                  Ver deals <ChevronRight size={10} />
                </span>
              }
            >
              {hasTrendData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trend} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={fmtShort} tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
                    <Tooltip content={<DarkTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="wonAmount" name="Receita" stroke="#34d399" strokeWidth={2}
                      fill="url(#gradWon)" dot={false} activeDot={{ r: 4, fill: '#34d399', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-52 text-stone-600 text-sm italic">
                  Sem dados de receita no período
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Pipeline por Etapa — valor em R$ */}
        <div>
          {commercialLoading ? (
            <SkeletonPanel h="h-72" />
          ) : (
            <Panel
              title="Pipeline por Etapa"
              subtitle="Valor em aberto"
              className="h-full"
            >
              {commercial && commercial.dealsByStage.length > 0 ? (
                <div className="space-y-4 flex-1">
                  {commercial.dealsByStage.map(s => (
                    <StageBar
                      key={s.stage}
                      label={s.stage}
                      count={s.count}
                      value={s.value}
                      color={s.color}
                      maxValue={maxStageValue}
                    />
                  ))}
                  {/* total */}
                  <div className="flex items-center justify-between pt-3 border-t border-border mt-4">
                    <span className="text-[10px] text-stone-600 font-mono uppercase tracking-wider">Total em aberto</span>
                    <span className="text-sm font-semibold text-stone-200">{fmt(commercial.pipelineValue)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-stone-600 italic py-8 text-center">Nenhum deal em aberto</p>
              )}
            </Panel>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          LINHA 2 — Atividade do Pipeline + Resultado dos Deals
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Atividade do pipeline — barras agrupadas */}
        {trendLoading ? <SkeletonPanel /> : (
          <Panel title="Atividade do Pipeline" subtitle="Novos, ganhos e perdidos por dia">
            {hasTrendData ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend} barSize={5} barGap={2} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="newDeals"  name="Novos"    fill="#60a5fa" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="wonDeals"  name="Ganhos"   fill="#34d399" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="lostDeals" name="Perdidos" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 text-[10px] text-stone-500 font-mono">
                  {([['#60a5fa', 'Novos'], ['#34d399', 'Ganhos'], ['#f43f5e', 'Perdidos']] as [string, string][]).map(([color, label]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />{label}
                    </span>
                  ))}
                </div>
              </>
            ) : commercial && commercial.dealsByStatus.length > 0 ? (
              /* fallback: pizza de status */
              <div className="flex items-center justify-center gap-8">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={commercial.dealsByStatus} dataKey="total" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}>
                      {commercial.dealsByStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2.5 text-xs">
                  {commercial.dealsByStatus.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-stone-400">{item.status}</span>
                      <span className="text-stone-200 font-medium ml-auto pl-4">{item.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-600 italic py-8 text-center">Sem dados de pipeline</p>
            )}
          </Panel>
        )}

        {/* Funil de contatos */}
        {chartsLoading ? <SkeletonPanel /> : (
          <Panel title="Funil de Contatos" subtitle="Distribuição por estágio de maturidade">
            {charts && charts.contatosPorEstagio.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.contatosPorEstagio} layout="vertical" barSize={16} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="estagio" tick={{ fill: '#a8a29e', fontSize: 11 }} axisLine={false} tickLine={false} width={88} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="total" name="Contatos" radius={[0, 4, 4, 0]}>
                    {charts.contatosPorEstagio.map((_, i) => {
                      const colors = ['#a78bfa', '#818cf8', '#60a5fa', '#34d399', '#f43f5e'];
                      return <Cell key={i} fill={colors[i % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-stone-600 italic py-8 text-center">Nenhum contato registrado</p>
            )}
          </Panel>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          LINHA 3 — Conversas por canal + Tarefas + Prioridade
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {chartsLoading ? (
          <>
            <SkeletonPanel h="h-48" />
            <SkeletonPanel h="h-48" />
            <SkeletonPanel h="h-48" />
          </>
        ) : charts ? (
          <>
            {/* Conversas por canal */}
            <Panel title="Por Canal" subtitle="Volume de conversas">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={charts.conversasPorCanal} barSize={22} margin={{ top: 0, right: 8, left: -22, bottom: 0 }}>
                  <XAxis dataKey="canal" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="total" name="Conversas" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            {/* Tarefas por status */}
            <Panel title="Tarefas" subtitle="Distribuição por status">
              <div className="flex items-center gap-4 flex-1">
                <ResponsiveContainer width="55%" height={150}>
                  <PieChart>
                    <Pie data={charts.tasksPorStatus} dataKey="total" nameKey="status" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3}>
                      {charts.tasksPorStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 text-[11px] flex-1 min-w-0">
                  {charts.tasksPorStatus.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-stone-500 truncate">{item.status}</span>
                      <span className="text-stone-200 font-medium ml-auto pl-2">{item.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* Conversas por prioridade */}
            <Panel title="Por Prioridade" subtitle="Nível de urgência das conversas">
              <div className="flex items-center gap-4 flex-1">
                <ResponsiveContainer width="55%" height={150}>
                  <PieChart>
                    <Pie data={charts.conversasPorPrioridade} dataKey="total" nameKey="prioridade" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3}>
                      {charts.conversasPorPrioridade.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 text-[11px] flex-1 min-w-0">
                  {charts.conversasPorPrioridade.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-stone-500 truncate">{item.prioridade}</span>
                      <span className="text-stone-200 font-medium ml-auto pl-2">{item.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </>
        ) : null}
      </div>

      {/* ══════════════════════════════════════════════════════════
          SEÇÃO "EM BREVE" — Analytics avançados
      ══════════════════════════════════════════════════════════ */}
      <div className="border-t border-border pt-8">
        <div className="flex items-center gap-2 mb-6">
          <Activity size={13} className="text-stone-600" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-stone-600">Analytics Avançados</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <ComingSoon
            title="Gargalos do Funil"
            desc="Tempo médio por etapa e taxa de avanço — onde o pipeline vaza"
          />
          <ComingSoon
            title="Forecast Ponderado"
            desc="Previsão de receita por estágio × probabilidade de ganho"
          />
          <ComingSoon
            title="Ranking de Vendedores"
            desc="Performance por agente: receita, win rate, tempo de resposta"
          />
          <ComingSoon
            title="Ticket Médio & Concentração"
            desc="Qualidade do pipeline e dependência de grandes deals"
          />
        </div>
      </div>

    </div>
  );
};
