import React, { useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { 
  Users, 
  UserPlus, 
  Search, 
  MoreVertical, 
  Mail, 
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface Member {
    id: string;
    full_name: string;
    email: string;
    role: string;
    status: 'active' | 'pending' | 'inactive';
    joined_at: string;
    teams: string[];
}

export const MembersPage: React.FC = () => {
  const { currentCompany } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data for members
  const [members] = useState<Member[]>([
    { id: '1', full_name: 'Alice Silva', email: 'alice@empresa.com', role: 'company_admin', status: 'active', joined_at: '2024-01-15', teams: ['Vendas BR', 'Suporte'] },
    { id: '2', full_name: 'Bruno Costa', email: 'bruno@empresa.com', role: 'agent', status: 'active', joined_at: '2024-02-01', teams: ['Vendas BR'] },
    { id: '3', full_name: 'Carla Souza', email: 'carla@empresa.com', role: 'manager', status: 'active', joined_at: '2024-01-20', teams: ['Suporte Global'] },
    { id: '4', full_name: 'Daniel Lima', email: 'daniel@empresa.com', role: 'agent', status: 'pending', joined_at: '2024-03-10', teams: [] },
  ]);

  if (!currentCompany) return null;

  const filteredMembers = members.filter(m => 
    m.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 reveal active">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-3">
            <Users size={24} className="text-stone-500" />
            Membros da Equipe
          </h1>
          <p className="text-text-muted mt-1">Gerencie quem tem acesso à {currentCompany.name} e suas permissões.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors">
          <UserPlus size={18} />
          Convidar Membro
        </button>
      </div>

      {/* Stats & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Total de Membros" value={members.length.toString()} />
          <StatCard label="Ativos" value={members.filter(m => m.status === 'active').length.toString()} />
          <StatCard label="Pendentes" value={members.filter(m => m.status === 'pending').length.toString()} />
          <div className="glass-panel p-2 rounded-xl flex items-center px-4 gap-3">
              <Search size={16} className="text-stone-500" />
              <input 
                type="text" 
                placeholder="Buscar membros..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-sm text-primary placeholder:text-stone-600 focus:outline-none w-full"
              />
          </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-border">
          <table className="w-full text-left border-collapse">
              <thead>
                  <tr className="bg-white/5 border-b border-border">
                      <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Membro</th>
                      <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Função</th>
                      <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Times</th>
                      <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Status</th>
                      <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-stone-500 text-right">Ações</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-border">
                  {filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center text-sm font-bold text-stone-500 group-hover:bg-stone-700 transition-colors">
                                      {member.full_name.charAt(0)}
                                  </div>
                                  <div>
                                      <div className="text-sm font-medium text-primary">{member.full_name}</div>
                                      <div className="text-xs text-text-muted flex items-center gap-1">
                                          <Mail size={12} />
                                          {member.email}
                                      </div>
                                  </div>
                              </div>
                          </td>
                          <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-xs font-mono">
                                  <Shield size={14} className="text-stone-500" />
                                  <span className="bg-white/5 px-2 py-1 rounded-md text-stone-300 uppercase tracking-wider">
                                      {member.role.replace('_', ' ')}
                                  </span>
                              </div>
                          </td>
                          <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                  {member.teams.length > 0 ? (
                                      member.teams.map(t => (
                                          <span key={t} className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                                              {t}
                                          </span>
                                      ))
                                  ) : (
                                      <span className="text-[10px] text-stone-600 italic">Sem time</span>
                                  )}
                              </div>
                          </td>
                          <td className="px-6 py-4">
                              <StatusBadge status={member.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                              <button className="p-2 hover:bg-white/5 rounded-lg text-stone-500 hover:text-primary transition-colors">
                                  <MoreVertical size={18} />
                              </button>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
          {filteredMembers.length === 0 && (
              <div className="p-12 text-center text-stone-500 italic text-sm">
                  Nenhum membro encontrado para "{searchTerm}".
              </div>
          )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="glass-panel p-4 rounded-xl">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">{label}</div>
        <div className="text-2xl font-bold text-primary">{value}</div>
    </div>
);

const StatusBadge: React.FC<{ status: Member['status'] }> = ({ status }) => {
    switch (status) {
        case 'active':
            return (
                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 w-fit">
                    <CheckCircle2 size={12} />
                    Ativo
                </div>
            );
        case 'pending':
            return (
                <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-mono uppercase tracking-wider bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 w-fit">
                    <Clock size={12} />
                    Pendente
                </div>
            );
        case 'inactive':
            return (
                <div className="flex items-center gap-1.5 text-stone-500 text-[10px] font-mono uppercase tracking-wider bg-white/5 px-2 py-1 rounded border border-white/10 w-fit">
                    <XCircle size={12} />
                    Inativo
                </div>
            );
    }
};
