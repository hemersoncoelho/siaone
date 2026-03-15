-- ============================================================
-- SEED: 3 Empresas com 2 Usuários, 5 Conversas e 5 Tasks cada
-- ============================================================
--
-- Estado do banco ANTES deste seed:
--   • 1 empresa: Empresa Demo (e1a6a5ac-e263-4d8f-8868-0aa974d2d160)
--   • 2 user_profiles sem vínculo: Hemerson Coelho, Novo Usuário
--   • profiles: apenas Hemerson Coelho
--   • company_memberships: vazio
--   • 16 contatos, 14 conversas, 12 tasks (todos Empresa Demo)
--
-- O que este seed cria / corrige:
--   1. Usuário mock "Ana Ferreira" em auth.users + profiles
--   2. Corrige nome de Hemerson Coelho em profiles
--   3. 2 novas empresas: Acme Corp + TechSolutions BR
--   4. Vincula ambos os usuários às 3 empresas (company_memberships)
--   5. 5 contatos por empresa nova (Acme Corp e TechSolutions BR)
--   6. 5 conversas com assigned_to_user_id por empresa
--   7. 5 tasks com assigned_to_user_id por empresa
--
-- Usuários resultantes:
--   • Hemerson Coelho (9ed71508-...) – company_admin nas 3 empresas
--   • Ana Ferreira    (a0000001-...) – agent nas 3 empresas
--
-- ============================================================

-- ── ETAPA 1: Criar usuário mock Ana Ferreira ─────────────────

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) VALUES (
  'a0000001-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'ana.ferreira@salesia-demo.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  now(),
  '{"full_name": "Ana Ferreira"}'::jsonb,
  now(), now(), false, false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, email, platform_role, is_active)
VALUES (
  'a0000001-0000-0000-0000-000000000002',
  'Ana Ferreira',
  'ana.ferreira@salesia-demo.com',
  'platform_support',
  true
) ON CONFLICT (user_id) DO NOTHING;

-- Corrigir nome de Hemerson em profiles (pode vir vazio do trigger)
UPDATE public.profiles
SET full_name = 'Hemerson Coelho'
WHERE user_id = '9ed71508-61cd-4645-974b-9240493e16f9'
  AND (full_name IS NULL OR full_name = '');

-- ── ETAPA 2: Criar 2 novas empresas ──────────────────────────

INSERT INTO public.companies (id, name, slug, status, is_active) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'Acme Corp',        'acme-corp',        'active', true),
  ('c2222222-2222-2222-2222-222222222222', 'TechSolutions BR', 'techsolutions-br', 'active', true)
ON CONFLICT (id) DO NOTHING;

-- ── ETAPA 3: Vincular usuários às 3 empresas ─────────────────

INSERT INTO public.company_memberships (company_id, user_id, role, status, joined_at) VALUES
  -- Empresa Demo
  ('e1a6a5ac-e263-4d8f-8868-0aa974d2d160', '9ed71508-61cd-4645-974b-9240493e16f9', 'company_admin', 'active', now()),
  ('e1a6a5ac-e263-4d8f-8868-0aa974d2d160', 'a0000001-0000-0000-0000-000000000002', 'agent',         'active', now()),
  -- Acme Corp
  ('c1111111-1111-1111-1111-111111111111', '9ed71508-61cd-4645-974b-9240493e16f9', 'company_admin', 'active', now()),
  ('c1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000002', 'agent',         'active', now()),
  -- TechSolutions BR
  ('c2222222-2222-2222-2222-222222222222', '9ed71508-61cd-4645-974b-9240493e16f9', 'company_admin', 'active', now()),
  ('c2222222-2222-2222-2222-222222222222', 'a0000001-0000-0000-0000-000000000002', 'agent',         'active', now())
ON CONFLICT DO NOTHING;

-- Compatibilidade com tabela legada user_companies (usada em views antigas)
INSERT INTO public.user_companies (user_id, company_id, role_in_company) VALUES
  ('9ed71508-61cd-4645-974b-9240493e16f9', 'e1a6a5ac-e263-4d8f-8868-0aa974d2d160', 'company_admin'),
  ('9ed71508-61cd-4645-974b-9240493e16f9', 'c1111111-1111-1111-1111-111111111111', 'company_admin'),
  ('9ed71508-61cd-4645-974b-9240493e16f9', 'c2222222-2222-2222-2222-222222222222', 'company_admin')
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ── ETAPA 4: Contatos para Acme Corp ─────────────────────────

INSERT INTO public.contacts (id, company_id, full_name, lifecycle_stage, status, owner_user_id, created_at) VALUES
  ('b1111111-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', 'Rafael Mendes',   'lead',        'active', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '30 days'),
  ('b1111111-0000-0000-0000-000000000002', 'c1111111-1111-1111-1111-111111111111', 'Ana Costa',       'qualified',   'active', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '25 days'),
  ('b1111111-0000-0000-0000-000000000003', 'c1111111-1111-1111-1111-111111111111', 'Marcos Oliveira', 'opportunity', 'active', 'a0000001-0000-0000-0000-000000000002', now() - interval '20 days'),
  ('b1111111-0000-0000-0000-000000000004', 'c1111111-1111-1111-1111-111111111111', 'Julia Santos',    'customer',    'active', 'a0000001-0000-0000-0000-000000000002', now() - interval '15 days'),
  ('b1111111-0000-0000-0000-000000000005', 'c1111111-1111-1111-1111-111111111111', 'Pedro Alves',     'lead',        'active', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '10 days')
ON CONFLICT (id) DO NOTHING;

-- ── ETAPA 5: Contatos para TechSolutions BR ──────────────────

INSERT INTO public.contacts (id, company_id, full_name, lifecycle_stage, status, owner_user_id, created_at) VALUES
  ('b2222222-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222', 'Beatriz Nunes',   'lead',        'active', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '28 days'),
  ('b2222222-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', 'Eduardo Martins', 'qualified',   'active', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '20 days'),
  ('b2222222-0000-0000-0000-000000000003', 'c2222222-2222-2222-2222-222222222222', 'Patricia Sousa',  'opportunity', 'active', 'a0000001-0000-0000-0000-000000000002', now() - interval '14 days'),
  ('b2222222-0000-0000-0000-000000000004', 'c2222222-2222-2222-2222-222222222222', 'Lucas Carvalho',  'customer',    'active', 'a0000001-0000-0000-0000-000000000002', now() - interval '7 days'),
  ('b2222222-0000-0000-0000-000000000005', 'c2222222-2222-2222-2222-222222222222', 'Isabela Gomes',   'lead',        'active', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

-- ── ETAPA 6: Conversas para Empresa Demo (5 com usuários) ────

DO $$
DECLARE
  cid_demo  UUID := 'e1a6a5ac-e263-4d8f-8868-0aa974d2d160';
  uid_admin UUID := '9ed71508-61cd-4645-974b-9240493e16f9';
  uid_agent UUID := 'a0000001-0000-0000-0000-000000000002';
  ct_demo_1 UUID; ct_demo_2 UUID; ct_demo_3 UUID; ct_demo_4 UUID; ct_demo_5 UUID;
BEGIN
  SELECT id INTO ct_demo_1 FROM public.contacts WHERE company_id = cid_demo ORDER BY created_at ASC LIMIT 1 OFFSET 0;
  SELECT id INTO ct_demo_2 FROM public.contacts WHERE company_id = cid_demo ORDER BY created_at ASC LIMIT 1 OFFSET 1;
  SELECT id INTO ct_demo_3 FROM public.contacts WHERE company_id = cid_demo ORDER BY created_at ASC LIMIT 1 OFFSET 2;
  SELECT id INTO ct_demo_4 FROM public.contacts WHERE company_id = cid_demo ORDER BY created_at ASC LIMIT 1 OFFSET 3;
  SELECT id INTO ct_demo_5 FROM public.contacts WHERE company_id = cid_demo ORDER BY created_at ASC LIMIT 1 OFFSET 4;

  INSERT INTO public.conversations (
    company_id, contact_id, assigned_to_user_id, status, priority, channel,
    last_message_preview, unread_count, created_at
  ) VALUES
    (cid_demo, ct_demo_1, uid_admin, 'open', 'urgent', 'whatsapp', 'Sistema fora do ar! Urgente!', 3, now() - interval '1 day'),
    (cid_demo, ct_demo_2, uid_admin, 'open', 'high',   'email',    'Quero saber sobre o plano Enterprise.', 1, now() - interval '2 days'),
    (cid_demo, ct_demo_3, uid_agent, 'open', 'normal', 'webchat',  'Como integrar a API com meu sistema?', 0, now() - interval '3 hours'),
    (cid_demo, ct_demo_4, uid_agent, 'open', 'normal', 'whatsapp', 'Vi o anúncio e quero mais informações.', 2, now() - interval '5 hours'),
    (cid_demo, ct_demo_5, uid_admin, 'open', 'low',    'instagram','Interesse em programa de parceiros.', 0, now() - interval '6 hours');
END $$;

-- ── ETAPA 7: Conversas para Acme Corp (5) ────────────────────

INSERT INTO public.conversations (
  company_id, contact_id, assigned_to_user_id, status, priority, channel,
  last_message_preview, unread_count, created_at
) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'b1111111-0000-0000-0000-000000000001', '9ed71508-61cd-4645-974b-9240493e16f9', 'open', 'urgent', 'whatsapp', 'Erro 500 ao tentar logar no sistema.', 3, now() - interval '1 day'),
  ('c1111111-1111-1111-1111-111111111111', 'b1111111-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', 'open', 'high',   'email',    'Solicito proposta para plano Enterprise.', 1, now() - interval '2 days'),
  ('c1111111-1111-1111-1111-111111111111', 'b1111111-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000002', 'open', 'normal', 'webchat',  'Dúvida sobre integração da API.', 0, now() - interval '4 hours'),
  ('c1111111-1111-1111-1111-111111111111', 'b1111111-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000002', 'open', 'normal', 'whatsapp', 'Qual o preço para 12 usuários?', 2, now() - interval '6 hours'),
  ('c1111111-1111-1111-1111-111111111111', 'b1111111-0000-0000-0000-000000000005', '9ed71508-61cd-4645-974b-9240493e16f9', 'open', 'low',    'instagram','Tenho interesse em revenda de SaaS.', 0, now() - interval '8 hours');

-- ── ETAPA 8: Conversas para TechSolutions BR (5) ─────────────

INSERT INTO public.conversations (
  company_id, contact_id, assigned_to_user_id, status, priority, channel,
  last_message_preview, unread_count, created_at
) VALUES
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-0000-0000-0000-000000000001', '9ed71508-61cd-4645-974b-9240493e16f9', 'open', 'urgent', 'whatsapp', 'Sistema de pagamentos parou de funcionar!', 4, now() - interval '15 minutes'),
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', 'open', 'high',   'email',    'Preciso configurar o módulo de relatórios.', 2, now() - interval '3 hours'),
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000002', 'open', 'normal', 'webchat',  'Quero fechar a proposta Pro.', 0, now() - interval '1 day'),
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000002', 'open', 'normal', 'whatsapp', 'Quero testar a plataforma antes de contratar.', 1, now() - interval '2 hours'),
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-0000-0000-0000-000000000005', '9ed71508-61cd-4645-974b-9240493e16f9', 'open', 'low',    'email',    'Boa tarde, quero renovar minha assinatura.', 0, now() - interval '8 hours');

-- ── ETAPA 9: Tasks para Empresa Demo (5) ─────────────────────

INSERT INTO public.tasks (company_id, title, assigned_to_user_id, created_by_user_id, due_at, status, priority, created_at) VALUES
  ('e1a6a5ac-e263-4d8f-8868-0aa974d2d160', 'Enviar proposta Enterprise para cliente',  '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '1 day',   'open',        'high',   now() - interval '2 days'),
  ('e1a6a5ac-e263-4d8f-8868-0aa974d2d160', 'Resolver acesso bloqueado – urgente',      '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '2 hours',  'in_progress', 'urgent', now() - interval '1 day'),
  ('e1a6a5ac-e263-4d8f-8868-0aa974d2d160', 'Ligar para lead – Programa Parceiros',     'a0000001-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '2 days',   'open',        'normal', now() - interval '6 hours'),
  ('e1a6a5ac-e263-4d8f-8868-0aa974d2d160', 'Agendar demo com novo cliente',            'a0000001-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '3 days',   'open',        'normal', now() - interval '3 hours'),
  ('e1a6a5ac-e263-4d8f-8868-0aa974d2d160', 'Follow-up integração API',                 '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '7 days',   'open',        'low',    now() - interval '1 day')
ON CONFLICT DO NOTHING;

-- ── ETAPA 10: Tasks para Acme Corp (5) ───────────────────────

INSERT INTO public.tasks (company_id, title, assigned_to_user_id, created_by_user_id, due_at, status, priority, created_at) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'Enviar proposta Enterprise – Ana Costa',    '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '2 days',  'open',        'high',   now() - interval '5 days'),
  ('c1111111-1111-1111-1111-111111111111', 'Resolver acesso bloqueado – Rafael Mendes', '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '1 day',   'in_progress', 'urgent', now() - interval '1 day'),
  ('c1111111-1111-1111-1111-111111111111', 'Ligar para Pedro Alves – Parcerias',        'a0000001-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '1 day',   'open',        'normal', now() - interval '6 hours'),
  ('c1111111-1111-1111-1111-111111111111', 'Agendar demo com Julia Santos',             'a0000001-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '2 days',  'open',        'normal', now() - interval '3 hours'),
  ('c1111111-1111-1111-1111-111111111111', 'Verificar integração API – Marcos Oliveira', '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '7 days', 'open',        'low',    now() - interval '2 days')
ON CONFLICT DO NOTHING;

-- ── ETAPA 11: Tasks para TechSolutions BR (5) ────────────────

INSERT INTO public.tasks (company_id, title, assigned_to_user_id, created_by_user_id, due_at, status, priority, created_at) VALUES
  ('c2222222-2222-2222-2222-222222222222', 'Verificar incidente pagamentos – Beatriz',     '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now(),                      'in_progress', 'urgent', now() - interval '15 minutes'),
  ('c2222222-2222-2222-2222-222222222222', 'Suporte configuração módulo – Eduardo',        '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() - interval '1 day',   'open',        'high',   now() - interval '3 days'),
  ('c2222222-2222-2222-2222-222222222222', 'Contato com Patricia Sousa – fechar proposta', 'a0000001-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '1 day',   'open',        'normal', now() - interval '2 days'),
  ('c2222222-2222-2222-2222-222222222222', 'Ativar trial – Lucas Carvalho',                'a0000001-0000-0000-0000-000000000002', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '2 hours', 'open',        'normal', now() - interval '2 hours'),
  ('c2222222-2222-2222-2222-222222222222', 'Seguimento renovação – Isabela Gomes',         '9ed71508-61cd-4645-974b-9240493e16f9', '9ed71508-61cd-4645-974b-9240493e16f9', now() + interval '3 days',  'open',        'low',    now() - interval '8 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFICAÇÃO (descomente para checar)
-- ============================================================
-- SELECT
--   c.name AS empresa,
--   (SELECT COUNT(*) FROM public.company_memberships cm WHERE cm.company_id = c.id) AS usuarios,
--   (SELECT COUNT(*) FROM public.contacts ct WHERE ct.company_id = c.id) AS contatos,
--   (SELECT COUNT(*) FROM public.conversations cv WHERE cv.company_id = c.id) AS conversas,
--   (SELECT COUNT(*) FROM public.conversations cv WHERE cv.company_id = c.id AND cv.assigned_to_user_id IS NOT NULL) AS conversas_atribuidas,
--   (SELECT COUNT(*) FROM public.tasks t WHERE t.company_id = c.id) AS tasks,
--   (SELECT COUNT(*) FROM public.tasks t WHERE t.company_id = c.id AND t.assigned_to_user_id IS NOT NULL) AS tasks_atribuidas
-- FROM public.companies c ORDER BY c.name;
