-- ============================================================
-- RPC: rpc_save_ai_message
--
-- Persiste a resposta gerada pela IA no banco após o envio
-- via UAZAPI, para que a mensagem apareça no Inbox do frontend.
--
-- Fluxo n8n: chamada única após o Loop Over Items1 finalizar.
-- A mensagem já foi enviada ao WhatsApp — aqui apenas gravamos
-- o registro para exibição no frontend e histórico da conversa.
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_save_ai_message(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.rpc_save_ai_message(UUID, TEXT, TEXT);

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
BEGIN

  -- 1. Resolver contato pelo telefone + empresa
  SELECT ci.contact_id INTO v_contact_id
  FROM contact_identities ci
  WHERE ci.company_id     = p_company_id
    AND ci.channel_type   = 'whatsapp'::channel_type_enum
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
    company_id,
    conversation_id,
    contact_id,
    direction,
    message_type,
    sender_type,
    body,
    payload,
    status,
    is_internal,
    created_at
  ) VALUES (
    p_company_id,
    v_conversation_id,
    v_contact_id,
    'outbound'::message_direction_enum,
    'text',
    'bot'::sender_type_enum,
    p_body,
    '{}'::jsonb,
    'sent'::message_status_enum,
    false,
    NOW()
  ) RETURNING id INTO v_message_id;

  -- 4. Atualizar preview da conversa (sem incrementar unread_count)
  v_preview := LEFT(p_body, 200);

  UPDATE conversations
  SET
    last_message_at      = NOW(),
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
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM
  );
END;
$$;

-- Garante que apenas service_role ou usuários autenticados chamem
-- (a função é SECURITY DEFINER, então o caller não precisa de RLS)
GRANT EXECUTE ON FUNCTION public.rpc_save_ai_message(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
