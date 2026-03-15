import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Users, Building2, ShieldCheck, UserCog } from 'lucide-react';

interface PlatformUser {
  id: string;
  full_name: string;
  email: string;
  system_role: string;
  created_at: string;
  company_count: number;
}

const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Admin Plataforma',
  company_admin: 'Admin Empresa',
  manager: 'Gerente',
  agent: 'Agente',
};

const ROLE_COLORS: Record<string, string> = {
  platform_admin: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  company_admin: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  manager: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  agent: 'text-stone-400 bg-stone-500/10 border-stone-500/30',
};

export const UsersList: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('get_platform_users');
      if (error) {
        setError(error.message);
      } else {
        setUsers(data as PlatformUser[]);
      }
      setLoading(false);
    };
    fetchUsers();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
      <div className="flex justify-between items-end border-b border-border pb-6">
        <div>
          <span className="text-xs font-mono uppercase text-amber-500 block mb-2 tracking-widest">
            Gestão Global
          </span>
          <h1 className="text-4xl font-medium tracking-tight text-primary">
            Controle de Usuários
          </h1>
        </div>
        <div className="flex items-center gap-2 text-stone-500 text-sm font-mono">
          <Users size={14} />
          {!loading && <span>{users.length} usuário{users.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-stone-500 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm font-mono">Carregando usuários...</span>
        </div>
      ) : error ? (
        <div className="glass-panel p-8 rounded-xl border border-red-500/20 text-center">
          <p className="text-red-400 text-sm font-mono">{error}</p>
        </div>
      ) : users.length === 0 ? (
        <div className="glass-panel p-12 rounded-xl border border-border text-center text-stone-500 border-dashed">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <div className="glass-panel rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Usuário</th>
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Role</th>
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Empresas</th>
                <th className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest text-stone-500">Desde</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr
                  key={user.id}
                  className={`border-b border-border/50 last:border-0 hover:bg-surface/50 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-stone-400 font-semibold text-sm shrink-0">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-primary">{user.full_name}</p>
                        <p className="text-xs text-stone-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${ROLE_COLORS[user.system_role] ?? ROLE_COLORS.agent}`}>
                      {user.system_role === 'platform_admin' ? <ShieldCheck size={11} /> : <UserCog size={11} />}
                      {ROLE_LABELS[user.system_role] ?? user.system_role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-stone-400">
                      <Building2 size={13} />
                      {user.company_count}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-stone-500">
                      {new Date(user.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-xs text-stone-500 hover:text-amber-400 transition-colors font-mono">
                      Gerenciar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const ModulesList: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
       <div className="flex justify-between items-end border-b border-border pb-6">
         <div>
           <span className="text-xs font-mono uppercase text-amber-500 block mb-2 tracking-widest">
             Configuração da Plataforma
           </span>
           <h1 className="text-4xl font-medium tracking-tight text-primary">
             Catálogo de Módulos
           </h1>
         </div>
       </div>
       <div className="glass-panel p-12 rounded-xl border border-border text-center text-stone-500 border-dashed">
         Gestão de Módulos Globais e Permissões (Planejado)
       </div>
    </div>
  );
};

export const SupportPanel: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
       <div className="flex justify-between items-end border-b border-border pb-6">
         <div>
           <span className="text-xs font-mono uppercase text-amber-500 block mb-2 tracking-widest">
             Operações
           </span>
           <h1 className="text-4xl font-medium tracking-tight text-primary">
             Central de Suporte Operacional
           </h1>
         </div>
       </div>
       <div className="glass-panel p-12 rounded-xl border border-border text-center text-stone-500 border-dashed">
         Visão Global de Tickets e Acessos de Suporte Rápidos (Planejado)
       </div>
    </div>
  );
};
