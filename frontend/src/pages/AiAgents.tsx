import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Search, Loader2, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { AgentCard } from '../components/AiAgents/AgentCard';
import type { AiAgent } from '../types';

type FilterMode = 'all' | 'active' | 'inactive' | 'draft';

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Todos',
  active: 'Ativos',
  inactive: 'Inativos',
  draft: 'Rascunhos',
};

export const AiAgents: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useTenant();

  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const fetchAgents = useCallback(async () => {
    if (!currentCompany) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAgents(
        data.map((a) => {
          // O banco usa model_provider / model_name / config JSONB
          // Mapeia para o shape que o frontend espera (provider / model / scope / etc.)
          const cfg = (a.config ?? {}) as Record<string, unknown>;
          return {
            id: a.id,
            company_id: a.company_id,
            name: a.name,
            description: a.description,
            provider: (a.model_provider ?? a.provider ?? 'openai') as AiAgent['provider'],
            model: a.model_name ?? a.model ?? 'gpt-4o-mini',
            is_active: a.is_active,
            is_published: (cfg.is_published as boolean) ?? a.is_published ?? false,
            scope: (cfg.scope as AiAgent['scope']) ?? a.scope ?? { channels: [], auto_reply: false },
            handoff_keywords: (cfg.handoff_keywords as string[]) ?? a.handoff_keywords ?? [],
            handoff_after_mins: (cfg.handoff_after_mins as number | undefined) ?? a.handoff_after_mins,
            created_at: a.created_at,
            updated_at: a.updated_at,
          } satisfies AiAgent;
        })
      );
    }
    setLoading(false);
  }, [currentCompany]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleToggle = (id: string, isActive: boolean) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_active: isActive } : a))
    );
  };

  const filtered = agents.filter((a) => {
    const matchesSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && a.is_active) ||
      (filter === 'inactive' && !a.is_active && a.is_published) ||
      (filter === 'draft' && !a.is_published);

    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.is_active).length,
    draft: agents.filter((a) => !a.is_published).length,
  };

  return (
    <div className="flex flex-col h-full bg-bg-base overflow-hidden">
      {/* Page Header */}
      <div className="shrink-0 px-8 py-6 border-b border-border bg-background">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <Bot size={18} className="text-indigo-400" />
              </div>
              <h1 className="text-xl font-bold text-primary">Agentes de IA</h1>
            </div>
            <p className="text-sm text-text-muted ml-11">
              Crie, configure e ative agentes de IA para automatizar atendimentos.
            </p>
          </div>

          <button
            onClick={() => navigate('/ai-agents/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-stone-200 transition-colors shrink-0"
          >
            <Plus size={16} />
            Novo Agente
          </button>
        </div>

        {/* KPI strip */}
        {!loading && agents.length > 0 && (
          <div className="flex items-center gap-6 mt-5 ml-11">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-primary">{stats.total}</span>
              <span className="text-xs text-stone-500">agentes</span>
            </div>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">{stats.active}</span>
              <span className="text-xs text-stone-500">ativos</span>
            </div>
            {stats.draft > 0 && (
              <>
                <div className="w-px h-5 bg-border" />
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-sm font-medium text-amber-400">{stats.draft}</span>
                  <span className="text-xs text-stone-500">rascunhos</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="shrink-0 px-8 py-4 flex items-center gap-3 border-b border-border">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none"
          />
          <input
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-primary placeholder-stone-600 outline-none focus:border-stone-500 transition-colors"
            placeholder="Buscar agentes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5">
          {(Object.keys(FILTER_LABELS) as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                filter === f
                  ? 'bg-surface text-primary border border-border shadow-sm'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin text-stone-600" />
          </div>
        ) : agents.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
              <Bot size={36} className="text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-primary mb-2">
              Nenhum agente criado ainda
            </h2>
            <p className="text-sm text-stone-500 max-w-sm mb-6 leading-relaxed">
              Crie seu primeiro agente de IA para automatizar atendimentos, qualificar leads e
              liberar sua equipe para o que importa.
            </p>
            <button
              onClick={() => navigate('/ai-agents/new')}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Zap size={16} />
              Criar Primeiro Agente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search size={24} className="text-stone-600 mb-3" />
            <p className="text-sm text-stone-500">Nenhum agente encontrado para este filtro.</p>
            <button
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
              className="text-xs text-primary hover:underline mt-2"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
