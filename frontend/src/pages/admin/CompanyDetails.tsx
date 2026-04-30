import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { ArrowLeft, ShieldAlert, Blocks, Loader2 } from 'lucide-react';
import { CompanyTeamAndUsers, type CompanyUser } from '../../components/settings/CompanyTeamAndUsers';
import { supabase } from '../../lib/supabase';
import type { Company } from '../../types';

export const CompanyDetails: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { enableSupportMode } = useTenant();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompany = useCallback(async () => {
    if (!companyId) {
      setCompany(null);
      setError('Empresa não especificada na URL.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: qError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .maybeSingle();

    if (qError) {
      setCompany(null);
      setError(qError.message || 'Erro ao carregar empresa.');
    } else if (!data) {
      setCompany(null);
      setError('Empresa não encontrada ou sem permissão de leitura.');
    } else {
      setCompany(data as Company);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  const handleSupportMode = async () => {
    if (!company) return;
    await enableSupportMode(company.id);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 py-24 text-stone-400">
        <Loader2 className="animate-spin shrink-0" size={22} />
        <span className="text-sm font-mono">Carregando empresa…</span>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 reveal active">
        <button
          type="button"
          onClick={() => navigate('/admin/companies')}
          className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-stone-500 hover:text-amber-500 transition-colors"
        >
          <ArrowLeft size={14} /> Voltar para Tenants
        </button>
        <div className="rounded-xl border border-border bg-surface/50 p-8 text-stone-400 text-center">
          <p className="text-sm">{error ?? 'Empresa não encontrada.'}</p>
          {companyId && (
            <p className="text-xs font-mono text-stone-600 mt-2 break-all">ID: {companyId}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">

      <button
        type="button"
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
          <button
            type="button"
            className="bg-surface border border-border text-primary px-4 py-2 rounded-lg font-medium text-sm hover:border-amber-500 transition-colors"
          >
            Editar Dados
          </button>
          <button
            type="button"
            onClick={handleSupportMode}
            className="bg-amber-500/10 text-amber-500 border border-amber-500/30 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-amber-500 hover:text-background hover:border-amber-500 transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]"
          >
            <ShieldAlert size={16} /> Entrar em Modo Suporte
          </button>
        </div>
      </div>

      {companyId && (
        <CompanyTeamAndUsers
          companyId={companyId}
          showSupportActions
          onSupportAccess={async (user: CompanyUser) => {
            await enableSupportMode(companyId, {
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
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="bg-surface border border-border rounded-lg p-3 text-sm text-primary flex justify-between items-center">
              Agentes IA
              <span className="w-2 h-2 rounded-full bg-stone-600" />
            </div>
            <div className="bg-surface border border-border rounded-lg p-3 text-sm text-primary flex justify-between items-center">
              Pipeline
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>

          <button type="button" className="text-xs font-medium text-amber-500 mt-6 block">
            Gerenciar Módulos do Tenant
          </button>
        </div>
      </div>

    </div>
  );
};
