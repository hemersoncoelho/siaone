import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';

export const SelectCompany: React.FC = () => {
  const { user } = useAuth();
  const { availableCompanies, setCompany } = useTenant();
  const navigate = useNavigate();

  // If we only have 1 company and not platform admin, auto-select it and redirect safely
  React.useEffect(() => {
    if (availableCompanies.length === 1 && user?.role !== 'platform_admin') {
      setCompany(availableCompanies[0].id);
      navigate('/', { replace: true });
    }
  }, [availableCompanies, user]);

  const handleSelect = (companyId: string) => {
    setCompany(companyId);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col p-6 selection:bg-stone-700 selection:text-white">
      
      {/* Top Navbar Simple */}
      <div className="flex justify-between items-center mb-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-surface text-primary flex-center font-bold text-lg border border-border">
            S
          </div>
          <span className="font-bold tracking-tight text-primary">SalesIA</span>
        </div>

        <div className="text-right">
           <span className="text-sm font-medium text-primary block">{user?.full_name}</span>
           <span className="text-[10px] font-mono uppercase text-text-muted tracking-wide">{user?.role.replace('_', ' ')}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full reveal active">
         
         <div className="mb-10 text-center">
            <h1 className="text-4xl font-medium tracking-tight text-primary mb-3">Selecione o Contexto</h1>
            <p className="text-text-muted text-sm max-w-md mx-auto">
              Escolha a empresa para acessar a visão operacional. 
              {user?.role === 'platform_admin' && (
                <span className="block mt-2 text-amber-500 font-mono text-[10px] uppercase">
                  (Modo de Suporte: Todas as empresas disponíveis)
                </span>
              )}
            </p>
         </div>

         <div className="grid grid-cols-1 gap-4">
            {availableCompanies.map((company) => (
               <button
                 key={company.id}
                 onClick={() => handleSelect(company.id)}
                 className="glass-panel p-6 rounded-xl flex items-center justify-between group hover:border-stone-600 transition-all text-left"
               >
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-surface border border-border flex-center group-hover:bg-primary group-hover:text-background transition-colors">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-medium text-primary">{company.name}</h3>
                      <span className="text-xs font-mono text-text-muted uppercase tracking-wider">{company.id}</span>
                    </div>
                 </div>

                 <div className="w-10 h-10 rounded-full border border-border flex-center text-text-muted group-hover:bg-primary group-hover:text-background group-hover:border-primary transition-all">
                    <ArrowRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
                 </div>
               </button>
            ))}
         </div>

      </div>
    </div>
  );
};
