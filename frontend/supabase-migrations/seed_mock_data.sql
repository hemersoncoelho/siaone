-- ============================================================
-- SEED: Dados Fictícios para Teste das Views
-- ============================================================
-- Views cobertas:
--   • v_inbox_conversations  (inbox com IA, agente, última msg, deals)
--   • v_company_kpis         (total contatos, leads, conversas, receita, tarefas)
--
-- Empresas já existentes (criadas em supabase_schema.sql):
--   Acme Corp  → c1111111-1111-1111-1111-111111111111
--   Globex Inc → c2222222-2222-2222-2222-222222222222
--   Initech    → c3333333-3333-3333-3333-333333333333
--
-- IMPORTANTE: Execute após todas as migrations.
-- ============================================================

-- ── Pré-requisito: garantir coluna due_at na tabela tasks ───
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'due_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'due_at'
  ) THEN
    ALTER TABLE public.tasks RENAME COLUMN due_date TO due_at;
    RAISE NOTICE 'Renomeado tasks.due_date → tasks.due_at';
  END IF;
END $$;

-- ── Bloco principal de seed ──────────────────────────────────
DO $$
DECLARE
  -- ── IDs fixos de Contatos ─────────────────────────────────
  -- Acme Corp
  c_acme_rafael   UUID := 'aa000001-0000-0000-0000-000000000001';
  c_acme_ana      UUID := 'aa000001-0000-0000-0000-000000000002';
  c_acme_marcos   UUID := 'aa000001-0000-0000-0000-000000000003';
  c_acme_julia    UUID := 'aa000001-0000-0000-0000-000000000004';
  c_acme_pedro    UUID := 'aa000001-0000-0000-0000-000000000005';
  c_acme_leticia  UUID := 'aa000001-0000-0000-0000-000000000006';
  c_acme_carla    UUID := 'aa000001-0000-0000-0000-000000000007';
  c_acme_thiago   UUID := 'aa000001-0000-0000-0000-000000000008';
  -- Globex Inc
  c_glbx_fernanda UUID := 'bb000002-0000-0000-0000-000000000001';
  c_glbx_rodrigo  UUID := 'bb000002-0000-0000-0000-000000000002';
  c_glbx_beatriz  UUID := 'bb000002-0000-0000-0000-000000000003';
  c_glbx_eduardo  UUID := 'bb000002-0000-0000-0000-000000000004';
  c_glbx_patricia UUID := 'bb000002-0000-0000-0000-000000000005';
  -- Initech
  c_init_lucas    UUID := 'cc000003-0000-0000-0000-000000000001';
  c_init_isabela  UUID := 'cc000003-0000-0000-0000-000000000002';
  c_init_gabriel  UUID := 'cc000003-0000-0000-0000-000000000003';

  -- ── IDs fixos de AI Agents ────────────────────────────────
  ag_acme_suporte UUID := 'dd000001-0000-0000-0000-000000000001';
  ag_acme_vendas  UUID := 'dd000001-0000-0000-0000-000000000002';
  ag_glbx_atend   UUID := 'dd000002-0000-0000-0000-000000000001';

  -- ── IDs fixos de Conversas ────────────────────────────────
  -- Acme
  conv_acme_1 UUID := 'ee000001-0000-0000-0000-000000000001';
  conv_acme_2 UUID := 'ee000001-0000-0000-0000-000000000002';
  conv_acme_3 UUID := 'ee000001-0000-0000-0000-000000000003';
  conv_acme_4 UUID := 'ee000001-0000-0000-0000-000000000004';
  conv_acme_5 UUID := 'ee000001-0000-0000-0000-000000000005';
  conv_acme_6 UUID := 'ee000001-0000-0000-0000-000000000006';
  conv_acme_7 UUID := 'ee000001-0000-0000-0000-000000000007';
  -- Globex
  conv_glbx_1 UUID := 'ee000002-0000-0000-0000-000000000001';
  conv_glbx_2 UUID := 'ee000002-0000-0000-0000-000000000002';
  conv_glbx_3 UUID := 'ee000002-0000-0000-0000-000000000003';
  conv_glbx_4 UUID := 'ee000002-0000-0000-0000-000000000004';
  -- Initech
  conv_init_1 UUID := 'ee000003-0000-0000-0000-000000000001';
  conv_init_2 UUID := 'ee000003-0000-0000-0000-000000000002';

  -- ── Usuário atribuído (primeiro membro de cada empresa) ───
  agent_acme UUID;
  agent_glbx UUID;
  agent_init UUID;

BEGIN
  -- Resolve agentes humanos existentes (pode ser NULL se não houver membros)
  SELECT uc.user_id INTO agent_acme
    FROM public.user_companies uc
    WHERE uc.company_id = 'c1111111-1111-1111-1111-111111111111'
    LIMIT 1;

  SELECT uc.user_id INTO agent_glbx
    FROM public.user_companies uc
    WHERE uc.company_id = 'c2222222-2222-2222-2222-222222222222'
    LIMIT 1;

  SELECT uc.user_id INTO agent_init
    FROM public.user_companies uc
    WHERE uc.company_id = 'c3333333-3333-3333-3333-333333333333'
    LIMIT 1;

  -- ════════════════════════════════════════════════════════
  -- 1. CONTATOS
  -- ════════════════════════════════════════════════════════

  -- Acme Corp
  INSERT INTO public.contacts (id, company_id, full_name, status, created_at) VALUES
    (c_acme_rafael,  'c1111111-1111-1111-1111-111111111111', 'Rafael Mendes',    'lead',     now() - interval '30 days'),
    (c_acme_ana,     'c1111111-1111-1111-1111-111111111111', 'Ana Costa',        'lead',     now() - interval '25 days'),
    (c_acme_marcos,  'c1111111-1111-1111-1111-111111111111', 'Marcos Oliveira',  'active',   now() - interval '20 days'),
    (c_acme_julia,   'c1111111-1111-1111-1111-111111111111', 'Julia Santos',     'active',   now() - interval '15 days'),
    (c_acme_pedro,   'c1111111-1111-1111-1111-111111111111', 'Pedro Alves',      'lead',     now() - interval '10 days'),
    (c_acme_leticia, 'c1111111-1111-1111-1111-111111111111', 'Letícia Ferreira', 'inactive', now() - interval '60 days'),
    (c_acme_carla,   'c1111111-1111-1111-1111-111111111111', 'Carla Rocha',      'lead',     now() - interval '5 days'),
    (c_acme_thiago,  'c1111111-1111-1111-1111-111111111111', 'Thiago Lima',      'active',   now() - interval '3 days')
  ON CONFLICT (id) DO NOTHING;

  -- Globex Inc
  INSERT INTO public.contacts (id, company_id, full_name, status, created_at) VALUES
    (c_glbx_fernanda, 'c2222222-2222-2222-2222-222222222222', 'Fernanda Vieira',  'lead',   now() - interval '40 days'),
    (c_glbx_rodrigo,  'c2222222-2222-2222-2222-222222222222', 'Rodrigo Batista',  'active', now() - interval '35 days'),
    (c_glbx_beatriz,  'c2222222-2222-2222-2222-222222222222', 'Beatriz Nunes',    'lead',   now() - interval '12 days'),
    (c_glbx_eduardo,  'c2222222-2222-2222-2222-222222222222', 'Eduardo Martins',  'active', now() - interval '8 days'),
    (c_glbx_patricia, 'c2222222-2222-2222-2222-222222222222', 'Patrícia Sousa',   'lead',   now() - interval '2 days')
  ON CONFLICT (id) DO NOTHING;

  -- Initech
  INSERT INTO public.contacts (id, company_id, full_name, status, created_at) VALUES
    (c_init_lucas,   'c3333333-3333-3333-3333-333333333333', 'Lucas Carvalho',  'lead',   now() - interval '18 days'),
    (c_init_isabela, 'c3333333-3333-3333-3333-333333333333', 'Isabela Gomes',   'active', now() - interval '9 days'),
    (c_init_gabriel, 'c3333333-3333-3333-3333-333333333333', 'Gabriel Ribeiro', 'lead',   now() - interval '4 days')
  ON CONFLICT (id) DO NOTHING;

  -- ════════════════════════════════════════════════════════
  -- 2. IDENTIDADES DE CONTATO (canal + identificador)
  -- ════════════════════════════════════════════════════════

  INSERT INTO public.contact_identities (contact_id, provider, identifier) VALUES
    (c_acme_rafael,   'whatsapp',  '+5511911110001'),
    (c_acme_ana,      'whatsapp',  '+5511911110002'),
    (c_acme_ana,      'email',     'ana.costa@empresa.com'),
    (c_acme_marcos,   'email',     'marcos.oliveira@empresa.com'),
    (c_acme_julia,    'webchat',   'julia-santos-webchat-001'),
    (c_acme_pedro,    'whatsapp',  '+5511911110005'),
    (c_acme_leticia,  'email',     'leticia.ferreira@gmail.com'),
    (c_acme_carla,    'instagram', 'carla.rocha.insta'),
    (c_acme_thiago,   'telegram',  'thiagolima_tg'),
    (c_glbx_fernanda, 'whatsapp',  '+5521911110001'),
    (c_glbx_rodrigo,  'email',     'rodrigo.batista@globex.com'),
    (c_glbx_beatriz,  'whatsapp',  '+5521911110003'),
    (c_glbx_eduardo,  'webchat',   'eduardo-martins-wc-001'),
    (c_glbx_patricia, 'email',     'patricia.sousa@email.com'),
    (c_init_lucas,    'whatsapp',  '+5531911110001'),
    (c_init_isabela,  'email',     'isabela.gomes@initech.com'),
    (c_init_gabriel,  'whatsapp',  '+5531911110003')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════
  -- 3. AGENTES DE IA
  -- ════════════════════════════════════════════════════════

  INSERT INTO public.ai_agents (
    id, company_id, name, description, provider, model,
    system_prompt, scope, handoff_keywords, handoff_after_mins,
    is_active, is_published
  ) VALUES
    (
      ag_acme_suporte,
      'c1111111-1111-1111-1111-111111111111',
      'Suporte Bot',
      'Agente de suporte técnico para clientes Acme Corp.',
      'openai',
      'gpt-4o-mini',
      'Você é um assistente de suporte técnico da Acme Corp. Responda sempre de forma cordial e objetiva. '
      'Escalone para humano se o cliente reportar problemas críticos ou mencionar cancelamento.',
      '{"channels": ["whatsapp", "webchat"], "auto_reply": true, "working_hours": {"enabled": false}}',
      ARRAY['cancelar', 'cancelamento', 'humano', 'falar com atendente', 'problema grave'],
      30,
      true,
      true
    ),
    (
      ag_acme_vendas,
      'c1111111-1111-1111-1111-111111111111',
      'Vendas IA',
      'Agente de pré-vendas e qualificação de leads da Acme Corp.',
      'openai',
      'gpt-4o',
      'Você é um consultor de vendas da Acme Corp. Sua missão é qualificar leads, entender as necessidades '
      'do cliente e agendar demonstrações com o time de vendas.',
      '{"channels": ["whatsapp", "instagram", "email"], "auto_reply": true}',
      ARRAY['falar com vendedor', 'preço', 'desconto', 'contrato'],
      20,
      true,
      true
    ),
    (
      ag_glbx_atend,
      'c2222222-2222-2222-2222-222222222222',
      'Atendimento Globex',
      'Agente geral de atendimento da Globex Inc — em rascunho.',
      'anthropic',
      'claude-3-haiku-20240307',
      'Você é o assistente virtual da Globex Inc. Seja prestativo e direcione o cliente para o departamento '
      'correto conforme a necessidade.',
      '{"channels": ["whatsapp", "email"], "auto_reply": false}',
      ARRAY['gerente', 'diretor', 'urgente'],
      NULL,
      false,
      false
    )
  ON CONFLICT (id) DO NOTHING;

  -- ════════════════════════════════════════════════════════
  -- 4. VÍNCULOS DE AGENTE (agent bindings)
  -- ════════════════════════════════════════════════════════

  INSERT INTO public.ai_agent_bindings (agent_id, company_id, binding_type, channel, is_active) VALUES
    (ag_acme_suporte, 'c1111111-1111-1111-1111-111111111111', 'channel', 'whatsapp',  true),
    (ag_acme_suporte, 'c1111111-1111-1111-1111-111111111111', 'channel', 'webchat',   true),
    (ag_acme_vendas,  'c1111111-1111-1111-1111-111111111111', 'channel', 'instagram', true),
    (ag_acme_vendas,  'c1111111-1111-1111-1111-111111111111', 'channel', 'whatsapp',  true),
    (ag_glbx_atend,   'c2222222-2222-2222-2222-222222222222', 'channel', 'whatsapp',  false)
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════
  -- 5. CONVERSAS
  -- ════════════════════════════════════════════════════════

  -- ── Acme Corp ─────────────────────────────────────────────
  -- conv_acme_1: urgente, humano, não resolvido → testa inbox prioridade alta
  -- conv_acme_2: alto, humano, proposta Enterprise
  -- conv_acme_3: IA (Suporte Bot) ativa, modo ai
  -- conv_acme_4: IA (Vendas) ativa, modo ai, 2 msgs não lidas
  -- conv_acme_5: modo hybrid, Vendas IA assistindo humano
  -- conv_acme_6: recém-aberta, sem histórico longo
  -- conv_acme_7: fechada → testa filtro de status

  INSERT INTO public.conversations (
    id, company_id, contact_id, channel, status, priority,
    assigned_to, unread_count, attendance_mode, ai_agent_id, created_at
  ) VALUES
    (conv_acme_1, 'c1111111-1111-1111-1111-111111111111', c_acme_rafael,  'whatsapp', 'open',   'urgent', agent_acme, 3, 'human',  NULL,            now() - interval '1 day'),
    (conv_acme_2, 'c1111111-1111-1111-1111-111111111111', c_acme_ana,     'email',    'open',   'high',   agent_acme, 1, 'human',  NULL,            now() - interval '2 days'),
    (conv_acme_3, 'c1111111-1111-1111-1111-111111111111', c_acme_marcos,  'webchat',  'open',   'normal', agent_acme, 0, 'ai',     ag_acme_suporte, now() - interval '3 hours'),
    (conv_acme_4, 'c1111111-1111-1111-1111-111111111111', c_acme_julia,   'whatsapp', 'open',   'normal', NULL,       2, 'ai',     ag_acme_vendas,  now() - interval '5 hours'),
    (conv_acme_5, 'c1111111-1111-1111-1111-111111111111', c_acme_pedro,   'instagram','open',   'low',    NULL,       0, 'hybrid', ag_acme_vendas,  now() - interval '6 hours'),
    (conv_acme_6, 'c1111111-1111-1111-1111-111111111111', c_acme_carla,   'whatsapp', 'open',   'high',   agent_acme, 1, 'human',  NULL,            now() - interval '30 minutes'),
    (conv_acme_7, 'c1111111-1111-1111-1111-111111111111', c_acme_thiago,  'telegram', 'closed', 'normal', agent_acme, 0, 'human',  NULL,            now() - interval '4 days')
  ON CONFLICT (id) DO NOTHING;

  -- ── Globex Inc ────────────────────────────────────────────
  INSERT INTO public.conversations (
    id, company_id, contact_id, channel, status, priority,
    assigned_to, unread_count, attendance_mode, ai_agent_id, created_at
  ) VALUES
    (conv_glbx_1, 'c2222222-2222-2222-2222-222222222222', c_glbx_fernanda, 'whatsapp', 'open',   'high',   agent_glbx, 2, 'human', NULL, now() - interval '3 hours'),
    (conv_glbx_2, 'c2222222-2222-2222-2222-222222222222', c_glbx_rodrigo,  'email',    'open',   'normal', agent_glbx, 0, 'human', NULL, now() - interval '1 day'),
    (conv_glbx_3, 'c2222222-2222-2222-2222-222222222222', c_glbx_beatriz,  'whatsapp', 'open',   'urgent', NULL,       4, 'human', NULL, now() - interval '15 minutes'),
    (conv_glbx_4, 'c2222222-2222-2222-2222-222222222222', c_glbx_eduardo,  'webchat',  'closed', 'low',    agent_glbx, 0, 'human', NULL, now() - interval '5 days')
  ON CONFLICT (id) DO NOTHING;

  -- ── Initech ───────────────────────────────────────────────
  INSERT INTO public.conversations (
    id, company_id, contact_id, channel, status, priority,
    assigned_to, unread_count, attendance_mode, created_at
  ) VALUES
    (conv_init_1, 'c3333333-3333-3333-3333-333333333333', c_init_lucas,   'whatsapp', 'open', 'normal', agent_init, 1, 'human', now() - interval '2 hours'),
    (conv_init_2, 'c3333333-3333-3333-3333-333333333333', c_init_isabela, 'email',    'open', 'low',    NULL,       0, 'human', now() - interval '8 hours')
  ON CONFLICT (id) DO NOTHING;

  -- ════════════════════════════════════════════════════════
  -- 6. MENSAGENS
  -- ════════════════════════════════════════════════════════

  -- ── conv_acme_1: Rafael – Urgente, sistema fora ────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_acme_1, 'contact', 'Olá, preciso de ajuda urgente! O sistema não está abrindo.',             'delivered', false, now() - interval '23 hours'),
    (conv_acme_1, 'agent',   'Olá Rafael! Pode me dar mais detalhes sobre o erro que aparece?',       'read',      false, now() - interval '22 hours'),
    (conv_acme_1, 'contact', 'Aparece "Erro 500 - Internal Server Error" toda vez que tento logar.',   'delivered', false, now() - interval '2 hours'),
    (conv_acme_1, 'contact', 'Já tentei limpar o cache e não funcionou.',                              'delivered', false, now() - interval '1 hour'),
    (conv_acme_1, 'agent',   'Nota interna: verificar logs do servidor para o usuário rafael@acme.', 'sent',      true,  now() - interval '45 minutes'),
    (conv_acme_1, 'contact', 'Não funcionou na aba anônima também. Isso está travando meu trabalho!', 'received',  false, now() - interval '10 minutes')
  ON CONFLICT DO NOTHING;

  -- ── conv_acme_2: Ana – Proposta Enterprise ─────────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_acme_2, 'contact', 'Boa tarde! Gostaria de saber sobre o plano Enterprise.',                                       'read',      false, now() - interval '2 days'),
    (conv_acme_2, 'agent',   'Olá Ana! O Enterprise inclui suporte 24/7, API ilimitada e SLA garantido. Posso enviar proposta?', 'read', false, now() - interval '47 hours'),
    (conv_acme_2, 'contact', 'Sim, por favor! Quantos usuários inclui?',                                                      'delivered', false, now() - interval '1 hour')
  ON CONFLICT DO NOTHING;

  -- ── conv_acme_3: Marcos – Suporte Bot (IA ativa) ───────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, ai_agent_id, ai_agent_name, created_at) VALUES
    (conv_acme_3, 'contact', 'Como faço para integrar a API com o meu sistema?',                                          'read', false, NULL,            NULL,          now() - interval '3 hours'),
    (conv_acme_3, 'bot',     'Olá Marcos! Para integrar, gere uma chave em Configurações > Integrações > API. Posso te guiar!', 'sent', false, ag_acme_suporte, 'Suporte Bot', now() - interval '2 hours 58 minutes'),
    (conv_acme_3, 'contact', 'Achei! Mas qual é o endpoint base?',                                                        'read', false, NULL,            NULL,          now() - interval '2 hours'),
    (conv_acme_3, 'bot',     'O endpoint base é https://api.acmecorp.com/v2. Docs em docs.acmecorp.com. Mais alguma dúvida?', 'sent', false, ag_acme_suporte, 'Suporte Bot', now() - interval '1 hour 55 minutes')
  ON CONFLICT DO NOTHING;

  -- ── conv_acme_4: Julia – Vendas IA, 2 msgs não lidas ──
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, ai_agent_id, ai_agent_name, created_at) VALUES
    (conv_acme_4, 'contact', 'Oi! Vi o anúncio de vocês e quero saber mais sobre o produto.',                                          'read',     false, NULL,           NULL,        now() - interval '5 hours'),
    (conv_acme_4, 'bot',     'Olá Julia! Somos um CRM com IA integrada. Qual é o tamanho da sua equipe de vendas?',                    'sent',     false, ag_acme_vendas, 'Vendas IA', now() - interval '4 hours 58 minutes'),
    (conv_acme_4, 'contact', 'Temos 12 vendedores. E qual é o preço?',                                                                 'read',     false, NULL,           NULL,        now() - interval '4 hours'),
    (conv_acme_4, 'bot',     'Para 10-20 pessoas, nosso plano Team começa em R$ 2.490/mês com todas as funcionalidades de IA!',         'sent',     false, ag_acme_vendas, 'Vendas IA', now() - interval '3 hours 55 minutes'),
    (conv_acme_4, 'contact', 'Tem desconto para pagamento anual?',                                                                     'received', false, NULL,           NULL,        now() - interval '30 minutes'),
    (conv_acme_4, 'contact', 'E tem período de trial gratuito?',                                                                       'received', false, NULL,           NULL,        now() - interval '5 minutes')
  ON CONFLICT DO NOTHING;

  -- ── conv_acme_5: Pedro – Modo Hybrid ───────────────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, ai_agent_id, ai_agent_name, created_at) VALUES
    (conv_acme_5, 'system',  'Modo híbrido ativado: IA assistindo o atendimento.',                           'sent', false, ag_acme_vendas, 'Vendas IA', now() - interval '6 hours'),
    (conv_acme_5, 'contact', 'Olá, estou interessado na parceria de revenda.',                               'read', false, NULL,           NULL,        now() - interval '5 hours 50 minutes'),
    (conv_acme_5, 'agent',   'Olá Pedro! Temos um programa de parceiros bem interessante. Você já trabalha com revenda de SaaS?', 'sent', false, NULL, NULL, now() - interval '5 hours')
  ON CONFLICT DO NOTHING;

  -- ── conv_acme_6: Carla – Recém-aberta, sem resposta ───
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_acme_6, 'contact', 'Bom dia! Não consigo acessar minha conta há 2 dias.', 'received', false, now() - interval '30 minutes')
  ON CONFLICT DO NOTHING;

  -- ── conv_acme_7: Thiago – Fechada ──────────────────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_acme_7, 'contact', 'Obrigado pelo atendimento! Problema resolvido.',              'read', false, now() - interval '4 days'),
    (conv_acme_7, 'agent',   'Fico feliz em ter ajudado! Qualquer coisa estamos à disposição.', 'read', false, now() - interval '3 days 23 hours'),
    (conv_acme_7, 'system',  'Conversa encerrada.',                                         'sent', false, now() - interval '3 days 22 hours')
  ON CONFLICT DO NOTHING;

  -- ── conv_glbx_1: Fernanda – Alto, configuração ─────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_glbx_1, 'contact', 'Preciso de suporte para configurar o módulo de relatórios.', 'read',      false, now() - interval '3 hours'),
    (conv_glbx_1, 'agent',   'Olá Fernanda! Pode me dizer qual versão você está usando?',  'read',      false, now() - interval '2 hours 50 minutes'),
    (conv_glbx_1, 'contact', 'Versão 3.2.1.',                                              'read',      false, now() - interval '2 hours'),
    (conv_glbx_1, 'contact', 'Quando vocês podem me ajudar com isso?',                     'delivered', false, now() - interval '20 minutes')
  ON CONFLICT DO NOTHING;

  -- ── conv_glbx_2: Rodrigo – Normal, resolvido ───────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_glbx_2, 'agent',   'Olá Rodrigo, aqui está o relatório mensal conforme combinado.', 'read', false, now() - interval '1 day'),
    (conv_glbx_2, 'contact', 'Perfeito! Obrigado.',                                           'read', false, now() - interval '23 hours')
  ON CONFLICT DO NOTHING;

  -- ── conv_glbx_3: Beatriz – Urgente, 4 não lidas ────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_glbx_3, 'contact', 'URGENTE: nosso sistema de pagamentos parou de funcionar!', 'received', false, now() - interval '15 minutes'),
    (conv_glbx_3, 'contact', 'Precisamos de suporte IMEDIATO!',                          'received', false, now() - interval '12 minutes'),
    (conv_glbx_3, 'contact', 'Alguém está online?',                                      'received', false, now() - interval '5 minutes'),
    (conv_glbx_3, 'contact', 'Isso está nos custando R$ 10.000/hora!',                   'received', false, now() - interval '2 minutes')
  ON CONFLICT DO NOTHING;

  -- ── conv_glbx_4: Eduardo – Fechada ─────────────────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_glbx_4, 'contact', 'Dúvida sobre o dashboard resolvida. Valeu!', 'read', false, now() - interval '5 days')
  ON CONFLICT DO NOTHING;

  -- ── conv_init_1: Lucas – Trial ──────────────────────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_init_1, 'contact', 'Quero testar a plataforma antes de contratar.',                    'read',      false, now() - interval '2 hours'),
    (conv_init_1, 'agent',   'Claro Lucas! Tenho um trial de 14 dias gratuito para você.',       'delivered', false, now() - interval '1 hour 50 minutes'),
    (conv_init_1, 'contact', 'Ótimo! Como faço para ativar?',                                    'received',  false, now() - interval '10 minutes')
  ON CONFLICT DO NOTHING;

  -- ── conv_init_2: Isabela – Renovação ───────────────────
  INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at) VALUES
    (conv_init_2, 'contact', 'Boa tarde, quero renovar minha assinatura.',                                          'read', false, now() - interval '8 hours'),
    (conv_init_2, 'agent',   'Olá Isabela! Vou verificar seu plano atual e te envio as opções de renovação.',       'sent', false, now() - interval '7 hours 50 minutes')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════
  -- 7. DEALS (negócios)
  -- Usa status 'active' para abertos (v_inbox_conversations)
  -- e 'won'/'lost' para fechados (v_company_kpis conta 'won')
  -- ════════════════════════════════════════════════════════

  -- Acme Corp
  INSERT INTO public.deals (company_id, contact_id, name, amount, status, created_at) VALUES
    ('c1111111-1111-1111-1111-111111111111', c_acme_rafael,  'Rafael – Plano Pro',              4800,  'active', now() - interval '25 days'),
    ('c1111111-1111-1111-1111-111111111111', c_acme_ana,     'Ana – Proposta Enterprise',       18000, 'active', now() - interval '20 days'),
    ('c1111111-1111-1111-1111-111111111111', c_acme_marcos,  'Marcos – Integração API',         7500,  'won',    now() - interval '30 days'),
    ('c1111111-1111-1111-1111-111111111111', c_acme_julia,   'Julia – Plano Team',              2490,  'active', now() - interval '10 days'),
    ('c1111111-1111-1111-1111-111111111111', c_acme_pedro,   'Pedro – Programa Parceiros',      5000,  'active', now() - interval '5 days'),
    ('c1111111-1111-1111-1111-111111111111', c_acme_leticia, 'Letícia – Renovação Anual',       9600,  'won',    now() - interval '60 days'),
    ('c1111111-1111-1111-1111-111111111111', c_acme_carla,   'Carla – Plano Starter',           990,   'active', now() - interval '3 days'),
    ('c1111111-1111-1111-1111-111111111111', c_acme_thiago,  'Thiago – Contrato 12 meses',      35000, 'won',    now() - interval '45 days')
  ON CONFLICT DO NOTHING;

  -- Globex Inc
  INSERT INTO public.deals (company_id, contact_id, name, amount, status, created_at) VALUES
    ('c2222222-2222-2222-2222-222222222222', c_glbx_fernanda, 'Fernanda – Módulo Relatórios',   12000, 'active', now() - interval '35 days'),
    ('c2222222-2222-2222-2222-222222222222', c_glbx_rodrigo,  'Rodrigo – Plano Business',       6000,  'won',    now() - interval '40 days'),
    ('c2222222-2222-2222-2222-222222222222', c_glbx_beatriz,  'Beatriz – Plano Team + Suporte', 4980,  'active', now() - interval '10 days'),
    ('c2222222-2222-2222-2222-222222222222', c_glbx_eduardo,  'Eduardo – Consultoria Inicial',  3500,  'lost',   now() - interval '15 days'),
    ('c2222222-2222-2222-2222-222222222222', c_glbx_patricia, 'Patrícia – Avaliação Plano Pro', 4800,  'active', now() - interval '2 days')
  ON CONFLICT DO NOTHING;

  -- Initech
  INSERT INTO public.deals (company_id, contact_id, name, amount, status, created_at) VALUES
    ('c3333333-3333-3333-3333-333333333333', c_init_lucas,   'Lucas – Trial para Pro',          0,     'active', now() - interval '15 days'),
    ('c3333333-3333-3333-3333-333333333333', c_init_isabela, 'Isabela – Renovação Anual',       8400,  'won',    now() - interval '20 days'),
    ('c3333333-3333-3333-3333-333333333333', c_init_gabriel, 'Gabriel – Plano Starter',         990,   'active', now() - interval '4 days')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════
  -- 8. TAREFAS (tasks)
  -- Mix de: vencidas (overdue) e futuras, pendentes e concluídas
  -- status: 'pending' (lowercase) → compatível com v_company_kpis
  -- ════════════════════════════════════════════════════════

  -- Acme Corp
  INSERT INTO public.tasks (company_id, title, due_at, status, created_at) VALUES
    ('c1111111-1111-1111-1111-111111111111', 'Enviar proposta Enterprise para Ana Costa',       now() - interval '2 days',  'pending',   now() - interval '5 days'),
    ('c1111111-1111-1111-1111-111111111111', 'Resolver acesso bloqueado do Rafael Mendes',      now() - interval '1 day',   'pending',   now() - interval '1 day'),
    ('c1111111-1111-1111-1111-111111111111', 'Ligar para Pedro Alves – Programa Parceiros',     now() - interval '3 hours', 'pending',   now() - interval '6 hours'),
    ('c1111111-1111-1111-1111-111111111111', 'Agendar demo com Julia Santos',                   now() + interval '1 day',   'pending',   now() - interval '3 hours'),
    ('c1111111-1111-1111-1111-111111111111', 'Verificar integração API – Marcos Oliveira',      now() + interval '7 days',  'pending',   now() - interval '2 days'),
    ('c1111111-1111-1111-1111-111111111111', 'Follow-up contrato Thiago Lima',                  now() + interval '3 days',  'completed', now() - interval '50 days'),
    ('c1111111-1111-1111-1111-111111111111', 'Renovação contrato Letícia – alerta 30 dias',     now() - interval '5 days',  'completed', now() - interval '65 days')
  ON CONFLICT DO NOTHING;

  -- Globex Inc
  INSERT INTO public.tasks (company_id, title, due_at, status, created_at) VALUES
    ('c2222222-2222-2222-2222-222222222222', 'Suporte configuração módulo Fernanda Vieira',     now() - interval '1 day',    'pending', now() - interval '3 days'),
    ('c2222222-2222-2222-2222-222222222222', 'Verificar incidente pagamentos – Beatriz',        now(),                        'pending', now() - interval '15 minutes'),
    ('c2222222-2222-2222-2222-222222222222', 'Contato com Patrícia Sousa – fechar proposta',    now() - interval '12 hours',  'pending', now() - interval '2 days'),
    ('c2222222-2222-2222-2222-222222222222', 'Enviar relatório mensal Rodrigo – próximo mês',   now() + interval '15 days',   'pending', now() - interval '1 day')
  ON CONFLICT DO NOTHING;

  -- Initech
  INSERT INTO public.tasks (company_id, title, due_at, status, created_at) VALUES
    ('c3333333-3333-3333-3333-333333333333', 'Ativar trial – Lucas Carvalho',                   now() + interval '1 hour',   'pending', now() - interval '2 hours'),
    ('c3333333-3333-3333-3333-333333333333', 'Seguimento renovação – Isabela Gomes',             now() - interval '2 days',   'pending', now() - interval '8 hours'),
    ('c3333333-3333-3333-3333-333333333333', 'Qualificar Gabriel Ribeiro – plano adequado',      now() + interval '2 days',   'pending', now() - interval '4 days')
  ON CONFLICT DO NOTHING;

END $$;

-- ════════════════════════════════════════════════════════
-- VERIFICAÇÃO RÁPIDA (descomente para checar os dados)
-- ════════════════════════════════════════════════════════

-- SELECT * FROM public.v_inbox_conversations ORDER BY last_message_at DESC;
-- SELECT * FROM public.v_company_kpis;
-- SELECT COUNT(*) FROM public.contacts;
-- SELECT COUNT(*) FROM public.conversations;
-- SELECT COUNT(*) FROM public.messages;
-- SELECT COUNT(*) FROM public.deals;
-- SELECT COUNT(*) FROM public.tasks;
-- SELECT COUNT(*) FROM public.ai_agents;
