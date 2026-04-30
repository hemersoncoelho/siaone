-- ============================================================
-- SECURITY FIX 02: Reabilitar RLS em channel_events_raw
--
-- SITUAÇÃO ATUAL:
--   ALTER TABLE channel_events_raw DISABLE ROW LEVEL SECURITY;
--   → qualquer anon/authenticated pode SELECT em todos os
--     payloads brutos de webhook de TODOS os tenants.
--
-- CORREÇÃO:
--   Reabilitar RLS. O n8n usa service_role key que bypassa
--   RLS completamente no Supabase, então os INSERTs/UPDATEs
--   do n8n continuam funcionando sem nenhuma alteração.
--   Usuários autenticados normais não precisam ler esta tabela.
--   Apenas platform_admin tem acesso para diagnóstico.
-- ============================================================

ALTER TABLE public.channel_events_raw ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem
DROP POLICY IF EXISTS "channel_events_raw_insert_all"      ON public.channel_events_raw;
DROP POLICY IF EXISTS "channel_events_raw_select_admin"    ON public.channel_events_raw;
DROP POLICY IF EXISTS "channel_events_raw_update_all"      ON public.channel_events_raw;
DROP POLICY IF EXISTS "cer_select_platform_admin"          ON public.channel_events_raw;

-- Leitura: apenas platform_admin (para diagnóstico/suporte)
-- service_role (n8n) bypassa RLS → não precisa de policy
CREATE POLICY "cer_select_platform_admin"
  ON public.channel_events_raw
  FOR SELECT
  USING (public.is_platform_admin());

-- INSERT/UPDATE/DELETE: nenhuma policy explícita para authenticated
-- → bloqueados por padrão (deny by default com RLS ativo)
-- → service_role bypassa RLS e pode operar normalmente

-- ============================================================
-- VALIDAÇÃO (rodar após aplicar):
--
-- Com um JWT de usuário autenticado normal:
--   SELECT count(*) FROM channel_events_raw;
--   → deve retornar 0 linhas (policy nega)
--
-- Com service_role key (via SQL Editor ou n8n):
--   INSERT INTO channel_events_raw (...) VALUES (...);
--   → deve funcionar (service_role bypassa RLS)
--
-- Com JWT de platform_admin:
--   SELECT * FROM channel_events_raw LIMIT 5;
--   → deve retornar dados
-- ============================================================
