import React, { useEffect, useState, useCallback } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PeriodFilter, periodToStartDate } from '../components/Dashboard/PeriodFilter';
import type { Period } from '../components/Dashboard/PeriodFilter';
import {
  ComposedChart, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, Trophy, Percent, AlertCircle,
  MessageSquare, Target, Inbox, BadgeCheck, Zap,
  Clock, ArrowUpRight, ArrowDownRight, Minus,
  ChevronRight, Activity, TrendingUp, Award, Users,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

interface KPIData {
  total_messages:     number; // fluxo: mensagens no período selecionado
  total_leads:        number; // snapshot: leads ativos agora
  open_conversations: number; // snapshot: conversas abertas agora
  qualified_leads:    number; // snapshot: contatos qualificados agora
  overdue_tasks:      number; // snapshot: tarefas vencidas agora
}

interface ChartData {
  conversasPorCanal:      { canal: string; total: number }[];
  tasksPorStatus:         { status: string; total: number; color: string }[];
  conversasPorPrioridade: { prioridade: string; total: number; color: string }[];
}

interface CommercialData {
  pipelineValue:    number; // deals abertos criados no período selecionado
  wonValue:         number; // deals ganhos criados no período
  wonCount:         number;
  lostCount:        number;
  totalInPeriod:    number; // total de deals criados no período (base da conversão)
  conversionRate:   number; // wonCount / totalInPeriod
  dealsByStage:     { stage: string; count: number; value: number; color: string; position: number }[];
  dealsByStatus:    { status: string; total: number; color: string }[];
}

interface TrendPoint {
  date:                string;
  wonAmount:           number; // receita fechada no dia (fluxo)
  openPipelineAmount:  number; // pipeline em aberto no final do dia (estoque)
  newDeals:            number;
  wonDeals:            number;
  lostDeals:           number;
  newLeads:            number;
}

interface PipelineConversionRow {
  stage_name:        string;
  position:          number;
  total_deals:       number;
  open_deals:        number;
  won_deals:         number;
  open_amount:       number;
  won_amount:        number;
  weighted_forecast: number;
}

interface AgentPerfRow {
  user_id:                string;
  full_name:              string;
  deals_won:              number;
  deals_total:            number;
  won_amount:             number;
  win_rate_pct:           number;
  avg_first_response_min: number | null;
}

// ── Label maps ──────────────────────────────────────────────────

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'E-mail', webchat: 'WebChat',
  instagram: 'Instagram', telegram: 'Telegram', facebook: 'Facebook',
};
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

/** Gera array de datas ISO (YYYY-MM-DD) do dia inicial até hoje (inclusive) */
function generateDateRange(fromDateStr: string): string[] {
  const result: string[] = [];
  const start = new Date(fromDateStr + 'T12:00:00Z');
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= today) {
    result.push(cur.toISOString().substring(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return result;
}

// ── Tooltip ─────────────────────────────────────────────────────

const CURRENCY_KEYS = new Set(['wonAmount', 'openPipelineAmount', 'open_amount', 'won_amount', 'weighted_forecast']);

const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-stone-500 mb-1 font-mono">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="text-text-main">
          {p.name ? `${p.name}: ` : ''}
          <strong>{CURRENCY_KEYS.has(p.dataKey) ? fmt(p.value) : p.value}</strong>
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
    emerald: 'bg-emerald-50  border-emerald-200  text-emerald-700  dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400',
    rose:    'bg-rose-50     border-rose-200     text-rose-700     dark:bg-rose-500/10    dark:border-rose-500/20    dark:text-rose-400',
    blue:    'bg-blue-50     border-blue-200     text-blue-700     dark:bg-blue-500/10    dark:border-blue-500/20    dark:text-blue-400',
    amber:   'bg-amber-50    border-amber-200    text-amber-700    dark:bg-amber-500/10   dark:border-amber-500/20   dark:text-amber-400',
  }[color];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${colors}`}>
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider opacity-60">{label}</p>
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
  subtitle?: string;
  trend?: string;
  trendDir?: 'up' | 'down' | 'flat';
  accent?: string;
  loading?: boolean;
}> = ({ title, value, icon, subtitle, trend, trendDir, accent = 'text-stone-400', loading }) => {
  if (loading) return <div className="glass-panel rounded-xl p-5 animate-pulse h-28" />;
  const TrendIcon = trendDir === 'up' ? ArrowUpRight : trendDir === 'down' ? ArrowDownRight : Minus;
  const trendColor = trendDir === 'up' ? 'text-emerald-600 dark:text-emerald-400' : trendDir === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500';
  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-4 hover:border-stone-300 dark:hover:border-white/10 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[11px] text-stone-500 font-medium leading-snug">{title}</span>
          {subtitle && <p className="text-[10px] text-stone-400 dark:text-stone-600 mt-0.5">{subtitle}</p>}
        </div>
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
        <h3 className="text-[11px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-widest">{title}</h3>
        {subtitle && <p className="text-[10px] text-stone-400 dark:text-stone-600 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

/**
 * Barra de etapa do pipeline — proporcional ao TOTAL de deals em TODAS as etapas.
 * Assim Prospecção com 5 de 10 deals mostra 50%, não 100%.
 */
const StageBar: React.FC<{
  label: string;
  count: number;
  value: number;
  color: string;
  totalCount: number;
}> = ({ label, count, value, color, totalCount }) => {
  const pct = totalCount > 0 ? Math.max(2, (count / totalCount) * 100) : 2;
  return (
    <div className="flex items-center gap-3 group">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{label}</span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-[10px] text-stone-400 dark:text-stone-600 font-mono tabular-nums">
              {count} deal{count !== 1 ? 's' : ''}
            </span>
            <span className="text-[11px] font-semibold text-stone-800 dark:text-stone-200">{fmtShort(value)}</span>
          </div>
        </div>
        <div className="h-1 w-full bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden">
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
    critical: 'bg-rose-50   border-rose-200   text-rose-700   dark:bg-rose-500/8   dark:border-rose-500/20   dark:text-rose-400',
    warn:     'bg-amber-50  border-amber-200  text-amber-700  dark:bg-amber-500/8  dark:border-amber-500/20  dark:text-amber-400',
    ok:       'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/8 dark:border-emerald-500/20 dark:text-emerald-400',
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

const SkeletonPanel = ({ h = 'h-56' }: { h?: string }) => (
  <div className={`glass-panel rounded-xl p-5 animate-pulse ${h}`}>
    <div className="h-2.5 bg-stone-100 dark:bg-white/5 rounded w-1/5 mb-6" />
    <div className="h-full bg-stone-100 dark:bg-white/5 rounded" />
  </div>
);

// ── Dashboard ────────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { currentCompany, companyRole, impersonatedUser } = useTenant();
  const { user } = useAuth();

  const [period, setPeriod]                         = useState<Period>('today');
  const [loading, setLoading]                       = useState(true);
  const [chartsLoading, setChartsLoading]           = useState(true);
  const [error, setError]                           = useState<string | null>(null);
  const [kpis, setKpis]                             = useState<KPIData | null>(null);
  const [charts, setCharts]                         = useState<ChartData | null>(null);
  const [commercial, setCommercial]                 = useState<CommercialData | null>(null);
  const [commercialLoading, setCommercialLoading]   = useState(true);
  const [trend, setTrend]                           = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading]             = useState(true);
  const [pipelineConv, setPipelineConv]             = useState<PipelineConversionRow[]>([]);
  const [agentPerf, setAgentPerf]                   = useState<AgentPerfRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading]     = useState(true);

  const isAgentView     = companyRole === 'agent';
  const effectiveUserId = (impersonatedUser ?? user)?.id ?? null;

  // ── fetchKPIs ───────────────────────────────────────────────
  // Separação deliberada: total_messages filtra por período (fluxo)
  // os demais KPIs são snapshot do estado atual (sem filtro de data)
  const fetchKPIs = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setLoading(true); setError(null);
    const since = periodToStartDate(activePeriod);
    try {
      if (isAgentView && effectiveUserId) {
        const [convRes, messagesRes, leadsRes, qualifiedDealsRes, overdueRes] = await Promise.all([
          // Conversas abertas do agente — snapshot atual
          supabase.from('conversations').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'open').eq('assigned_to', effectiveUserId),
          // Mensagens no período selecionado — fluxo
          supabase.from('messages')
            .select('id, conversations!inner(company_id, assigned_to)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id)
            .eq('conversations.assigned_to', effectiveUserId).gte('created_at', since),
          // Leads em aberto do agente — snapshot atual
          supabase.from('contacts').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'lead')
            .eq('owner_user_id', effectiveUserId),
          // Leads qualificados = contatos com deal aberto sob este agente
          supabase.from('deals').select('contact_id')
            .eq('company_id', currentCompany.id).eq('status', 'open')
            .eq('owner_user_id', effectiveUserId).not('contact_id', 'is', null),
          // Tarefas vencidas e não concluídas — snapshot atual
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('assigned_to_user_id', effectiveUserId)
            .lt('due_at', new Date().toISOString())
            .not('status', 'in', '("done","cancelled")'),
        ]);
        const qualifiedCount = new Set(qualifiedDealsRes.data?.map(d => d.contact_id) ?? []).size;
        setKpis({
          total_messages:     messagesRes.count ?? 0,
          total_leads:        leadsRes.count    ?? 0,
          open_conversations: convRes.count     ?? 0,
          qualified_leads:    qualifiedCount,
          overdue_tasks:      overdueRes.count  ?? 0,
        });
      } else {
        const [viewRes, messagesRes, qualifiedDealsRes, overdueRes] = await Promise.all([
          // Snapshot atual via view analítica (total_leads e open_conversations)
          supabase.from('v_company_kpis')
            .select('total_leads, open_conversations')
            .eq('company_id', currentCompany.id).single(),
          // Mensagens trocadas no período — fluxo
          supabase.from('messages')
            .select('id, conversations!inner(company_id)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id).gte('created_at', since),
          // Leads qualificados = contatos distintos com deal aberto no pipeline
          supabase.from('deals').select('contact_id')
            .eq('company_id', currentCompany.id).eq('status', 'open').not('contact_id', 'is', null),
          // Tarefas vencidas — query direta (v_company_kpis usa 'pending' que não existe no enum)
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .lt('due_at', new Date().toISOString())
            .not('status', 'in', '("done","cancelled")'),
        ]);
        if (viewRes.error && viewRes.error.code !== 'PGRST116') throw viewRes.error;
        const v = viewRes.data;
        const qualifiedCount = new Set(qualifiedDealsRes.data?.map(d => d.contact_id) ?? []).size;
        setKpis({
          total_messages:     messagesRes.count    ?? 0,
          total_leads:        v?.total_leads        ?? 0,
          open_conversations: v?.open_conversations ?? 0,
          qualified_leads:    qualifiedCount,
          overdue_tasks:      overdueRes.count      ?? 0,
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
    let convQuery  = supabase.from('conversations').select('channel, priority').eq('company_id', currentCompany.id).gte('created_at', since);
    let tasksQuery = supabase.from('tasks').select('status').eq('company_id', currentCompany.id).gte('created_at', since);
    if (isAgentView && effectiveUserId) {
      convQuery  = convQuery.eq('assigned_to', effectiveUserId);
      tasksQuery = tasksQuery.eq('assigned_to_user_id', effectiveUserId);
    }
    try {
      const [convRes, tasksRes] = await Promise.all([convQuery, tasksQuery]);
      const canalCount: Record<string, number> = {};
      convRes.data?.forEach(r => { const k = r.channel || 'outro'; canalCount[k] = (canalCount[k] ?? 0) + 1; });
      const conversasPorCanal = Object.entries(canalCount)
        .map(([canal, total]) => ({ canal: CANAL_LABELS[canal] ?? canal, total }))
        .sort((a, b) => b.total - a.total);
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
      setCharts({ conversasPorCanal, tasksPorStatus, conversasPorPrioridade });
    } finally { setChartsLoading(false); }
  }, [currentCompany, isAgentView, effectiveUserId]);

  // ── fetchCommercial ─────────────────────────────────────────
  // REGRA: todos os campos usam created_at >= since para consistência com o período.
  // Pipeline em aberto = deals com status='open' criados no período.
  // Taxa de conversão = wonCount / totalInPeriod (fechados / entrados no período).
  const fetchCommercial = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setCommercialLoading(true);
    const since = periodToStartDate(activePeriod);
    try {
      // Única query: todos os deals criados no período, independente de status
      const { data: dealsData } = await supabase
        .from('deals')
        .select('status, amount, pipeline_stages(name, color, position)')
        .eq('company_id', currentCompany.id)
        .gte('created_at', since);

      let pipelineValue = 0;
      let wonValue = 0, wonCount = 0, lostCount = 0;
      const stageMap: Record<string, { count: number; value: number; color: string; position: number }> = {};

      for (const d of (dealsData ?? [])) {
        const amt        = Number(d.amount) || 0;
        const stage      = (d as any).pipeline_stages;
        const stageName  = stage?.name     ?? 'Sem etapa';
        const stageColor = stage?.color    ?? '#60a5fa';
        const stagePos   = stage?.position ?? 99;

        if (d.status === 'open') {
          pipelineValue += amt;
          if (!stageMap[stageName]) stageMap[stageName] = { count: 0, value: 0, color: stageColor, position: stagePos };
          stageMap[stageName].count++;
          stageMap[stageName].value += amt;
        } else if (d.status === 'won') {
          wonValue += amt;
          wonCount++;
        } else if (d.status === 'lost') {
          lostCount++;
        }
      }

      const totalInPeriod = (dealsData ?? []).length;
      // Conversão: dos leads que ENTRARAM no período, quantos fecharam como ganhos
      const conversionRate = totalInPeriod > 0 ? Math.round((wonCount / totalInPeriod) * 100) : 0;
      const dealsByStage = Object.entries(stageMap)
        .map(([stage, v]) => ({ stage, ...v }))
        .sort((a, b) => a.position - b.position);
      const openCount = dealsByStage.reduce((s, d) => s + d.count, 0);
      const dealsByStatus = [
        { status: 'Em aberto', total: openCount, color: '#60a5fa' },
        { status: 'Ganhos',    total: wonCount,  color: '#34d399' },
        { status: 'Perdidos',  total: lostCount, color: '#f43f5e' },
      ].filter(s => s.total > 0);
      setCommercial({ pipelineValue, wonValue, wonCount, lostCount, totalInPeriod, conversionRate, dealsByStage, dealsByStatus });
    } finally { setCommercialLoading(false); }
  }, [currentCompany]);

  // ── fetchTrend ──────────────────────────────────────────────
  // Tenta v_kpi_company_daily (view on-the-fly, não precisa de cron).
  // Se a view não existir ou retornar vazio, constrói a série de deals diretamente.
  // open_pipeline_amount na view = coorte (deals criados naquele dia, ainda abertos hoje).
  const fetchTrend = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setTrendLoading(true);
    const sinceDate = periodToStartDate(activePeriod).substring(0, 10);
    try {
      // ── Tenta a view analítica ─────────────────────────────
      const { data: viewData, error: viewErr } = await supabase
        .from('v_kpi_company_daily')
        .select('reference_date, won_amount, open_pipeline_amount, new_deals, won_deals, lost_deals')
        .eq('company_id', currentCompany.id)
        .gte('reference_date', sinceDate)
        .order('reference_date', { ascending: true });

      if (!viewErr && viewData && viewData.length > 0) {
        setTrend(viewData.map(row => ({
          date:               new Date(row.reference_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          wonAmount:          Number(row.won_amount)           || 0,
          openPipelineAmount: Number(row.open_pipeline_amount) || 0,
          newDeals:           row.new_deals   || 0,
          wonDeals:           row.won_deals   || 0,
          lostDeals:          row.lost_deals  || 0,
          newLeads:           0,
        })));
        return;
      }

      // ── Fallback: constrói a série a partir da tabela deals ──
      // updated_at como proxy para data de fechamento (won/lost),
      // para cobrir deals antigos sem closed_at preenchido.
      const [wonRes, allRes] = await Promise.all([
        supabase.from('deals')
          .select('updated_at, amount')
          .eq('company_id', currentCompany.id)
          .eq('status', 'won')
          .gte('updated_at', sinceDate),
        supabase.from('deals')
          .select('created_at, status, amount')
          .eq('company_id', currentCompany.id)
          .gte('created_at', sinceDate),
      ]);

      const wonByDay: Record<string, { wonAmount: number; wonDeals: number }> = {};
      const actByDay: Record<string, { newDeals: number; lostDeals: number; openAmount: number }> = {};

      for (const d of (wonRes.data ?? [])) {
        const day = (d.updated_at as string).substring(0, 10);
        if (!wonByDay[day]) wonByDay[day] = { wonAmount: 0, wonDeals: 0 };
        wonByDay[day].wonAmount += Number(d.amount) || 0;
        wonByDay[day].wonDeals++;
      }
      for (const d of (allRes.data ?? [])) {
        const day = (d.created_at as string).substring(0, 10);
        if (!actByDay[day]) actByDay[day] = { newDeals: 0, lostDeals: 0, openAmount: 0 };
        actByDay[day].newDeals++;
        if (d.status === 'lost') actByDay[day].lostDeals++;
        if (d.status === 'open') actByDay[day].openAmount += Number(d.amount) || 0;
      }

      const days = generateDateRange(sinceDate);
      setTrend(days.map(dateStr => ({
        date:               new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        wonAmount:          wonByDay[dateStr]?.wonAmount  ?? 0,
        openPipelineAmount: actByDay[dateStr]?.openAmount ?? 0,
        newDeals:           actByDay[dateStr]?.newDeals   ?? 0,
        wonDeals:           wonByDay[dateStr]?.wonDeals   ?? 0,
        lostDeals:          actByDay[dateStr]?.lostDeals  ?? 0,
        newLeads:           0,
      })));
    } finally { setTrendLoading(false); }
  }, [currentCompany]);

  // ── fetchAnalytics ──────────────────────────────────────────
  // Sempre filtra por período (created_at >= since) para evitar acúmulo histórico.
  // Isso garante que "Conversão do Pipeline" mostre apenas deals criados no período,
  // corrigindo o percentual inflado por wins históricos de etapas anteriores.
  const fetchAnalytics = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setAnalyticsLoading(true);
    const since = periodToStartDate(activePeriod);
    try {
      const [convRes, agentRes] = await Promise.all([
        // Deals criados no período, por etapa — fonte canônica da conversão
        supabase.from('deals')
          .select('status, amount, stage_id, pipeline_stages(name, position)')
          .eq('company_id', currentCompany.id)
          .gte('created_at', since),
        // Performance por agente — também filtra pelo período
        isAgentView
          ? Promise.resolve({ data: [] as any[], error: null })
          : supabase.from('deals')
              .select('status, amount, owner_user_id, assigned_user:owner_user_id(full_name)')
              .eq('company_id', currentCompany.id)
              .not('owner_user_id', 'is', null)
              .gte('created_at', since),
      ]);

      // ── Conversão do Pipeline por etapa ────────────────────
      if (convRes.data) {
        const map: Record<string, PipelineConversionRow> = {};
        for (const d of convRes.data) {
          const st = (d as any).pipeline_stages;
          if (!st) continue;
          if (!map[st.name]) map[st.name] = {
            stage_name: st.name, position: st.position ?? 99,
            total_deals: 0, open_deals: 0, won_deals: 0,
            open_amount: 0, won_amount: 0, weighted_forecast: 0,
          };
          map[st.name].total_deals++;
          if (d.status === 'open') { map[st.name].open_deals++; map[st.name].open_amount += Number(d.amount) || 0; }
          if (d.status === 'won')  { map[st.name].won_deals++;  map[st.name].won_amount  += Number(d.amount) || 0; }
        }
        setPipelineConv(Object.values(map).sort((a, b) => a.position - b.position));
      }

      // ── Performance por Agente ──────────────────────────────
      if (!isAgentView && agentRes.data) {
        const amap: Record<string, AgentPerfRow> = {};
        for (const d of agentRes.data) {
          const uid = d.owner_user_id as string;
          if (!amap[uid]) amap[uid] = {
            user_id: uid,
            full_name: (d as any).assigned_user?.full_name ?? 'Sem nome',
            deals_won: 0, deals_total: 0, won_amount: 0,
            win_rate_pct: 0, avg_first_response_min: null,
          };
          amap[uid].deals_total++;
          if (d.status === 'won') { amap[uid].deals_won++; amap[uid].won_amount += Number(d.amount) || 0; }
        }
        const agents = Object.values(amap)
          .map(a => ({ ...a, win_rate_pct: a.deals_total > 0 ? Math.round((a.deals_won / a.deals_total) * 100) : 0 }))
          .sort((a, b) => b.won_amount - a.won_amount)
          .slice(0, 6);
        setAgentPerf(agents);
      }
    } catch {
      // silencia erros de views inexistentes
    } finally { setAnalyticsLoading(false); }
  }, [currentCompany, isAgentView]);

  // Só altera o período — os useEffects disparam os fetches automaticamente
  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
  }, []);

  useEffect(() => {
    fetchKPIs(period); fetchCharts(period); fetchCommercial(period); fetchTrend(period); fetchAnalytics(period);
  }, [currentCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchKPIs(period); fetchCharts(period); fetchCommercial(period); fetchTrend(period); fetchAnalytics(period);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentCompany) return (
    <div className="p-8 text-stone-500 font-mono uppercase text-xs tracking-widest text-center mt-20">
      Nenhuma empresa no contexto.
    </div>
  );

  const hasTrendData     = trend.some(p => p.wonAmount > 0 || p.openPipelineAmount > 0 || p.newDeals > 0);
  // total de deals em aberto por todas as etapas — denominador para proporção correta das barras
  const totalStageCount  = commercial
    ? Math.max(1, commercial.dealsByStage.reduce((s, d) => s + d.count, 0))
    : 1;
  const urgentConvs      = charts?.conversasPorPrioridade.find(p => p.prioridade === 'Urgente')?.total ?? 0;
  const overdueTasks     = kpis?.overdue_tasks ?? 0;
  const totalForecast    = pipelineConv.reduce((s, r) => s + (r.weighted_forecast ?? 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">

      {/* ══════════════════════════════════════════════════════════
          HEADER
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
          HERO STRIP — Pipeline em Aberto como KPI principal
      ══════════════════════════════════════════════════════════ */}
      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        {/* faint glow accent — azul pois pipeline é o destaque */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Pipeline em Aberto — número principal */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-0.5">
              Pipeline em Aberto
            </p>
            <p className="text-[9px] font-mono text-stone-600 mb-2">
              Deals criados no período · {period === 'today' ? 'hoje' : period === '7d' ? 'últimos 7 dias' : period === '30d' ? 'este mês' : 'últimos 90 dias'}
            </p>
            {commercialLoading ? (
              <div className="h-14 w-56 bg-stone-100 dark:bg-white/5 rounded-lg animate-pulse" />
            ) : (
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-5xl font-light tracking-tight text-blue-600 dark:text-blue-400 tabular-nums">
                  {fmtShort(commercial?.pipelineValue ?? 0)}
                </span>
                {(commercial?.dealsByStage.reduce((s, d) => s + d.count, 0) ?? 0) > 0 && (
                  <span className="text-sm text-stone-500 font-mono">
                    {commercial!.dealsByStage.reduce((s, d) => s + d.count, 0)} deal{commercial!.dealsByStage.reduce((s, d) => s + d.count, 0) !== 1 ? 's' : ''} em aberto no período
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Stats chips — receita e métricas secundárias */}
          <div className="flex flex-wrap gap-2 lg:gap-3 lg:shrink-0">
            {commercialLoading ? (
              <div className="h-14 w-64 bg-stone-100 dark:bg-white/5 rounded-lg animate-pulse" />
            ) : commercial ? (
              <>
                <HeroStat
                  label="Receita Fechada"
                  value={fmtShort(commercial.wonValue)}
                  icon={<DollarSign size={14} />}
                  color="emerald"
                />
                <HeroStat
                  label="Conversão (ganhos/entrados)"
                  value={`${commercial.conversionRate}%`}
                  icon={<Percent size={14} />}
                  color="blue"
                />
                <HeroStat
                  label="Perdidos no período"
                  value={commercial.lostCount.toString()}
                  icon={<Trophy size={14} />}
                  color="rose"
                />
                {totalForecast > 0 && (
                  <HeroStat
                    label="Forecast Ponderado"
                    value={fmtShort(totalForecast)}
                    icon={<TrendingUp size={14} />}
                    color="amber"
                  />
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* Sparkline: pipeline em aberto ao longo do período */}
        {!trendLoading && hasTrendData && trend.some(p => p.openPipelineAmount > 0) && (
          <div className="mt-5 h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="openPipelineAmount" stroke="#60a5fa" strokeWidth={1.5}
                  fill="url(#heroGrad)" dot={false} activeDot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }} />
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
          Snapshot: leads ativos, conversas abertas, qualificados, tarefas atrasadas
          Fluxo (período): mensagens trocadas
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          title="Mensagens Trocadas"
          subtitle="No período"
          value={kpis?.total_messages.toLocaleString('pt-BR') ?? '—'}
          icon={<MessageSquare size={15} />}
          accent="text-blue-400"
          loading={loading}
        />
        <StatCard
          title="Leads em Aberto"
          subtitle="Agora"
          value={kpis?.total_leads ?? '—'}
          icon={<Target size={15} />}
          accent="text-violet-400"
          loading={loading}
        />
        <StatCard
          title="Conversas Abertas"
          subtitle="Agora"
          value={kpis?.open_conversations ?? '—'}
          icon={<Inbox size={15} />}
          accent="text-blue-400"
          loading={loading}
        />
        <StatCard
          title="Leads Qualificados"
          subtitle="Agora"
          value={kpis?.qualified_leads ?? '—'}
          icon={<BadgeCheck size={15} />}
          accent="text-emerald-400"
          loading={loading}
        />
        <StatCard
          title="Tarefas Atrasadas"
          subtitle="Agora"
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
          LINHA PRINCIPAL — Comparativo Pipeline vs Receita + Pipeline por Etapa
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Comparativo: Pipeline em Aberto vs Receita Fechada */}
        <div className="lg:col-span-2">
          {trendLoading ? (
            <SkeletonPanel h="h-72" />
          ) : (
            <Panel
              title="Pipeline vs Receita Fechada"
              subtitle="Pipeline = coorte criado no dia · Receita = deals ganhos no dia"
              action={
                <span className="flex items-center gap-1 text-[10px] font-mono text-stone-600 hover:text-stone-400 cursor-pointer transition-colors">
                  Ver deals <ChevronRight size={10} />
                </span>
              }
            >
              {hasTrendData ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={trend} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradPipeline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#34d399" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tickFormatter={fmtShort} tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
                      <Tooltip content={<DarkTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
                      {/* Pipeline em aberto — área azul, preenchida */}
                      <Area
                        type="monotone"
                        dataKey="openPipelineAmount"
                        name="Pipeline Aberto"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        fill="url(#gradPipeline)"
                        dot={false}
                        activeDot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }}
                      />
                      {/* Receita fechada — barras verdes, eventos de conversão */}
                      <Bar
                        dataKey="wonAmount"
                        name="Receita Fechada"
                        fill="url(#gradWon)"
                        stroke="#34d399"
                        strokeWidth={1}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={24}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-5 text-[10px] text-stone-500 font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-1.5 rounded-full inline-block bg-blue-400" />
                      Pipeline Aberto
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-sm inline-block bg-emerald-400/80" />
                      Receita Fechada
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-52 text-stone-600 text-sm italic">
                  Sem movimentação no período
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Pipeline por Etapa — barra proporcional à QUANTIDADE de deals */}
        <div>
          {commercialLoading ? (
            <SkeletonPanel h="h-72" />
          ) : (
            <Panel
              title="Pipeline por Etapa"
              subtitle="Deals abertos criados no período · barra proporcional à qtde"
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
                      totalCount={totalStageCount}
                    />
                  ))}
                  <div className="flex items-center justify-between pt-3 border-t border-border mt-4">
                    <span className="text-[10px] text-stone-400 dark:text-stone-600 font-mono uppercase tracking-wider">Total em aberto</span>
                    <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">{fmt(commercial.pipelineValue)}</span>
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
          LINHA 2 — Atividade do Pipeline + Origem por Canal
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Atividade do pipeline — novos, ganhos e perdidos por dia */}
        {trendLoading ? <SkeletonPanel /> : (
          <Panel title="Atividade do Pipeline" subtitle="Novos, ganhos e perdidos por dia no período">
            {hasTrendData && trend.some(p => p.newDeals > 0 || p.wonDeals > 0 || p.lostDeals > 0) ? (
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
                      <span className="text-stone-700 dark:text-stone-200 font-medium ml-auto pl-4">{item.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-400 italic py-8 text-center">Sem dados de pipeline</p>
            )}
          </Panel>
        )}

        {/* Conversas por canal no período */}
        {chartsLoading ? <SkeletonPanel /> : (
          <Panel title="Conversas por Canal" subtitle={`Volume no período — ${period === 'today' ? 'hoje' : period === '7d' ? '7 dias' : period === '30d' ? 'este mês' : '90 dias'}`}>
            {charts && charts.conversasPorCanal.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.conversasPorCanal} barSize={28} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <XAxis dataKey="canal" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="total" name="Conversas" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                    {charts.conversasPorCanal.map((_, i) => {
                      const colors = ['#60a5fa', '#818cf8', '#a78bfa', '#34d399', '#f59e0b'];
                      return <Cell key={i} fill={colors[i % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-stone-600 italic py-8 text-center">Sem conversas no período</p>
            )}
          </Panel>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          LINHA 3 — Tarefas + Prioridade de Conversas
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {chartsLoading ? (
          <>
            <SkeletonPanel h="h-48" />
            <SkeletonPanel h="h-48" />
          </>
        ) : charts ? (
          <>
            <Panel title="Tarefas" subtitle="Distribuição por status no período">
              {charts.tasksPorStatus.length > 0 ? (
                <div className="flex items-center gap-4 flex-1">
                  <ResponsiveContainer width="50%" height={150}>
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
                        <span className="text-stone-700 dark:text-stone-200 font-medium ml-auto pl-2">{item.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-stone-600 italic py-8 text-center">Sem tarefas no período</p>
              )}
            </Panel>

            <Panel title="Conversas por Prioridade" subtitle="Nível de urgência no período">
              {charts.conversasPorPrioridade.length > 0 ? (
                <div className="flex items-center gap-4 flex-1">
                  <ResponsiveContainer width="50%" height={150}>
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
                        <span className="text-stone-700 dark:text-stone-200 font-medium ml-auto pl-2">{item.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-stone-600 italic py-8 text-center">Sem conversas no período</p>
              )}
            </Panel>
          </>
        ) : null}
      </div>

      {/* ══════════════════════════════════════════════════════════
          ANALYTICS AVANÇADOS — dados reais das views analíticas
      ══════════════════════════════════════════════════════════ */}
      <div className="border-t border-border pt-8">
        <div className="flex items-center gap-2 mb-6">
          <Activity size={13} className="text-stone-400 dark:text-stone-600" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-stone-400 dark:text-stone-600">Analytics Avançados</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Conversão do Pipeline por Etapa */}
          {analyticsLoading ? <SkeletonPanel /> : (
            <Panel
              title="Conversão do Pipeline"
              subtitle="Deals criados no período por etapa · conv. = ganhos / total entrados"
            >
              {pipelineConv.length > 0 ? (
                <div className="space-y-3">
                  {pipelineConv.map((row, i) => {
                    const advanceRate = row.total_deals > 0
                      ? Math.round((row.won_deals / row.total_deals) * 100)
                      : 0;
                    return (
                      <div key={i} className="flex items-center gap-3 group">
                        <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono text-stone-600 bg-stone-100 dark:bg-white/5 shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5 gap-2">
                            <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{row.stage_name}</span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[10px] text-stone-400 font-mono">{row.open_deals} abertos</span>
                              <span className="text-[10px] text-emerald-500 font-mono">{advanceRate}% conv.</span>
                              <span className="text-[11px] font-semibold text-stone-800 dark:text-stone-200">{fmtShort(row.open_amount)}</span>
                            </div>
                          </div>
                          <div className="h-1 w-full bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full transition-all duration-700"
                              style={{ width: `${Math.max(4, (row.open_deals / Math.max(...pipelineConv.map(r => r.open_deals), 1)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {totalForecast > 0 && (
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <span className="text-[10px] text-stone-400 font-mono uppercase tracking-wider">Forecast ponderado total</span>
                      <span className="text-sm font-semibold text-amber-500 dark:text-amber-400">{fmt(totalForecast)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-stone-600 italic py-8 text-center">
                  Nenhum deal encontrado para este pipeline
                </p>
              )}
            </Panel>
          )}

          {/* Ranking de Agentes */}
          {!isAgentView && (
            analyticsLoading ? <SkeletonPanel /> : (
              <Panel
                title="Performance por Agente"
                subtitle="Receita gerada · win rate (acumulado)"
                action={
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-stone-300/30 bg-stone-50 text-stone-500 dark:border-white/10 dark:bg-white/5 dark:text-stone-400">
                    Acumulado
                  </span>
                }
              >
                {agentPerf.length > 0 ? (
                  <div className="space-y-3">
                    {agentPerf.map((agent, i) => (
                      <div key={agent.user_id} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-surface-hover border border-border flex items-center justify-center text-[10px] font-semibold text-text-muted uppercase shrink-0">
                          {agent.full_name?.charAt(0) ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-[11px] text-stone-500 dark:text-stone-300 truncate font-medium">{agent.full_name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-stone-400 font-mono">{agent.deals_won}/{agent.deals_total} deals</span>
                              <span className="text-[10px] text-emerald-500 font-mono">{Math.round(agent.win_rate_pct ?? 0)}%</span>
                              <span className="text-[11px] font-semibold text-stone-800 dark:text-stone-200">{fmtShort(agent.won_amount)}</span>
                            </div>
                          </div>
                          <div className="h-1 w-full bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.max(4, (agent.won_amount / Math.max(...agentPerf.map(a => a.won_amount), 1)) * 100)}%`,
                                background: ['#60a5fa', '#a78bfa', '#34d399', '#f59e0b', '#f43f5e', '#818cf8'][i % 6],
                              }}
                            />
                          </div>
                        </div>
                        {agent.avg_first_response_min !== null && (
                          <div className="shrink-0 text-right">
                            <p className="text-[9px] text-stone-600 font-mono leading-none">1ª resp.</p>
                            <p className="text-[10px] text-stone-400 font-mono mt-0.5">
                              {agent.avg_first_response_min < 60
                                ? `${Math.round(agent.avg_first_response_min)}min`
                                : `${(agent.avg_first_response_min / 60).toFixed(1)}h`}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-600 italic py-8 text-center">
                    Nenhum deal com responsável atribuído encontrado
                  </p>
                )}
              </Panel>
            )
          )}
        </div>
      </div>

    </div>
  );
};
