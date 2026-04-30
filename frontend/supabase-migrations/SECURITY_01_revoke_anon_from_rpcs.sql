-- ============================================================
-- SECURITY FIX 01: Revogar anon de RPCs que escrevem dados
-- sensíveis ou expõem credenciais de integração.
--
-- CONTEXTO:
--   rpc_save_ai_message, rpc_save_human_message e
--   rpc_get_company_integration estavam com GRANT TO anon,
--   permitindo que qualquer chamada sem autenticação
--   gravasse mensagens falsas ou lesse instance_token UAZAPI.
--
-- PRÉ-REQUISITO:
--   Antes de aplicar, migrar o n8n para usar a service_role key
--   (ver instrução no final deste arquivo).
-- ============================================================

-- ── 1. rpc_save_ai_message ────────────────────────────────────
-- Grava mensagens da IA no Inbox. Deve ser chamada apenas pelo
-- n8n autenticado via service_role.

REVOKE EXECUTE ON FUNCTION public.rpc_save_ai_message(UUID, TEXT, TEXT)
  FROM anon;

-- Mantém: authenticated e service_role podem chamar
-- (service_role é o correto para n8n)
GRANT EXECUTE ON FUNCTION public.rpc_save_ai_message(UUID, TEXT, TEXT)
  TO authenticated, service_role;

-- ── 2. rpc_save_human_message ─────────────────────────────────
-- Grava mensagens de agente humano. Mesmo padrão.

REVOKE EXECUTE ON FUNCTION public.rpc_save_human_message(UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID)
  FROM anon;

GRANT EXECUTE ON FUNCTION public.rpc_save_human_message(UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID)
  TO authenticated, service_role;

-- ── 3. rpc_get_company_integration ───────────────────────────
-- CRÍTICO: expõe instance_token (credencial WhatsApp UAZAPI).
-- Não deve ser acessível por anon em hipótese alguma.
-- O n8n que precisa desse dado deve usar service_role key.

REVOKE EXECUTE ON FUNCTION public.rpc_get_company_integration(UUID)
  FROM anon;

GRANT EXECUTE ON FUNCTION public.rpc_get_company_integration(UUID)
  TO authenticated, service_role;

-- ── 4. Adicionar verificação interna de contexto em ──────────
--    rpc_save_ai_message e rpc_save_human_message
--    (defesa em profundidade: falha rápido se chamado sem
--    service_role mas ainda via PostgREST com JWT indevido)
--
-- NOTA: SECURITY DEFINER + app.role='service_role' só funciona
--   se o n8n enviar o JWT do service_role no header Authorization.
--   A revogação de anon acima é a proteção primária.
--   A verificação abaixo protege contra authenticated não-autorizados.
--
-- rpc_save_ai_message — adiciona verificação de role
CREATE OR REPLACE FUNCTION public.rpc_save_ai_message(
  p_company_id  UUID,
  p_phone       TEXT,
  p_body        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id      UUID;
  v_conversation_id UUID;
  v_message_id      BIGINT;
  v_preview         TEXT;
  v_role            TEXT;
BEGIN
  -- Apenas service_role ou sistema interno pode chamar esta função.
  -- authenticated direto do frontend não deve chamar rpc_save_ai_message.
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role'
    INTO v_role;

  IF auth.uid() IS NOT NULL AND v_role NOT IN ('service_role') THEN
    -- Usuário autenticado normal: não permitido (apenas n8n via service_role)
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Acesso não autorizado. Esta RPC é reservada ao sistema.'
    );
  END IF;

  -- 1. Resolver contato pelo telefone + empresa
  SELECT ci.contact_id INTO v_contact_id
  FROM contact_identities ci
  WHERE ci.company_id      = p_company_id
    AND ci.channel_type    = 'whatsapp'::channel_type_enum
    AND ci.normalized_value = p_phone
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Contato não encontrado para o telefone: ' || p_phone
    );
  END IF;

  -- 2. Resolver conversa aberta
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE company_id = p_company_id
    AND contact_id = v_contact_id
    AND status     = 'open'::conversation_status_enum
    AND channel    = 'whatsapp'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Nenhuma conversa aberta encontrada para o contato.'
    );
  END IF;

  -- 3. Inserir mensagem da IA
  INSERT INTO messages (
    company_id, conversation_id, contact_id,
    direction, message_type, sender_type,
    body, payload, status, is_internal, created_at
  ) VALUES (
    p_company_id, v_conversation_id, v_contact_id,
    'outbound'::message_direction_enum, 'text', 'bot'::sender_type_enum,
    p_body, '{}'::jsonb, 'sent'::message_status_enum, false, NOW()
  ) RETURNING id INTO v_message_id;

  -- 4. Atualizar preview da conversa
  v_preview := LEFT(p_body, 200);

  UPDATE conversations
  SET last_message_at      = NOW(),
      last_message_preview = v_preview,
      updated_at           = NOW()
  WHERE id = v_conversation_id;

  RETURN jsonb_build_object(
    'success',         true,
    'message_id',      v_message_id,
    'conversation_id', v_conversation_id,
    'contact_id',      v_contact_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- rpc_save_human_message — adiciona verificação de role
CREATE OR REPLACE FUNCTION public.rpc_save_human_message(
  p_company_id          UUID,
  p_phone               TEXT,
  p_body                TEXT,
  p_sender_name         TEXT   DEFAULT NULL,
  p_conversation_id     UUID   DEFAULT NULL,
  p_external_message_id TEXT   DEFAULT NULL,
  p_sender_id           UUID   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id      UUID;
  v_conversation_id UUID;
  v_message_id      BIGINT;
  v_preview         TEXT;
  v_role            TEXT;
BEGIN
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role'
    INTO v_role;

  IF auth.uid() IS NOT NULL AND v_role NOT IN ('service_role') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Acesso não autorizado. Esta RPC é reservada ao sistema.'
    );
  END IF;

  -- 1. Usar conversation_id direto se fornecido, senão buscar pelo telefone
  IF p_conversation_id IS NOT NULL THEN
    SELECT contact_id INTO v_contact_id
    FROM conversations
    WHERE id = p_conversation_id AND company_id = p_company_id;
    v_conversation_id := p_conversation_id;
  ELSE
    SELECT ci.contact_id INTO v_contact_id
    FROM contact_identities ci
    WHERE ci.company_id       = p_company_id
      AND ci.channel_type     = 'whatsapp'::channel_type_enum
      AND ci.normalized_value = p_phone
    LIMIT 1;

    IF v_contact_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'Contato não encontrado para o telefone: ' || p_phone
      );
    END IF;

    SELECT id INTO v_conversation_id
    FROM conversations
    WHERE company_id = p_company_id
      AND contact_id = v_contact_id
      AND status     = 'open'::conversation_status_enum
      AND channel    = 'whatsapp'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_conversation_id IS NULL OR v_contact_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Conversa ou contato não encontrado.'
    );
  END IF;

  -- 2. Inserir mensagem do agente humano
  INSERT INTO messages (
    company_id, conversation_id, contact_id,
    direction, message_type, sender_type, sender_user_id,
    body, external_message_id, payload, status, is_internal, created_at
  ) VALUES (
    p_company_id, v_conversation_id, v_contact_id,
    'outbound'::message_direction_enum, 'text', 'user'::sender_type_enum, p_sender_id,
    p_body, p_external_message_id, '{}'::jsonb,
    'sent'::message_status_enum, false, NOW()
  ) RETURNING id INTO v_message_id;

  -- 3. Atualizar preview da conversa
  v_preview := LEFT(p_body, 200);

  UPDATE conversations
  SET last_message_at      = NOW(),
      last_message_preview = v_preview,
      updated_at           = NOW()
  WHERE id = v_conversation_id;

  RETURN jsonb_build_object(
    'success',         true,
    'message_id',      v_message_id,
    'conversation_id', v_conversation_id,
    'contact_id',      v_contact_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- INSTRUÇÃO PARA O N8N (executar ANTES de aplicar esta migração)
-- ============================================================
--
-- 1. Em n8n → Settings → Credentials → criar nova credencial
--    HTTP Header Auth (ou Generic Credential se usar node HTTP):
--    - Name: "Supabase Service Role"
--    - Header Name: Authorization
--    - Header Value: Bearer <SUPABASE_SERVICE_ROLE_KEY>
--    Adicionar também header "apikey": <SUPABASE_SERVICE_ROLE_KEY>
--
-- 2. No workflow [IA - Comercial]:
--    - Node "inbout_message1" (rpc_save_ai_message):
--      Trocar credential de anon key → "Supabase Service Role"
--    - Node "prompt_agent" (rpc_get_active_ai_agent):
--      Opcional mas recomendado: trocar para service_role também
--
-- 3. No workflow [Outbound - Human]:
--    - Node que chama rpc_save_human_message:
--      Trocar credential de anon key → "Supabase Service Role"
--    - Node que chama rpc_get_company_integration:
--      Trocar credential de anon key → "Supabase Service Role"
--
-- 4. Testar ambos os workflows em staging antes de aplicar esta migração
-- ============================================================
