-- ============================================================
-- SECURITY FIX 03: Corrigir políticas de ai_agents e
-- ai_agent_bindings para incluir company_memberships
--
-- PROBLEMA:
--   As policies atuais verificam apenas user_companies, mas
--   usuários provisionados via create-platform-user ou
--   company_memberships não aparecem em user_companies e
--   são bloqueados.
--
-- SOLUÇÃO:
--   Usar is_company_member() se disponível, ou verificar
--   AMBAS as tabelas com OR. Também corrige ai_agent_bindings.
-- ============================================================

-- ── ai_agents ─────────────────────────────────────────────────

-- Remove a policy antiga (usa apenas user_companies)
DROP POLICY IF EXISTS "ai_agents company isolation" ON public.ai_agents;

-- Nova policy: verifica user_companies OU company_memberships
CREATE POLICY "ai_agents_company_isolation_v2"
  ON public.ai_agents
  FOR ALL
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = ai_agents.company_id
        AND uc.user_id    = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = ai_agents.company_id
        AND cm.user_id    = auth.uid()
        AND cm.status     = 'active'::membership_status_enum
    )
  );

-- ── ai_agent_bindings ─────────────────────────────────────────

DROP POLICY IF EXISTS "ai_agent_bindings company isolation" ON public.ai_agent_bindings;

CREATE POLICY "ai_agent_bindings_company_isolation_v2"
  ON public.ai_agent_bindings
  FOR ALL
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = ai_agent_bindings.company_id
        AND uc.user_id    = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = ai_agent_bindings.company_id
        AND cm.user_id    = auth.uid()
        AND cm.status     = 'active'::membership_status_enum
    )
  );

NOTIFY pgrst, 'reload schema';
