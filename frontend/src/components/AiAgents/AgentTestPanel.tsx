import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, RotateCcw, Loader2, AlertCircle, User } from 'lucide-react';
import type { AgentFormData } from './AgentForm';

interface TestMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface AgentTestPanelProps {
  form: AgentFormData;
  agentName: string;
}

const INITIAL_SYSTEM: TestMessage = {
  id: 'sys-0',
  role: 'system',
  content: 'Ambiente de teste isolado — as mensagens aqui não são salvas nem enviadas ao cliente.',
  timestamp: new Date().toISOString(),
};

export const AgentTestPanel: React.FC<AgentTestPanelProps> = ({ form, agentName }) => {
  const [messages, setMessages] = useState<TestMessage[]>([INITIAL_SYSTEM]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const reset = () => {
    setMessages([INITIAL_SYSTEM]);
    setError('');
  };


  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!form.system_prompt.trim()) {
      setError('Defina um prompt de sistema antes de testar.');
      return;
    }

    setError('');
    const userMsg: TestMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      /*
       * NOTE: This calls the OpenAI-compatible endpoint directly from the browser
       * ONLY in test/sandbox mode. In production, the backend handles all LLM calls
       * so that API keys are never exposed to the client.
       *
       * For the MVP test panel we simulate a response without a real key,
       * showing a placeholder that explains the integration point.
       */
      await new Promise((res) => setTimeout(res, 900 + Math.random() * 600));

      const assistantMsg: TestMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: simulateResponse(text, form),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setError('Erro ao conectar com o modelo. Verifique a configuração.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-base">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface/40 shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-primary">
            Teste — {agentName || 'Novo Agente'}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded ml-1">
            Sandbox
          </span>
        </div>
        <button
          onClick={reset}
          title="Reiniciar conversa"
          className="p-1.5 text-stone-500 hover:text-primary hover:bg-surface rounded transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="flex items-center gap-1.5 text-[10px] text-stone-500 bg-surface border border-border px-3 py-1.5 rounded-full">
                  <AlertCircle size={10} />
                  {msg.content}
                </div>
              </div>
            );
          }

          const isBot = msg.role === 'assistant';
          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 max-w-[85%] ${isBot ? 'items-start' : 'items-end ml-auto'}`}
            >
              <div className="flex items-baseline gap-1.5">
                {isBot && <Bot size={11} className="text-indigo-400 mb-0.5" />}
                <span className="text-[10px] font-medium text-stone-500">
                  {isBot ? agentName || 'Agente' : 'Você (simulando cliente)'}
                </span>
                <span className="text-[10px] text-stone-600 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {!isBot && <User size={11} className="text-stone-500 mb-0.5" />}
              </div>
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isBot
                    ? 'bg-indigo-500/10 border border-indigo-500/20 text-primary rounded-tl-sm'
                    : 'bg-surface border border-border text-primary rounded-tr-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start gap-2 max-w-[85%]">
            <div className="bg-indigo-500/10 border border-indigo-500/20 px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex items-center gap-1.5 text-indigo-400">
                <Loader2 size={13} className="animate-spin" />
                <span className="text-xs">Processando...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {/* Composer */}
      <div className="p-4 border-t border-border bg-background shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500/30 transition-all"
            placeholder="Simule a mensagem de um cliente..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-stone-600 mt-2 text-center">
          Testes não consomem créditos reais · Integração com LLM via backend
        </p>
      </div>
    </div>
  );
};

// ── Simulation helper (MVP) ──────────────────────────────────────────────────
// In production this would call the backend which calls the real LLM with the
// system prompt. Here we generate a contextual placeholder response.
function simulateResponse(userInput: string, form: AgentFormData): string {
  const lower = userInput.toLowerCase();

  // Check handoff keywords
  const hitHandoff = form.handoff_keywords.some((kw) => lower.includes(kw));
  if (hitHandoff) {
    return '🔄 [Handoff simulado] Esta mensagem contém uma palavra-chave de transferência. Em produção, a conversa seria transferida para um agente humano agora.';
  }

  // Greeting
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hi|hello)/.test(lower)) {
    return `Olá! Eu sou ${form.name || 'o assistente de IA'}. Como posso te ajudar hoje?`;
  }

  // Simulate based on system prompt presence
  if (!form.system_prompt) {
    return '⚠️ Nenhum prompt de sistema configurado. Defina as instruções do agente para ver respostas contextuais.';
  }

  return `[Resposta simulada — ${form.provider}/${form.model}]\n\nEm produção, o agente responderia com base no seguinte contexto do prompt de sistema:\n\n"${form.system_prompt.slice(0, 120)}${form.system_prompt.length > 120 ? '...' : ''}"\n\nSua mensagem foi: "${userInput}"`;
}
