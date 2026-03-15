-- ============================================================
-- Times (comercial, financeiro, etc.) + Roles (Admin, Gerente, Usuário)
-- Gerente vê conversas atribuídas a ele e à sua equipe
-- ============================================================

-- ── 1. Funções auxiliares (se não existirem) ───────────────────

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT up.system_role::TEXT = 'platform_admin'
     FROM public.user_profiles up WHERE up.id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id AND uc.user_id = auth.uid()
  ) OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.has_any_company_role(p_company_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id
      AND uc.user_id = auth.uid()
      AND uc.role_in_company::TEXT = ANY(p_roles)
  ) OR public.is_platform_admin();
$$;

-- ── 2. Tabela teams ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  manager_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_teams_company ON public.teams(company_id);

-- Garante que manager_id existe (caso a tabela tenha sido criada antes)
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teams_manager ON public.teams(manager_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams FOR SELECT USING (
  public.is_company_member(company_id)
);

DROP POLICY IF EXISTS "teams_insert" ON public.teams;
CREATE POLICY "teams_insert" ON public.teams FOR INSERT WITH CHECK (
  public.has_any_company_role(company_id, ARRAY['company_admin'])
);

DROP POLICY IF EXISTS "teams_update" ON public.teams;
CREATE POLICY "teams_update" ON public.teams FOR UPDATE USING (
  public.has_any_company_role(company_id, ARRAY['company_admin', 'manager'])
);

DROP POLICY IF EXISTS "teams_delete" ON public.teams;
CREATE POLICY "teams_delete" ON public.teams FOR DELETE USING (
  public.has_any_company_role(company_id, ARRAY['company_admin'])
);

-- ── 3. team_id em user_companies ───────────────────────────────

ALTER TABLE public.user_companies
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_companies_team ON public.user_companies(team_id);

-- company_admin pode atualizar role_in_company e team_id de membros da mesma empresa
DROP POLICY IF EXISTS "company_admin_update_members" ON public.user_companies;
CREATE POLICY "company_admin_update_members" ON public.user_companies
  FOR UPDATE USING (
    public.has_any_company_role(company_id, ARRAY['company_admin'])
  );

-- ── 4. RPC: retorna conversas do inbox filtradas por role/team ──
-- Admin: todas | Gerente: suas + da equipe | Usuário: só suas

CREATE OR REPLACE FUNCTION public.rpc_get_inbox_conversations(p_company_id UUID)
RETURNS SETOF public.v_inbox_conversations
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role     TEXT;
  v_team_id  UUID;
  v_user_id  UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Platform admin vê tudo
  IF public.is_platform_admin() THEN
    RETURN QUERY
    SELECT * FROM public.v_inbox_conversations v
    WHERE v.company_id = p_company_id
    ORDER BY v.last_message_at DESC NULLS LAST;
    RETURN;
  END IF;

  -- Busca role e team do usuário na empresa
  SELECT uc.role_in_company::TEXT, uc.team_id INTO v_role, v_team_id
  FROM public.user_companies uc
  WHERE uc.company_id = p_company_id AND uc.user_id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- company_admin (Admin): vê todas
  IF v_role = 'company_admin' THEN
    RETURN QUERY
    SELECT * FROM public.v_inbox_conversations v
    WHERE v.company_id = p_company_id
    ORDER BY v.last_message_at DESC NULLS LAST;
    RETURN;
  END IF;

  -- manager (Gerente): vê suas + da equipe (times que ele gerencia)
  IF v_role = 'manager' THEN
    RETURN QUERY
    SELECT * FROM public.v_inbox_conversations v
    WHERE v.company_id = p_company_id
      AND (
        v.assigned_to_id = v_user_id
        OR v.assigned_to_id IN (
          SELECT uc2.user_id FROM public.user_companies uc2
          JOIN public.teams t ON t.id = uc2.team_id AND t.manager_id = v_user_id
          WHERE uc2.company_id = p_company_id
        )
        OR v.assigned_to_id IS NULL
      )
    ORDER BY v.last_message_at DESC NULLS LAST;
    RETURN;
  END IF;

  -- agent / viewer (Usuário): só as atribuídas a ele
  RETURN QUERY
  SELECT * FROM public.v_inbox_conversations v
  WHERE v.company_id = p_company_id
    AND v.assigned_to_id = v_user_id
  ORDER BY v.last_message_at DESC NULLS LAST;
END;
$$;

-- ── 5. Seed: times padrão por empresa (opcional) ────────────────
-- Cria times "Comercial" e "Financeiro" para empresas existentes

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.companies WHERE is_active = true
  LOOP
    INSERT INTO public.teams (company_id, name, slug)
    VALUES (r.id, 'Comercial', 'comercial')
    ON CONFLICT (company_id, slug) DO NOTHING;

    INSERT INTO public.teams (company_id, name, slug)
    VALUES (r.id, 'Financeiro', 'financeiro')
    ON CONFLICT (company_id, slug) DO NOTHING;

    INSERT INTO public.teams (company_id, name, slug)
    VALUES (r.id, 'Suporte', 'suporte')
    ON CONFLICT (company_id, slug) DO NOTHING;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
