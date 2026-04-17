import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  DollarSign,
  MessageSquare,
  Calendar,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Deal, PipelineStage, DealStatus } from '../../types';

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
  phone: 'Telefone',
  chat: 'Chat',
};

const STATUS_CONFIG: Record<DealStatus, { label: string; dot: string; badge: string }> = {
  open: {
    label: 'Ativo',
    dot: 'bg-blue-500',
    badge: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  },
  won: {
    label: 'Ganho',
    dot: 'bg-emerald-500',
    badge: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  },
  lost: {
    label: 'Perdido',
    dot: 'bg-rose-500',
    badge: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  },
};

interface DealDetailPanelProps {
  deal: Deal | null;
  stages: PipelineStage[];
  canMove: boolean;
  onClose: () => void;
  onMove: (dealId: string, stageId: string) => Promise<void>;
}

export const DealDetailPanel: React.FC<DealDetailPanelProps> = ({
  deal,
  stages,
  canMove,
  onClose,
  onMove,
}) => {
  const navigate = useNavigate();
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    if (showMoveMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoveMenu]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!deal) return null;

  const currentStage = stages.find(s => s.id === deal.stage_id);
  const otherStages = stages
    .filter(s => s.id !== deal.stage_id)
    .sort((a, b) => a.position - b.position);

  const statusConfig = STATUS_CONFIG[deal.status] ?? STATUS_CONFIG.open;

  const handleMove = async (stageId: string) => {
    setMoveError(null);
    setMoving(true);
    setShowMoveMenu(false);
    try {
      await onMove(deal.id, stageId);
    } catch (err: any) {
      setMoveError(err.message || 'Erro ao mover negócio.');
    } finally {
      setMoving(false);
    }
  };

  const formattedValue = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(deal.amount || 0);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-surface border-l border-border z-50 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                'inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border rounded px-2 py-0.5',
                statusConfig.badge
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dot)} />
                {statusConfig.label}
              </span>
            </div>
            <h2 className="text-base font-semibold text-primary leading-snug line-clamp-2">
              {deal.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-main transition-colors shrink-0 mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div
          className="flex-1 overflow-y-auto divide-y divide-border"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent' }}
        >

          {/* Value */}
          <div className="p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1.5">
              Valor do Negócio
            </p>
            <div className="flex items-baseline gap-2">
              <DollarSign size={16} className="text-emerald-500 self-center" />
              <span className="text-2xl font-semibold text-primary tabular-nums">
                {formattedValue}
              </span>
            </div>
          </div>

          {/* Stage + move */}
          <div className="p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
              Estágio Atual
            </p>

            <div className="flex items-center justify-between gap-3">
              {/* Current stage pill */}
              {currentStage ? (
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: currentStage.color || '#6B7280' }}
                  />
                  <span className="text-sm font-medium text-primary">{currentStage.name}</span>
                </div>
              ) : (
                <span className="text-sm text-stone-500">—</span>
              )}

              {/* Move button */}
              {canMove && (
                <div className="relative" ref={moveMenuRef}>
                  <button
                    onClick={() => setShowMoveMenu(v => !v)}
                    disabled={moving}
                    className={cn(
                      'flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest',
                      'px-3 py-1.5 rounded-lg border border-border bg-surface-hover hover:bg-border',
                      'text-text-muted hover:text-text-main transition-all',
                      moving && 'opacity-50 pointer-events-none'
                    )}
                  >
                    {moving ? (
                      <>
                        <span className="w-3 h-3 rounded-full border-2 border-stone-500 border-t-white animate-spin" />
                        Movendo
                      </>
                    ) : (
                      <>
                        Mover
                        <ChevronDown size={12} />
                      </>
                    )}
                  </button>

                  {showMoveMenu && (
                    <div className="absolute right-0 top-9 z-50 min-w-[180px] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden">
                      <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-stone-600 border-b border-border">
                        Mover para
                      </div>
                      {otherStages.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-stone-600">
                          Nenhum outro estágio
                        </div>
                      ) : (
                        otherStages.map(stage => (
                          <button
                            key={stage.id}
                            onClick={() => handleMove(stage.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-text-main hover:bg-surface-hover transition-colors text-left"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: stage.color || '#6B7280' }}
                            />
                            {stage.name}
                            <ArrowRight size={12} className="ml-auto text-stone-600" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {moveError && (
              <p className="mt-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-3 py-2">
                {moveError}
              </p>
            )}
          </div>

          {/* Contact */}
          {deal.contact && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Contato
              </p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-surface-hover border border-border flex items-center justify-center text-xs font-semibold text-text-muted uppercase shrink-0">
                  {deal.contact.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">{deal.contact.full_name}</p>
                </div>
              </div>
            </div>
          )}

          {/* Linked conversation */}
          {deal.conversation && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Conversa Vinculada
              </p>
              <button
                onClick={() => navigate(`/inbox/${deal.conversation_id}`)}
                className="w-full flex items-center justify-between gap-3 p-3 bg-surface-hover hover:bg-border border border-border rounded-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-hover border border-border flex items-center justify-center shrink-0">
                    <MessageSquare size={14} className="text-stone-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-primary">
                      {CHANNEL_LABELS[deal.conversation.channel] || deal.conversation.channel}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">Ver no Inbox</p>
                  </div>
                </div>
                <ExternalLink
                  size={14}
                  className="text-stone-600 group-hover:text-stone-400 transition-colors shrink-0"
                />
              </button>
            </div>
          )}

          {/* Assigned user */}
          {deal.assigned_user && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Responsável
              </p>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-surface-hover border border-border flex items-center justify-center text-[10px] font-semibold text-text-muted uppercase shrink-0">
                  {deal.assigned_user.full_name.charAt(0)}
                </div>
                <span className="text-sm text-primary">{deal.assigned_user.full_name}</span>
              </div>
            </div>
          )}

          {/* Loss reason */}
          {deal.loss_reason && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Motivo da Perda
              </p>
              <p className="text-sm text-text-main leading-relaxed whitespace-pre-wrap">
                {deal.loss_reason}
              </p>
            </div>
          )}

          {/* Timeline */}
          <div className="p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-4">
              Linha do Tempo
            </p>
            <div className="relative space-y-4 pl-4">
              {/* Vertical line */}
              <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />

              <div className="relative flex items-start gap-3">
                <div className="absolute -left-[11px] w-2 h-2 rounded-full bg-border border border-border mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-text-main">Deal criado</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600">
                    <Calendar size={10} />
                    <span>{formatDate(deal.created_at)}</span>
                  </div>
                </div>
              </div>

              {deal.updated_at && deal.updated_at !== deal.created_at && (
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[11px] w-2 h-2 rounded-full bg-stone-700 border border-stone-600 mt-1 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-text-main">Última atualização</p>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600">
                      <Clock size={10} />
                      <span>{formatDate(deal.updated_at)}</span>
                    </div>
                  </div>
                </div>
              )}

              {currentStage && (
                <div className="relative flex items-start gap-3">
                  <div
                    className="absolute -left-[11px] w-2 h-2 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: currentStage.color || '#6B7280' }}
                  />
                  <div>
                    <p className="text-xs font-medium text-text-main">Estágio atual</p>
                    <p className="text-[11px] text-stone-600 mt-1">{currentStage.name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="p-4 border-t border-border shrink-0">
          <p className="text-[10px] text-stone-700 font-mono text-center">
            ID: {deal.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>
    </>
  );
};
