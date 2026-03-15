-- ============================================================
-- RLS FIX: Eliminar recursão infinita nas políticas
-- ============================================================
-- Problema: policies que consultam a própria tabela ou consultam
-- user_companies de dentro de policies de user_companies causam loop.
-- Solução: funções SECURITY DEFINER que bypassam RLS.
-- ============================================================

-- Função 1: retorna o system_role do usuário logado (bypassa RLS)
CREATE OR REPLACE FUNCTION public.get_my_system_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT system_role::TEXT FROM public.user_profiles WHERE id = auth.uid();
$$;

-- Função 2: verifica se o usuário logado é company_admin de uma empresa (bypassa RLS)
CREATE OR REPLACE FUNCTION public.is_company_admin_for(check_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE user_id = auth.uid()
      AND company_id = check_company_id
      AND role_in_company = 'company_admin'
  );
$$;

-- Função 3: verifica se o usuário logado compartilha empresa com outro usuário (bypassa RLS)
CREATE OR REPLACE FUNCTION public.shares_company_with(other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies my_uc
    JOIN public.user_companies their_uc ON my_uc.company_id = their_uc.company_id
    WHERE my_uc.user_id = auth.uid() AND their_uc.user_id = other_user_id
  );
$$;

-- ============================================================
-- Recriar policies sem recursão
-- ============================================================

-- companies
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
CREATE POLICY "Users can view their own companies" ON public.companies
    FOR SELECT USING (
        public.get_my_system_role() = 'platform_admin'
        OR
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            WHERE uc.company_id = companies.id
              AND uc.user_id = auth.uid()
        )
    );

-- user_profiles
DROP POLICY IF EXISTS "Users can view profiles in their companies" ON public.user_profiles;
CREATE POLICY "Users can view profiles in their companies" ON public.user_profiles
    FOR SELECT USING (
        id = auth.uid()
        OR public.get_my_system_role() = 'platform_admin'
        OR public.shares_company_with(user_profiles.id)
    );

-- user_companies
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_companies;
CREATE POLICY "Users can view their own memberships" ON public.user_companies
    FOR SELECT USING (
        user_id = auth.uid()
        OR public.get_my_system_role() = 'platform_admin'
        OR public.is_company_admin_for(user_companies.company_id)
    );
