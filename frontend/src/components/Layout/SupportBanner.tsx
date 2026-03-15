import React from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { LogOut, ShieldAlert } from 'lucide-react';

/**
 * Indicador de modo suporte — integrado ao rodapé da sidebar.
 * Não usa position:fixed para não cobrir a logo.
 */
export const SupportBanner: React.FC = () => {
  const { isSupportMode, currentCompany, impersonatedUser, disableSupportMode } = useTenant();

  if (!isSupportMode || !currentCompany) return null;

  return (
    <div className="mx-3 mb-3 rounded-lg border border-amber-800/30 bg-amber-950/40 overflow-hidden">
      {/* Linha decorativa topo */}
      <div className="h-[2px] w-full bg-gradient-to-r from-amber-600/60 via-amber-400/40 to-transparent" />

      <div className="px-3 py-2.5 flex flex-col gap-2">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2">
          <ShieldAlert size={11} className="text-amber-400/70 shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/70">
            Modo Suporte
          </span>
        </div>

        {/* Empresa */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-amber-300/90 truncate">
            {currentCompany.name}
          </span>
          {impersonatedUser && (
            <span className="text-[10px] text-amber-400/50 truncate">
              como {impersonatedUser.full_name}
            </span>
          )}
        </div>

        {/* Botão sair */}
        <button
          onClick={disableSupportMode}
          className="w-full flex items-center justify-center gap-1.5 mt-0.5 py-1.5 rounded border border-amber-700/30 text-[10px] font-mono uppercase tracking-widest text-amber-400/60 hover:text-amber-300 hover:border-amber-600/50 hover:bg-amber-900/30 transition-all duration-200"
        >
          <LogOut size={10} />
          Encerrar sessão
        </button>
      </div>
    </div>
  );
};
