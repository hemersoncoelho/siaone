-- ============================================================
-- CONSOLIDATED FIX: Ensure all schema dependencies for 
-- rpc_create_contact_and_conversation exist
-- Run this ONCE in the Supabase SQL Editor
-- ============================================================

-- 1. Fix contacts table: rename 'name' to 'full_name' if needed
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'full_name'
    ) THEN
        ALTER TABLE public.contacts RENAME COLUMN name TO full_name;
        RAISE NOTICE 'Renamed contacts.name -> contacts.full_name';
    END IF;
END $$;

-- 2. Ensure 'channel' column exists on conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';

-- 3. Ensure message_status_enum exists
DO $$ BEGIN
    CREATE TYPE public.message_status_enum AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'received');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4. Ensure messages table has status and is_internal columns
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status public.message_status_enum DEFAULT 'received';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- 5. Create contact_identities table if missing
CREATE TABLE IF NOT EXISTS public.contact_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    identifier TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(contact_id, provider, identifier)
);

ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;

-- Safe policy creation (drop if exists first)
DROP POLICY IF EXISTS "Contact Identities isolation" ON public.contact_identities;
CREATE POLICY "Contact Identities isolation" ON public.contact_identities FOR ALL USING (
  EXISTS (
      SELECT 1 FROM public.contacts c 
      JOIN public.user_companies uc ON uc.company_id = c.company_id 
      WHERE c.id = contact_identities.contact_id AND uc.user_id = auth.uid()
  ) OR public.is_platform_admin()
);

-- 6. Create/Replace the RPC
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
BEGIN
    -- Step 1: Check if the contact identity exists for this company
    SELECT ci.contact_id INTO v_contact_id
    FROM public.contact_identities ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.identifier = p_identity AND c.company_id = p_company_id
    LIMIT 1;

    -- Step 2: If contact doesn't exist, create it
    IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts (company_id, full_name, created_at)
        VALUES (p_company_id, p_contact_name, now())
        RETURNING id INTO v_contact_id;

        INSERT INTO public.contact_identities (contact_id, provider, identifier)
        VALUES (v_contact_id, p_channel, p_identity);
    END IF;

    -- Step 3: Create the Conversation
    INSERT INTO public.conversations (
        company_id, contact_id, channel, assigned_to, status, priority, unread_count, created_at
    ) VALUES (
        p_company_id, v_contact_id, p_channel, p_agent_id, 'open', 'normal', 0, now()
    ) RETURNING id INTO v_conversation_id;

    -- Step 4: Insert the initial outbound message
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
