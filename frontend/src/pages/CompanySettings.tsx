import React from 'react';
import { useTenant } from '../contexts/TenantContext';
import { CompanyTeamAndUsers } from '../components/settings/CompanyTeamAndUsers';
import { Settings } from 'lucide-react';

export const CompanySettings: React.FC = () => {
  const { currentCompany, companyRole } = useTenant();

  if (!currentCompany) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-stone-500">
        Selecione uma empresa para gerenciar times e usuários.
      </div>
    );
  }

  if (companyRole !== 'company_admin') {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <div className="glass-panel p-8 rounded-xl border border-amber-500/20 text-center">
          <p className="text-amber-500 font-medium mb-2">Acesso restrito</p>
          <p className="text-stone-500 text-sm">
            Apenas administradores da empresa podem gerenciar times e usuários.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center">
            <Settings size={20} className="text-amber-500" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600 block">
              Configurações
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-primary">
              Times e Usuários
            </h1>
          </div>
        </div>
        <p className="text-sm text-stone-500 mt-1">
          Gerencie os times da sua empresa e atribua roles e times aos usuários.
        </p>
      </div>

      <CompanyTeamAndUsers companyId={currentCompany.id} />
    </div>
  );
};
