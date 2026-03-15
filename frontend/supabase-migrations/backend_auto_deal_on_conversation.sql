-- ============================================================
-- Fix: rpc_create_contact_and_conversation agora cria deal
-- automaticamente no primeiro estágio do pipeline padrão
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_contact_and_conversation(
    p_company_id      UUID,
    p_contact_name    TEXT,
    p_channel         TEXT,
    p_identity        TEXT,
    p_initial_message TEXT,
    p_agent_id        UUID
)
RETURNS JSON AS $$
DECLARE
    v_contact_id      UUID;
    v_conversation_id UUID;
    v_message_id      BIGINT;
    v_deal_id         UUID;
    v_pipeline_id     UUID;
    v_stage_id        UUID;
    v_deal_title      TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(p_company_id, ARRAY['company_admin', 'manager', 'agent'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para criar contato/conversa nesta empresa.');
    END IF;

    -- Busca contato existente pelo identity normalizado
    SELECT ci.contact_id INTO v_contact_id
    FROM public.contact_identities ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.normalized_value = p_identity
      AND c.company_id = p_company_id
    LIMIT 1;

    -- Cria contato se não existir
    IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts (company_id, full_name, created_at)
        VALUES (p_company_id, p_contact_name, now())
        RETURNING id INTO v_contact_id;

        INSERT INTO public.contact_identities (
            company_id, contact_id, channel_type, identity_type,
            normalized_value, display_value, is_primary, is_verified
        ) VALUES (
            p_company_id,
            v_contact_id,
            p_channel::public.channel_type_enum,
            CASE p_channel WHEN 'email' THEN 'email' ELSE 'phone' END,
            p_identity,
            p_identity,
            true,
            false
        );
    END IF;

    -- Cria conversa
    INSERT INTO public.conversations (
        company_id, contact_id, assigned_to_user_id,
        status, priority, unread_count, created_at
    ) VALUES (
        p_company_id, v_contact_id, p_agent_id,
        'open', 'normal', 0, now()
    ) RETURNING id INTO v_conversation_id;

    -- Insere mensagem inicial outbound
    INSERT INTO public.messages (
        company_id, conversation_id, contact_id,
        direction, message_type, sender_type, sender_user_id,
        body, payload, status, is_internal, created_at
    ) VALUES (
        p_company_id, v_conversation_id, v_contact_id,
        'outbound'::public.message_direction_enum,
        'text',
        'user'::public.sender_type_enum,
        p_agent_id,
        p_initial_message,
        '{}'::JSONB,
        'queued'::public.message_status_enum,
        false,
        now()
    ) RETURNING id INTO v_message_id;

    -- Busca pipeline padrão (ou primeiro ativo) da empresa
    SELECT p.id INTO v_pipeline_id
    FROM public.pipelines p
    WHERE p.company_id = p_company_id
      AND p.is_active = true
    ORDER BY p.is_default DESC, p.created_at ASC
    LIMIT 1;

    -- Busca primeiro estágio do pipeline
    IF v_pipeline_id IS NOT NULL THEN
        SELECT ps.id INTO v_stage_id
        FROM public.pipeline_stages ps
        WHERE ps.pipeline_id = v_pipeline_id
        ORDER BY ps.position ASC
        LIMIT 1;
    END IF;

    -- Cria deal no pipeline se encontrou pipeline e estágio
    IF v_pipeline_id IS NOT NULL AND v_stage_id IS NOT NULL THEN
        v_deal_title := p_contact_name || ' via ' ||
            CASE p_channel
                WHEN 'whatsapp'  THEN 'WhatsApp'
                WHEN 'email'     THEN 'E-mail'
                WHEN 'instagram' THEN 'Instagram'
                WHEN 'telegram'  THEN 'Telegram'
                WHEN 'webchat'   THEN 'Webchat'
                ELSE p_channel
            END;

        INSERT INTO public.deals (
            company_id, contact_id, conversation_id,
            pipeline_id, stage_id, owner_user_id,
            title, amount, currency, status
        ) VALUES (
            p_company_id, v_contact_id, v_conversation_id,
            v_pipeline_id, v_stage_id, p_agent_id,
            v_deal_title, 0, 'BRL', 'open'::public.deal_status_enum
        ) RETURNING id INTO v_deal_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'contact_id', v_contact_id,
        'message_id', v_message_id,
        'deal_id', v_deal_id
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rpc_create_contact_and_conversation error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
