import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, ChevronDown, User, ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AdminTopbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
      
      {/* Left side context */}
      <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-primary leading-tight flex items-center gap-2">
                Painel Central
              </span>
              <span className="text-[10px] font-mono uppercase text-amber-500 tracking-wide">
                Nível: Plataforma Global
              </span>
            </div>
          </div>
      </div>

      {/* Right side user menu */}
      <div className="flex items-center gap-6">
        
       <button 
         onClick={() => navigate('/select-company')}
         className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-stone-400 hover:text-primary transition-all group"
         title="Voltar para visão operacional"
       >
         <ArrowLeftRight size={14} className="group-hover:-translate-x-1 transition-transform" />
         Visão Operacional
       </button>

        <div className="h-6 w-px bg-border"></div>

        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-primary leading-tight">
              {user?.full_name}
            </span>
            <span className="text-[10px] font-mono uppercase text-amber-500 tracking-wide">
              {user?.role.replace('_', ' ')}
            </span>
          </div>
          
          <div className="w-9 h-9 rounded-full bg-surface border border-border flex-center relative overflow-hidden group-hover:border-amber-500 transition-colors">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={16} className="text-text-muted group-hover:text-amber-500 transition-colors" />
            )}
          </div>
          
          <ChevronDown size={14} className="text-text-muted group-hover:text-amber-500 transition-colors" />
        </div>

        {/* Temporary explicit logout for testing */}
        <button 
          onClick={handleLogout}
          className="text-text-muted hover:text-red-400 transition-colors p-2"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};
