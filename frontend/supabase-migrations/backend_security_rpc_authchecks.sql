-- ============================================================
-- Security Fix: Auth checks em todas as RPCs SECURITY DEFINER
-- As versões antigas ainda estão ativas e usadas pelo frontend.
-- Adicionamos verificação de autenticação e pertencimento de empresa
-- antes de qualquer mutação, seguindo o padrão das versões novas.
-- ============================================================

-- ── 1. rpc_mark_conversation_read ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_mark_conversation_read(
    p_conversation_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Conversa não encontrada.');
    END IF;

    IF NOT (public.is_platform_admin() OR public.is_company_member(v_company_id)) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para acessar esta conversa.');
    END IF;

    UPDATE public.conversations
    SET unread_count = 0
    WHERE id = p_conversation_id;

    UPDATE public.messages
    SET status = 'read'
    WHERE conversation_id = p_conversation_id
      AND sender_type = 'contact'
      AND status != 'read'
      AND is_internal = false;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 2. rpc_enqueue_outbound_message (assinatura antiga) ───────────────

CREATE OR REPLACE FUNCTION public.rpc_enqueue_outbound_message(
    p_conversation_id UUID,
    p_body            TEXT,
    p_sender_id       UUID,
    p_is_internal     BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
DECLARE
    v_conv   public.conversations%ROWTYPE;
    v_msg_id BIGINT;
    v_pub_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT * INTO v_conv
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Conversa não encontrada.');
    END IF;

    IF NOT (public.is_platform_admin() OR public.is_company_member(v_conv.company_id)) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para enviar nessa conversa.');
    END IF;

    INSERT INTO public.messages (
        company_id,
        conversation_id,
        contact_id,
        channel_account_id,
        direction,
        message_type,
        sender_type,
        sender_user_id,
        body,
        payload,
        status,
        is_internal
    ) VALUES (
        v_conv.company_id,
        v_conv.id,
        v_conv.contact_id,
        v_conv.channel_account_id,
        'outbound'::public.message_direction_enum,
        'text',
        'user',
        COALESCE(p_sender_id, auth.uid()),
        p_body,
        '{}'::JSONB,
        CASE WHEN p_is_internal
             THEN 'sent'::public.message_status_enum
             ELSE 'queued'::public.message_status_enum END,
        p_is_internal
    )
    RETURNING id, public_id INTO v_msg_id, v_pub_id;

    IF NOT p_is_internal THEN
        UPDATE public.conversations
        SET
            last_message_at      = NOW(),
            last_message_preview = LEFT(p_body, 200)
        WHERE id = p_conversation_id;
    END IF;

    RETURN json_build_object(
        'success',    true,
        'message_id', v_msg_id,
        'public_id',  v_pub_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 3. rpc_assign_conversation (assinatura antiga: uuid, uuid) ────────

CREATE OR REPLACE FUNCTION public.rpc_assign_conversation(
    p_conversation_id UUID,
    p_user_id         UUID
)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Conversa não encontrada.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(v_company_id, ARRAY['company_admin', 'manager'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para atribuir esta conversa.');
    END IF;

    UPDATE public.conversations
    SET assigned_to = p_user_id
    WHERE id = p_conversation_id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 4. rpc_close_conversation (assinatura antiga: uuid) ───────────────

CREATE OR REPLACE FUNCTION public.rpc_close_conversation(
    p_conversation_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Conversa não encontrada.');
    END IF;

    IF NOT (public.is_platform_admin() OR public.is_company_member(v_company_id)) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para encerrar esta conversa.');
    END IF;

    UPDATE public.conversations
    SET status = 'closed'
    WHERE id = p_conversation_id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 5. rpc_set_conversation_attendance ────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_set_conversation_attendance(
    p_conversation_id UUID,
    p_mode            TEXT,
    p_agent_id        UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
    v_body       TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Conversa não encontrada.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(v_company_id, ARRAY['company_admin', 'manager'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para alterar o modo de atendimento.');
    END IF;

    -- Verifica que o agent pertence à mesma empresa
    IF p_agent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.ai_agents
            WHERE id = p_agent_id AND company_id = v_company_id
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Agente não pertence a esta empresa.');
        END IF;
    END IF;

    UPDATE public.conversations
    SET
        attendance_mode = p_mode::public.attendance_mode_enum,
        ai_agent_id     = p_agent_id,
        ai_paused_at    = CASE WHEN p_mode = 'human' THEN NOW() ELSE NULL END
    WHERE id = p_conversation_id;

    v_body := CASE p_mode
        WHEN 'ai'     THEN 'Atendimento transferido para IA.'
        WHEN 'human'  THEN 'Atendimento retomado por humano.'
        WHEN 'hybrid' THEN 'Modo híbrido ativado: IA assistindo o atendimento.'
        ELSE 'Modo de atendimento alterado.'
    END;

    INSERT INTO public.messages (
        conversation_id, sender_type, body, status, is_internal, ai_agent_id
    ) VALUES (
        p_conversation_id, 'system', v_body, 'sent', false, p_agent_id
    );

    RETURN json_build_object('success', true, 'mode', p_mode);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 6. rpc_toggle_ai_agent ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_toggle_ai_agent(
    p_agent_id  UUID,
    p_is_active BOOLEAN
)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.ai_agents
    WHERE id = p_agent_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Agente não encontrado.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(v_company_id, ARRAY['company_admin', 'manager'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para ativar/desativar este agente.');
    END IF;

    UPDATE public.ai_agents
    SET is_active = p_is_active, updated_at = NOW()
    WHERE id = p_agent_id;

    RETURN json_build_object('success', true, 'is_active', p_is_active);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 7. rpc_create_contact_and_conversation (assinatura antiga) ────────

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
    v_message_id      UUID;
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

    -- Verifica que o agente pertence à empresa
    IF p_agent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_companies
            WHERE user_id = p_agent_id AND company_id = p_company_id
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Agente atribuído não pertence a esta empresa.');
        END IF;
    END IF;

    SELECT ci.contact_id INTO v_contact_id
    FROM public.contact_identities ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.identifier = p_identity AND c.company_id = p_company_id
    LIMIT 1;

    IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts (company_id, full_name, created_at)
        VALUES (p_company_id, p_contact_name, now())
        RETURNING id INTO v_contact_id;

        INSERT INTO public.contact_identities (contact_id, provider, identifier)
        VALUES (v_contact_id, p_channel, p_identity);
    END IF;

    INSERT INTO public.conversations (
        company_id, contact_id, channel, assigned_to, status, priority, unread_count, created_at
    ) VALUES (
        p_company_id, v_contact_id, p_channel, p_agent_id, 'open', 'normal', 0, now()
    ) RETURNING id INTO v_conversation_id;

    INSERT INTO public.messages (
        conversation_id, sender_type, sender_id, body, status, is_internal, created_at
    ) VALUES (
        v_conversation_id, 'agent', p_agent_id, p_initial_message,
        'queued'::public.message_status_enum, false, now()
    ) RETURNING id INTO v_message_id;

    RETURN json_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'contact_id', v_contact_id,
        'message_id', v_message_id
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rpc_create_contact_and_conversation error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 8. rpc_save_ai_agent: verificar que caller pertence à empresa ─────

CREATE OR REPLACE FUNCTION public.rpc_save_ai_agent(
    p_company_id         UUID,
    p_name               TEXT,
    p_description        TEXT DEFAULT NULL,
    p_provider           TEXT DEFAULT 'openai',
    p_model              TEXT DEFAULT 'gpt-4o-mini',
    p_system_prompt      TEXT DEFAULT NULL,
    p_scope              JSONB DEFAULT '{"channels": [], "auto_reply": false}',
    p_handoff_keywords   TEXT[] DEFAULT '{}',
    p_handoff_after_mins INTEGER DEFAULT NULL,
    p_is_published       BOOLEAN DEFAULT false,
    p_agent_id           UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(p_company_id, ARRAY['company_admin', 'manager'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para gerenciar agentes nesta empresa.');
    END IF;

    IF p_agent_id IS NULL THEN
        INSERT INTO public.ai_agents (
            company_id, name, description, provider, model,
            system_prompt, scope, handoff_keywords, handoff_after_mins,
            is_published, created_by
        ) VALUES (
            p_company_id, p_name, p_description, p_provider::public.ai_agent_provider_enum, p_model,
            p_system_prompt, p_scope, p_handoff_keywords, p_handoff_after_mins,
            p_is_published, auth.uid()
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE public.ai_agents SET
            name                = p_name,
            description         = p_description,
            provider            = p_provider::public.ai_agent_provider_enum,
            model               = p_model,
            system_prompt       = p_system_prompt,
            scope               = p_scope,
            handoff_keywords    = p_handoff_keywords,
            handoff_after_mins  = p_handoff_after_mins,
            is_published        = p_is_published,
            updated_at          = NOW()
        WHERE id = p_agent_id AND company_id = p_company_id
        RETURNING id INTO v_id;
    END IF;

    RETURN json_build_object('success', true, 'agent_id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
