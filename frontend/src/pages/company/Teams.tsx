import React, { useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { 
  Users, 
  LayoutDashboard, 
  Plus, 
  Search, 
  MoreVertical, 
  ChevronRight,
  Settings,
} from 'lucide-react';

interface Team {
    id: string;
    name: string;
    description: string;
    member_count: number;
    manager_name: string;
    created_at: string;
}

export const TeamsPage: React.FC = () => {
  const { currentCompany } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data for teams
  const [teams] = useState<Team[]>([
    { id: '1', name: 'Vendas BR', description: 'Equipe focada em fechamento de novos negócios no Brasil.', member_count: 8, manager_name: 'Alice Silva', created_at: '2024-01-10' },
    { id: '2', name: 'Suporte Global', description: 'Atendimento técnico multicanal 24/7.', member_count: 12, manager_name: 'Carla Souza', created_at: '2024-01-15' },
    { id: '3', name: 'Customer Success', description: 'Equipe de pós-venda e retenção.', member_count: 5, manager_name: 'Bruno Costa', created_at: '2024-02-05' },
  ]);

  if (!currentCompany) return null;

  const filteredTeams = teams.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-3">
            <LayoutDashboard size={24} className="text-stone-500" />
            Times de Operação
          </h1>
          <p className="text-text-muted mt-1">Organize seus membros em times para distribuir conversas e metas.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors">
          <Plus size={18} />
          Criar Novo Time
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="glass-panel p-2.5 rounded-xl flex items-center px-4 gap-3 flex-1 w-full sm:max-w-md">
              <Search size={16} className="text-stone-500" />
              <input 
                type="text" 
                placeholder="Buscar times..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-sm text-primary placeholder:text-stone-600 focus:outline-none w-full"
              />
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-stone-500 uppercase tracking-widest bg-white/5 px-4 py-2.5 rounded-xl border border-border">
              Total: <span className="text-primary font-bold">{teams.length}</span>
          </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
          ))}

          {/* Create Team CTA Card */}
          <button className="group border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-stone-500 hover:bg-white/[0.02] transition-all gap-4">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-stone-600 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                  <Plus size={24} />
              </div>
              <div>
                  <h3 className="text-primary font-medium">Novo Time</h3>
                  <p className="text-xs text-text-muted mt-1">Defina metas e atribua membros.</p>
              </div>
          </button>
      </div>
    </div>
  );
};

const TeamCard: React.FC<{ team: Team }> = ({ team }) => (
    <div className="glass-panel p-6 rounded-2xl hover:border-stone-700 transition-all flex flex-col gap-6 group">
        <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <Users size={24} />
            </div>
            <button className="p-1.5 hover:bg-white/5 rounded-lg text-stone-500 hover:text-primary transition-colors">
                <MoreVertical size={18} />
            </button>
        </div>

        <div>
            <h3 className="text-lg font-bold text-primary group-hover:text-white transition-colors">{team.name}</h3>
            <p className="text-sm text-text-muted mt-2 line-clamp-2 leading-relaxed">{team.description}</p>
        </div>

        <div className="pt-6 border-t border-border flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-stone-800 flex items-center justify-center text-[10px] font-bold text-stone-500">
                        {team.manager_name.charAt(0)}
                    </div>
                    <div>
                        <p className="text-[10px] font-mono uppercase text-stone-500 tracking-wider">Responsável</p>
                        <p className="text-xs font-medium text-stone-300">{team.manager_name}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-mono uppercase text-stone-500 tracking-wider">Membros</p>
                    <p className="text-xs font-medium text-stone-300">{team.member_count}</p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-stone-300 transition-colors flex items-center justify-center gap-2">
                   <Settings size={14} />
                   Configurar
                </button>
                <button className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-stone-300 transition-colors flex items-center justify-center gap-2">
                   <ChevronRight size={14} />
                   Detalhes
                </button>
            </div>
        </div>
    </div>
);
