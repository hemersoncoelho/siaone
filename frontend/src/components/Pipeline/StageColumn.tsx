import React, { useRef, useState } from 'react';
import { DealCard } from './DealCard';
import { cn } from '../../lib/utils';
import type { Deal, PipelineStage } from '../../types';

interface StageColumnProps {
  stage: PipelineStage;
  deals: Deal[];
  stages: PipelineStage[];
  canMove: boolean;
  onSelectDeal: (deal: Deal) => void;
  onMoveDeal: (dealId: string, stageId: string) => Promise<void>;
}

export const StageColumn: React.FC<StageColumnProps> = ({
  stage,
  deals,
  stages,
  canMove,
  onSelectDeal,
  onMoveDeal,
}) => {
  const totalValue = deals.reduce((sum, d) => sum + (d.amount || 0), 0);
  const [isDragOver, setIsDragOver] = useState(false);
  // contador para ignorar eventos de enter/leave de elementos filhos
  const dragCounter = useRef(0);

  const formattedTotal = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(totalValue);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);

    const dealId = e.dataTransfer.getData('dealId');
    const fromStageId = e.dataTransfer.getData('fromStageId');

    if (dealId && fromStageId !== stage.id) {
      onMoveDeal(dealId, stage.id);
    }
  };

  return (
    <div className="flex flex-col w-72 shrink-0 select-none">
      {/* Column Header */}
      <div className="mb-3 px-0.5">
        <div
          className={cn(
            'h-[3px] rounded-full mb-3 transition-all duration-200',
            isDragOver && 'h-[4px] brightness-125'
          )}
          style={{ backgroundColor: stage.color || '#6B7280' }}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-primary">{stage.name}</h3>
            <span className="text-[11px] font-mono bg-surface-hover text-text-muted rounded-md px-1.5 py-0.5 min-w-[22px] text-center leading-5">
              {deals.length}
            </span>
          </div>
          <span className="text-[11px] text-stone-600 font-mono tabular-nums">
            {totalValue > 0 ? formattedTotal : '—'}
          </span>
        </div>
      </div>

      {/* Drop zone + cards */}
      <div
        onDragEnter={canMove ? handleDragEnter : undefined}
        onDragLeave={canMove ? handleDragLeave : undefined}
        onDragOver={canMove ? handleDragOver : undefined}
        onDrop={canMove ? handleDrop : undefined}
        className={cn(
          'flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5 rounded-lg transition-all duration-150',
          isDragOver && 'bg-surface-hover ring-1 ring-inset ring-border'
        )}
        style={{
          maxHeight: 'calc(100vh - 270px)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border-color) transparent',
        }}
      >
        {deals.length === 0 ? (
          <div
            className={cn(
              'flex items-center justify-center h-20 border border-dashed rounded-lg',
              'text-[10px] font-mono uppercase tracking-widest transition-all duration-150',
              isDragOver
                ? 'border-stone-500 text-stone-500 bg-surface-hover'
                : 'border-border text-text-muted'
            )}
          >
            {isDragOver ? 'Soltar aqui' : 'Sem negócios'}
          </div>
        ) : (
          <>
            {deals.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                stages={stages}
                canMove={canMove}
                onSelect={onSelectDeal}
                onMove={onMoveDeal}
              />
            ))}
            {/* Drop indicator at bottom when dragging over a populated column */}
            {isDragOver && (
              <div className="h-16 border-2 border-dashed border-stone-600 rounded-lg flex items-center justify-center text-[10px] font-mono uppercase tracking-widest text-stone-500 shrink-0">
                Soltar aqui
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
