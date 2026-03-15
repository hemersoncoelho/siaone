-- Fix Script for Phase 13 and Dashboard

-- 1. Create missing contact_identities table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.contact_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- e.g. 'whatsapp', 'email'
    identifier TEXT NOT NULL, -- e.g. '+5511999999999', 'test@email.com'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(contact_id, provider, identifier)
);

ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contact Identities isolation" ON public.contact_identities FOR ALL USING (
  EXISTS (
      SELECT 1 FROM public.contacts c 
      JOIN public.user_companies uc ON uc.company_id = c.company_id 
      WHERE c.id = contact_identities.contact_id AND uc.user_id = auth.uid()
  ) OR public.is_platform_admin()
);

-- 2. RE-run the RPC Create Contact and Conversation to ensure it's up to date
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
        0, 
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

-- 3. Fix the Dashboard View
-- Using text cast to avoid enum case sensitivity issues, and correct column name (due_at)

DROP VIEW IF EXISTS public.v_company_kpis;

CREATE OR REPLACE VIEW public.v_company_kpis AS
SELECT 
    c.id AS company_id,
    COUNT(DISTINCT ctc.id) AS total_contacts,
    COUNT(DISTINCT CASE WHEN ctc.status = 'lead' THEN ctc.id END) AS total_leads,
    COUNT(DISTINCT CASE WHEN cnv.status = 'open' THEN cnv.id END) AS open_conversations,
    COALESCE(SUM(CASE WHEN d.status = 'won' THEN d.amount ELSE 0 END), 0) AS won_amount,
    COUNT(DISTINCT CASE WHEN t.status::text = 'pending' AND t.due_at < now() THEN t.id END) AS overdue_tasks
FROM 
    public.companies c
LEFT JOIN public.contacts ctc ON c.id = ctc.company_id
LEFT JOIN public.conversations cnv ON c.id = cnv.company_id
LEFT JOIN public.deals d ON c.id = d.company_id
LEFT JOIN public.tasks t ON c.id = t.company_id
GROUP BY 
    c.id;
