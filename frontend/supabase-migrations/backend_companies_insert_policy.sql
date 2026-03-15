-- ============================================================
-- Permitir platform_admin inserir novas empresas
-- ============================================================

CREATE POLICY "Platform admin can insert companies" ON public.companies
  FOR INSERT
  WITH CHECK (public.get_my_system_role() = 'platform_admin');
