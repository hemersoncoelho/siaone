-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE public.message_status_enum AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'received');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Enhance Messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status public.message_status_enum DEFAULT 'received';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- 3. Create RPCs
-- RPC: enqueue outbound message
CREATE OR REPLACE FUNCTION public.rpc_enqueue_outbound_message(
    p_conversation_id UUID, 
    p_body TEXT, 
    p_sender_id UUID,
    p_is_internal BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
DECLARE
    v_message_id UUID;
BEGIN
    INSERT INTO public.messages (
        conversation_id, 
        sender_type, 
        sender_id, 
        body, 
        status, 
        is_internal
    ) VALUES (
        p_conversation_id, 
        'agent', 
        p_sender_id, 
        p_body, 
        CASE WHEN p_is_internal THEN 'sent'::public.message_status_enum ELSE 'queued'::public.message_status_enum END, 
        p_is_internal
    ) RETURNING id INTO v_message_id;

    RETURN json_build_object('success', true, 'message_id', v_message_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: assign conversation
CREATE OR REPLACE FUNCTION public.rpc_assign_conversation(
    p_conversation_id UUID, 
    p_user_id UUID
)
RETURNS JSON AS $$
BEGIN
    UPDATE public.conversations 
    SET assigned_to = p_user_id 
    WHERE id = p_conversation_id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: mark conversation read
DROP FUNCTION IF EXISTS public.rpc_mark_conversation_read(uuid);
CREATE OR REPLACE FUNCTION public.rpc_mark_conversation_read(
    p_conversation_id UUID
)
RETURNS JSON AS $$
BEGIN
    UPDATE public.conversations 
    SET unread_count = 0 
    WHERE id = p_conversation_id;

    UPDATE public.messages
    SET status = 'read'
    WHERE conversation_id = p_conversation_id AND status = 'delivered' AND sender_type = 'contact';

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: close conversation
DROP FUNCTION IF EXISTS public.rpc_close_conversation(uuid);
CREATE OR REPLACE FUNCTION public.rpc_close_conversation(
    p_conversation_id UUID
)
RETURNS JSON AS $$
BEGIN
    UPDATE public.conversations 
    SET status = 'closed'
    WHERE id = p_conversation_id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Mock Internal Notes & Statuses
-- Update the existing mock messages from Acme Corp to have correct states
DO $$ 
DECLARE
    conv1 UUID;
    agent_id UUID;
BEGIN
    SELECT id INTO conv1 FROM public.conversations WHERE company_id = 'c1111111-1111-1111-1111-111111111111' ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO agent_id FROM public.user_profiles WHERE full_name = 'John Doe' LIMIT 1;

    IF conv1 IS NOT NULL THEN
       -- Update the mock contact message status to 'read' if it's old
       UPDATE public.messages SET status = 'read' WHERE conversation_id = conv1 AND sender_type = 'contact';
       
       -- Update the mock agent message status to 'read' as well
       UPDATE public.messages SET status = 'read' WHERE conversation_id = conv1 AND sender_type = 'agent';

       -- Add a new internal note
       INSERT INTO public.messages (conversation_id, sender_type, sender_id, body, status, is_internal, created_at)
       VALUES (conv1, 'agent', agent_id, 'Cliente precisa da documentação técnica da API.', 'sent', true, now() - interval '30 minutes');
       
       -- Setup a new unread contact message to simulate action needed
       INSERT INTO public.messages (conversation_id, sender_type, body, status, is_internal, created_at)
       VALUES (conv1, 'contact', 'Olá, já conseguiram ver?', 'received', false, now());
       
       -- Re-update the unread count
       UPDATE public.conversations SET unread_count = 1, priority = 'high' WHERE id = conv1;
    END IF;
END $$;
