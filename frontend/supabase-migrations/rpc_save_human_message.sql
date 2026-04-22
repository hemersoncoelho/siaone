-- ============================================================
-- RPC: rpc_save_human_message
--
-- Persiste mensagem enviada por agente humano após o envio via
-- n8n/UAZAPI. Espelho de rpc_save_ai_message, mas com
-- sender_type='user'. Chamada pelo workflow n8n [Outbound - Human].
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_save_human_message(UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.rpc_save_human_message(UUID, TEXT, TEXT, TEXT, UUID, TEXT);

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
BEGIN

  -- 1. Usar conversation_id direto se fornecido, senão buscar pelo telefone
  IF p_conversation_id IS NOT NULL THEN
    SELECT contact_id INTO v_contact_id
    FROM conversations
    WHERE id         = p_conversation_id
      AND company_id = p_company_id;

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
    company_id,
    conversation_id,
    contact_id,
    direction,
    message_type,
    sender_type,
    sender_user_id,
    body,
    external_message_id,
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
    'user'::sender_type_enum,
    p_sender_id,
    p_body,
    p_external_message_id,
    '{}'::jsonb,
    'sent'::message_status_enum,
    false,
    NOW()
  ) RETURNING id INTO v_message_id;

  -- 3. Atualizar preview da conversa
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

GRANT EXECUTE ON FUNCTION public.rpc_save_human_message(UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';