import React, { useEffect, useRef } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Bot, ArrowLeftRight } from 'lucide-react';
import type { Message } from '../../types';

interface TimelineProps {
  messages: Message[];
  contactName: string;
  loading: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTACT_PALETTE = [
  'bg-emerald-500/15 text-emerald-400',
  'bg-violet-500/15 text-violet-400',
  'bg-amber-500/15 text-amber-400',
  'bg-blue-500/15 text-blue-400',
  'bg-rose-500/15 text-rose-400',
  'bg-cyan-500/15 text-cyan-400',
];

function getContactColor(name: string): string {
  if (!name) return CONTACT_PALETTE[0];
  let code = 0;
  for (let i = 0; i < name.length; i++) code += name.charCodeAt(i);
  return CONTACT_PALETTE[code % CONTACT_PALETTE.length];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDateKey(iso: string): string {
  return new Date(iso).toDateString();
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'queued':
      return <Clock size={11} className="text-stone-700" />;
    case 'sent':
      return <Check size={11} className="text-stone-600" />;
    case 'delivered':
      return <CheckCheck size={11} className="text-stone-600" />;
    case 'read':
      return <CheckCheck size={11} className="text-blue-400" />;
    case 'failed':
      return <AlertCircle size={11} className="text-rose-500" />;
    default:
      return null;
  }
}

// ── Date Separator ────────────────────────────────────────────────────────────

function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 py-4 select-none">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600 px-2">
        {formatDateLabel(iso)}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export const Timeline: React.FC<TimelineProps> = ({ messages, contactName, loading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevContactName = useRef<string>('');

  useEffect(() => {
    const conversationChanged = prevContactName.current !== contactName;
    prevContactName.current = contactName;

    if (conversationChanged) {
      // Instant jump when switching conversations
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    } else {
      // Smooth scroll for new messages arriving
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, contactName]);

  if (loading) {
    return (
      <div ref={scrollRef} className="flex-1 px-6 py-4 space-y-4 overflow-y-auto no-scrollbar">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex ${i % 3 === 0 ? 'justify-end' : 'justify-start'} animate-pulse`}
          >
            <div
              className={`rounded-2xl bg-surface ${
                i % 3 === 0 ? 'w-48 h-12' : 'w-64 h-16'
              }`}
            />
          </div>
        ))}
      </div>
    );
  }

  const renderedDates = new Set<string>();
  const contactColor = getContactColor(contactName);
  const contactInitial = (contactName || '?').charAt(0).toUpperCase();

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2 no-scrollbar">
      {/* Conversation start marker */}
      <div className="flex items-center gap-3 pt-4 pb-6 select-none">
        <div className="flex-1 h-px bg-border/40" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-stone-700 px-2">
          Início da conversa
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      <div className="space-y-0.5">
        {messages.map((msg, idx) => {
          const dateKey = getDateKey(msg.created_at);
          const showDateSep = !renderedDates.has(dateKey);
          if (showDateSep) renderedDates.add(dateKey);

        // Normalise: 'user' is the DB value for agent messages
        const isAgent = msg.sender_type === 'agent' || (msg.sender_type as string) === 'user';
        const isBot = msg.sender_type === 'bot';
        const isRight = isAgent || isBot;

          // Grouping: same sender, not special message, no date break
          // Normalize 'user' → 'agent' for grouping comparison
          const normalizeSender = (t: string) => t === 'user' ? 'agent' : t;
          const prev = idx > 0 ? messages[idx - 1] : null;
          const sameAsPrev =
            prev &&
            normalizeSender(prev.sender_type) === normalizeSender(msg.sender_type) &&
            !msg.is_internal &&
            prev.sender_type !== 'system' &&
            !prev.is_internal &&
            !showDateSep;

          return (
            <React.Fragment key={msg.id}>
              {/* Date separator */}
              {showDateSep && idx > 0 && <DateSeparator iso={msg.created_at} />}

              {/* ── Internal Note ── */}
              {msg.is_internal && (
                <div className="flex justify-center py-2">
                  <div className="max-w-md w-full mx-auto bg-amber-500/6 border border-amber-500/20 text-amber-300/90 px-4 py-3 rounded-xl text-sm">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                        Nota Interna
                      </span>
                      <span className="text-[10px] opacity-40 font-mono">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-amber-200/80">{msg.body}</p>
                  </div>
                </div>
              )}

              {/* ── System Event ── */}
              {!msg.is_internal && msg.sender_type === 'system' && (
                <div className="flex justify-center py-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium border bg-indigo-500/8 border-indigo-500/15 text-indigo-400">
                    <ArrowLeftRight size={10} />
                    <span>{msg.body}</span>
                    <span className="text-[10px] opacity-50 font-mono ml-1">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Contact Message (left) ── */}
              {!msg.is_internal && msg.sender_type === 'contact' && (
                <div
                  className={`flex items-end gap-2.5 max-w-[78%] ${sameAsPrev ? 'mt-0.5' : 'mt-3'}`}
                >
                  {/* Avatar */}
                  {!sameAsPrev ? (
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${contactColor}`}
                    >
                      {contactInitial}
                    </div>
                  ) : (
                    <div className="w-7 shrink-0" />
                  )}

                  <div className="flex flex-col gap-0.5">
                    {!sameAsPrev && (
                      <span className="text-[10px] font-medium text-stone-600 ml-0.5">
                        {contactName}
                      </span>
                    )}
                    <div className="bg-surface border border-border text-stone-200 px-3.5 py-2.5 rounded-2xl rounded-tl-[6px] text-sm leading-relaxed shadow-sm">
                      {msg.body}
                    </div>
                    {!sameAsPrev && (
                      <span className="text-[10px] text-stone-700 font-mono ml-0.5">
                        {formatTime(msg.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ── Agent / Bot Message (right) ── */}
              {!msg.is_internal && isRight && (
                <div
                  className={`flex flex-col items-end max-w-[78%] ml-auto ${sameAsPrev ? 'mt-0.5' : 'mt-3'}`}
                >
                  {!sameAsPrev && (
                    <div className="flex items-center gap-2 mr-0.5 mb-1">
                      <span className="text-[10px] text-stone-700 font-mono">
                        {formatTime(msg.created_at)}
                      </span>
                      {isBot ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-400">
                          <Bot size={10} />
                          {msg.ai_agent_name ?? 'Agente IA'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500">
                          {msg.sender_name ?? 'Você'}
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    className={`px-3.5 py-2.5 rounded-2xl rounded-tr-[6px] text-sm leading-relaxed shadow-sm ${
                      isBot
                        ? 'bg-indigo-600/85 text-white border border-indigo-500/30'
                        : 'bg-white text-stone-900'
                    }`}
                  >
                    {msg.body}
                  </div>

                  {/* Status */}
                  {!isBot && !sameAsPrev && (
                    <div className="flex items-center gap-1 mt-0.5 mr-0.5">
                      <StatusIcon status={msg.status} />
                      {msg.status === 'failed' && (
                        <span className="text-[10px] text-rose-500 font-mono">falha</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div ref={bottomRef} className="h-6" />
    </div>
  );
};
