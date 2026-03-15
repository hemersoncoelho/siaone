import React, { useState, useRef, useEffect } from 'react';
import { DollarSign, User, Calendar, MoreVertical, MessageSquare, GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Deal, PipelineStage } from '../../types';

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
  phone: 'Telefone',
  chat: 'Chat',
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: 'text-emerald-400 bg-emerald-400/10',
  email: 'text-blue-400 bg-blue-400/10',
  instagram: 'text-pink-400 bg-pink-400/10',
  phone: 'text-amber-400 bg-amber-400/10',
  chat: 'text-violet-400 bg-violet-400/10',
};

interface DealCardProps {
  deal: Deal;
  stages: PipelineStage[];
  canMove: boolean;
  onSelect: (deal: Deal) => void;
  onMove: (dealId: string, stageId: string) => Promise<void>;
}

export const DealCard: React.FC<DealCardProps> = ({
  deal,
  stages,
  canMove,
  onSelect,
  onMove,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const otherStages = stages
    .filter(s => s.id !== deal.stage_id)
    .sort((a, b) => a.position - b.position);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleMove = async (stageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setMoving(true);
    try {
      await onMove(deal.id, stageId);
    } finally {
      setMoving(false);
    }
  };

  const formattedValue = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(deal.amount || 0);

  const channel = deal.conversation?.channel;
  const channelColor = channel ? (CHANNEL_COLORS[channel] || 'text-stone-400 bg-stone-400/10') : null;

  return (
    <div
      draggable={canMove}
      onDragStart={e => {
        e.dataTransfer.setData('dealId', deal.id);
        e.dataTransfer.setData('fromStageId', deal.stage_id);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      className={cn(
        'group glass-panel rounded-lg p-3.5 transition-all duration-200',
        'hover:border-stone-500 hover:bg-[#1A1A1B]',
        canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        moving && 'opacity-40 pointer-events-none scale-95',
        isDragging && 'opacity-30 scale-[0.97] border-stone-600'
      )}
      onClick={() => !isDragging && onSelect(deal)}
    >
      {/* Title + move menu */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          {canMove && (
            <GripVertical
              size={14}
              className="text-stone-700 group-hover:text-stone-500 transition-colors mt-0.5 shrink-0"
            />
          )}
          <p className="text-sm font-medium text-primary leading-snug min-w-0">
            {deal.title}
          </p>
        </div>

        {canMove && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              className={cn(
                'p-1 rounded hover:bg-white/10 transition-all text-stone-500 hover:text-stone-300',
                'opacity-0 group-hover:opacity-100'
              )}
              title="Mover deal"
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-7 z-50 min-w-[170px] bg-[#1C1C1E] border border-[#3A3A3C] rounded-lg shadow-2xl overflow-hidden">
                <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-stone-600 border-b border-[#3A3A3C]">
                  Mover para
                </div>
                {otherStages.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-stone-600">Nenhum estágio disponível</div>
                ) : (
                  otherStages.map(stage => (
                    <button
                      key={stage.id}
                      onClick={e => handleMove(stage.id, e)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-stone-300 hover:bg-white/5 hover:text-white transition-colors text-left"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color || '#6B7280' }}
                      />
                      {stage.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex items-center gap-1.5 mb-3">
        <DollarSign size={12} className="text-emerald-500 shrink-0" />
        <span className="text-sm font-semibold text-emerald-400">{formattedValue}</span>
      </div>

      {/* Tags: contact + channel */}
      <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
        {deal.contact && (
          <div className="flex items-center gap-1 text-[11px] text-stone-500">
            <User size={10} className="shrink-0" />
            <span className="truncate max-w-[110px]">{deal.contact.full_name}</span>
          </div>
        )}
        {channel && channelColor && (
          <span className={cn('flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded', channelColor)}>
            <MessageSquare size={9} />
            {CHANNEL_LABELS[channel] || channel}
          </span>
        )}
      </div>

      {/* Footer: date + assigned */}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/5">
        <div className="flex items-center gap-1 text-[10px] text-stone-600">
          <Calendar size={9} />
          <span>
            {new Date(deal.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
        </div>

        {deal.assigned_user && (
          <div
            className="w-5 h-5 rounded-full bg-stone-700 flex items-center justify-center text-[9px] font-semibold text-stone-300 uppercase"
            title={deal.assigned_user.full_name}
          >
            {deal.assigned_user.full_name.charAt(0)}
          </div>
        )}
      </div>
    </div>
  );
};
