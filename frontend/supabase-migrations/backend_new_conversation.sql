-- SQL Script: Phase 13 - New Conversation Flow

-- 1. Create or Replace RPC for atomic contact + conversation creation
DROP FUNCTION IF EXISTS public.rpc_create_contact_and_conversation(uuid, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_create_contact_and_conversation(
    p_company_id UUID,
    p_contact_name TEXT,
    p_channel TEXT,
    p_identity TEXT,
    p_initial_message TEXT,
    p_agent_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_contact_id UUID;
    v_conversation_id UUID;
    v_message_id UUID;
    v_identity_record RECORD;
BEGIN
    -- Step 1: Check if the contact identity exists for this company
    SELECT ci.contact_id INTO v_contact_id
    FROM public.contact_identities ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.identifier = p_identity AND c.company_id = p_company_id
    LIMIT 1;

    -- Step 2: If contact doesn't exist, create it
    IF v_contact_id IS NULL THEN
        -- Insert new Contact
        INSERT INTO public.contacts (company_id, full_name, created_at)
        VALUES (p_company_id, p_contact_name, now())
        RETURNING id INTO v_contact_id;

        -- Insert Contact Identity
        INSERT INTO public.contact_identities (contact_id, provider, identifier)
        VALUES (v_contact_id, p_channel, p_identity);
    END IF;

    -- Step 3: Create the Conversation
    INSERT INTO public.conversations (
        company_id, 
        contact_id, 
        channel, 
        assigned_to, 
        status, 
        priority, 
        unread_count, 
        created_at
    ) VALUES (
        p_company_id,
        v_contact_id,
        p_channel,
        p_agent_id,
        'open',
        'normal',
        0, -- It's an outbound manual message, so agent read it already
        now()
    ) RETURNING id INTO v_conversation_id;

    -- Step 4: Insert the initial (outbound) message
    INSERT INTO public.messages (
        conversation_id,
        sender_type,
        sender_id,
        body,
        status,
        is_internal,
        created_at
    ) VALUES (
        v_conversation_id,
        'agent',
        p_agent_id,
        p_initial_message,
        'queued'::public.message_status_enum,
        false,
        now()
    ) RETURNING id INTO v_message_id;

    -- Return success and the new conversation id so the frontend can redirect
    RETURN json_build_object(
        'success', true, 
        'conversation_id', v_conversation_id,
        'contact_id', v_contact_id,
        'message_id', v_message_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
