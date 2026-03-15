import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { ArrowLeft, ShieldAlert, Blocks } from 'lucide-react';
import { CompanyTeamAndUsers, type CompanyUser } from '../../components/settings/CompanyTeamAndUsers';

export const CompanyDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { availableCompanies, enableSupportMode } = useTenant();

  const company = availableCompanies.find(c => c.id === id);

  if (!company) {
    return <div className="text-stone-400">Company not found.</div>;
  }

  const handleSupportMode = async () => {
    await enableSupportMode(company.id);
    navigate('/');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
       
       <button 
         onClick={() => navigate('/admin/companies')}
         className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-stone-500 hover:text-amber-500 transition-colors"
       >
         <ArrowLeft size={14} /> Voltar para Tenants
       </button>

       <div className="flex justify-between items-start border-b border-border pb-6">
         <div>
           <div className="flex items-center gap-4 mb-2">
             <div className="w-12 h-12 rounded bg-surface border border-border flex-center text-xl font-bold text-stone-400">
               {company.name.substring(0, 2).toUpperCase()}
             </div>
             <div>
               <h1 className="text-4xl font-medium tracking-tight text-primary">
                 {company.name}
               </h1>
               <span className="text-xs font-mono text-stone-500 uppercase tracking-widest block mt-1">
                 ID: {company.id}
               </span>
             </div>
           </div>
         </div>
         <div className="flex gap-3">
           <button className="bg-surface border border-border text-primary px-4 py-2 rounded-lg font-medium text-sm hover:border-amber-500 transition-colors">
              Editar Dados
           </button>
           <button 
             onClick={handleSupportMode}
             className="bg-amber-500/10 text-amber-500 border border-amber-500/30 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-amber-500 hover:text-background hover:border-amber-500 transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]"
           >
              <ShieldAlert size={16} /> Entrar em Modo Suporte
           </button>
         </div>
       </div>

       {id && (
         <CompanyTeamAndUsers
           companyId={id}
           showSupportActions
           onSupportAccess={async (user: CompanyUser) => {
             await enableSupportMode(id, {
               id: user.id,
               full_name: user.full_name,
               email: user.email,
               role: user.role_in_company,
             });
             navigate('/');
           }}
         />
       )}

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel p-6 rounded-xl border border-border md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <Blocks size={20} className="text-amber-500" />
              <h2 className="text-lg font-medium text-primary">Módulos Ativos</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
               <div className="bg-surface border border-border rounded-lg p-3 text-sm text-primary flex justify-between items-center">
                 Conversas
                 <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
               </div>
               <div className="bg-surface border border-border rounded-lg p-3 text-sm text-primary flex justify-between items-center">
                 Agentes IA
                 <span className="w-2 h-2 rounded-full bg-stone-600"></span>
               </div>
               <div className="bg-surface border border-border rounded-lg p-3 text-sm text-primary flex justify-between items-center">
                 Pipeline
                 <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
               </div>
            </div>
            
            <button className="text-xs font-medium text-amber-500 mt-6 block">
              Gerenciar Módulos do Tenant
            </button>
          </div>
       </div>

    </div>
  );
};
