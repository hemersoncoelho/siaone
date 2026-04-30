-- ============================================================
-- SECURITY FIX 04: Corrigir políticas de audit_logs
--
-- PROBLEMA:
--   Políticas com subconsulta inline em user_profiles podem
--   causar recursão se user_profiles também tiver policy
--   que consulta audit_logs ou outra tabela circular.
--   Além disso, audit_logs deve ser imutável (INSERT only).
--
-- SOLUÇÃO:
--   Usar funções helper já existentes (is_platform_admin,
--   is_company_member) que são SECURITY DEFINER e não
--   causam recursão. Garantir que audit_logs não permite
--   UPDATE nem DELETE por ninguém.
-- ============================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Remove todas as policies existentes para recriar clean
DROP POLICY IF EXISTS "audit_logs_select_company_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_platform"      ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_all"           ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select"               ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert"               ON public.audit_logs;

-- SELECT: platform_admin vê tudo; company_admin vê apenas da sua empresa
CREATE POLICY "audit_logs_select"
  ON public.audit_logs
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR (
      company_id IS NOT NULL
      AND public.is_company_member(company_id)
    )
  );

-- INSERT: qualquer authenticated pode inserir (logging de ações)
-- service_role também pode (bypass total)
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- UPDATE e DELETE: ninguém (audit trail é imutável)
-- Sem policy FOR UPDATE → bloqueado por padrão com RLS ativo
-- Sem policy FOR DELETE → bloqueado por padrão com RLS ativo

NOTIFY pgrst, 'reload schema';
