import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  ChevronRight,
  Zap,
  ZapOff,
  Globe,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AiAgent } from '../../types';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  custom: 'Personalizado',
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  sms: 'SMS',
  webchat: 'Webchat',
  instagram: 'Instagram',
  telegram: 'Telegram',
};

interface AgentCardProps {
  agent: AiAgent;
  onToggle: (id: string, isActive: boolean) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onToggle }) => {
  const navigate = useNavigate();
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);

    const { data } = await supabase.rpc('rpc_toggle_ai_agent', {
      p_agent_id: agent.id,
      p_is_active: !agent.is_active,
    });

    if (data?.success) {
      onToggle(agent.id, !agent.is_active);
    }
    setToggling(false);
  };

  const channels = agent.scope?.channels ?? [];

  return (
    <div
      onClick={() => navigate(`/ai-agents/${agent.id}`)}
      className="group bg-surface border border-border rounded-xl p-5 cursor-pointer hover:border-stone-600 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              agent.is_active
                ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                : 'bg-stone-800 text-stone-500 border border-border'
            }`}
          >
            <Bot size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-primary text-sm leading-tight truncate">
              {agent.name}
            </h3>
            <p className="text-[11px] text-stone-500 font-mono mt-0.5">
              {PROVIDER_LABELS[agent.provider] ?? agent.provider} · {agent.model}
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 shrink-0">
          {!agent.is_published && (
            <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
              Rascunho
            </span>
          )}
          <span
            className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border flex items-center gap-1 ${
              agent.is_active
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-stone-800 text-stone-500 border-border'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                agent.is_active ? 'bg-emerald-400' : 'bg-stone-600'
              }`}
            />
            {agent.is_active ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-xs text-stone-400 leading-relaxed line-clamp-2">
          {agent.description}
        </p>
      )}

      {/* Channels */}
      {channels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {channels.map((ch) => (
            <span
              key={ch}
              className="inline-flex items-center gap-1 text-[10px] font-medium bg-background border border-border text-stone-400 px-2 py-0.5 rounded-full"
            >
              <MessageSquare size={10} />
              {CHANNEL_LABELS[ch] ?? ch}
            </span>
          ))}
          {channels.length === 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-stone-500">
              <Globe size={10} /> Todos os canais
            </span>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1 border-t border-border/60 mt-auto">
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={agent.is_active ? 'Desativar agente' : 'Ativar agente'}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            agent.is_active
              ? 'text-stone-400 hover:text-red-400 hover:bg-red-500/10'
              : 'text-stone-400 hover:text-emerald-400 hover:bg-emerald-500/10'
          } ${toggling ? 'opacity-50 cursor-wait' : ''}`}
        >
          {agent.is_active ? <ZapOff size={13} /> : <Zap size={13} />}
          {toggling ? 'Aguarde...' : agent.is_active ? 'Desativar' : 'Ativar'}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/ai-agents/${agent.id}`);
            }}
            className="flex items-center gap-1 text-xs text-stone-500 hover:text-primary transition-colors px-2 py-1.5 rounded hover:bg-background"
          >
            <Pencil size={12} /> Editar
          </button>
          <ChevronRight
            size={16}
            className="text-stone-600 group-hover:text-stone-400 transition-colors"
          />
        </div>
      </div>
    </div>
  );
};
