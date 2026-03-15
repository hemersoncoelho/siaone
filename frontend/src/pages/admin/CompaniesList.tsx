import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { NewCompanyModal } from '../../components/admin/NewCompanyModal';

export const CompaniesList: React.FC = () => {
  const { availableCompanies, refreshCompanies } = useTenant();
  const navigate = useNavigate();
  const [showNewModal, setShowNewModal] = useState(false);

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
       <div className="flex justify-between items-end border-b border-border pb-6">
         <div>
           <span className="text-xs font-mono uppercase text-amber-500 block mb-2 tracking-widest">
             Gestão Global
           </span>
           <h1 className="text-4xl font-medium tracking-tight text-primary">
             Tenants <span className="text-stone-500 text-2xl font-normal ml-2">({availableCompanies.length})</span>
           </h1>
         </div>
         <button
           onClick={() => setShowNewModal(true)}
           className="bg-amber-500 text-background px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-amber-400 transition-colors"
         >
            <Plus size={16} /> Nova Empresa
         </button>
       </div>

       {/* Search / Filters Placeholder */}
       <div className="flex gap-4">
          <input 
            type="text" 
            placeholder="Buscar por nome ou ID..." 
            className="w-full max-w-md bg-surface border border-border rounded-lg px-4 py-2 text-sm text-primary placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
       </div>

       {/* Data Table Placeholder */}
       <div className="glass-panel rounded-xl overflow-hidden border border-border">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-6 py-4 text-xs font-mono uppercase text-text-muted tracking-wide font-medium">ID da Empresa</th>
                <th className="px-6 py-4 text-xs font-mono uppercase text-text-muted tracking-wide font-medium">Nome</th>
                <th className="px-6 py-4 text-xs font-mono uppercase text-text-muted tracking-wide font-medium">Status</th>
                <th className="px-6 py-4 text-xs font-mono uppercase text-text-muted tracking-wide font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {availableCompanies.map((company) => (
                <tr key={company.id} className="border-b border-border/50 hover:bg-surface/30 transition-colors group">
                  <td className="px-6 py-4 text-sm font-mono text-stone-400">{company.id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-primary">
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded bg-stone-800 flex-center text-[10px] uppercase font-bold text-stone-400">
                           {company.name.substring(0, 2)}
                         </div>
                         {company.name}
                      </div>
                  </td>
                  <td className="px-6 py-4">
                     <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                       Ativo
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                     <button 
                       onClick={() => navigate(`/admin/companies/${company.id}`)}
                       className="text-xs font-medium text-amber-500 hover:text-amber-400 border border-amber-500/30 hover:border-amber-400 px-3 py-1.5 rounded transition-all"
                     >
                       Gerenciar
                     </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
       </div>

       {showNewModal && (
         <NewCompanyModal
           isOpen={showNewModal}
           onClose={() => setShowNewModal(false)}
           onSuccess={refreshCompanies}
         />
       )}
    </div>
  );
};
