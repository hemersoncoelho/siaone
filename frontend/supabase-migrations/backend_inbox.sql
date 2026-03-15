-- 1. Create priority enum safely
DO $$ BEGIN
    CREATE TYPE public.conversation_priority_enum AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Enhance Conversations table
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS priority public.conversation_priority_enum DEFAULT 'normal';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- 3. Create Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'agent', 'system', 'bot')),
    sender_id UUID, -- References user_profile if agent, or contact if contact
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages isolation" ON public.messages FOR ALL USING (
  EXISTS (
      SELECT 1 FROM public.conversations c 
      JOIN public.user_companies uc ON c.company_id = uc.company_id 
      WHERE c.id = messages.conversation_id AND uc.user_id = auth.uid()
  ) OR public.is_platform_admin()
);

-- 4. Create the Inbox View
DROP VIEW IF EXISTS public.v_inbox_conversations CASCADE;

CREATE OR REPLACE VIEW public.v_inbox_conversations AS
SELECT 
    cnv.id AS conversation_id,
    cnv.company_id,
    cnv.status,
    cnv.priority::text,
    cnv.unread_count,
    ctc.id AS contact_id,
    ctc.full_name AS contact_name,
    up.id AS assigned_to_id,
    up.full_name AS assigned_to_name,
    (
        SELECT COUNT(d.id) 
        FROM public.deals d 
        WHERE d.contact_id = ctc.id AND d.status = 'open'
    ) AS open_deals_count,
    m.body AS last_message_preview,
    m.created_at AS last_message_at
FROM 
    public.conversations cnv
JOIN 
    public.contacts ctc ON cnv.contact_id = ctc.id
LEFT JOIN 
    public.user_profiles up ON cnv.assigned_to = up.id
LEFT JOIN 
    -- Get the most recent message per conversation
    (
        SELECT conversation_id, body, created_at,
               ROW_NUMBER() OVER(PARTITION BY conversation_id ORDER BY created_at DESC) as rn
        FROM public.messages
    ) m ON m.conversation_id = cnv.id AND m.rn = 1;

-- 5. Mock Data Updates for existing records (Assume run after the dashboard mock)
-- Assign the Acme Corp conversations to John Doe (if available, otherwise fallback) and add priorities
DO $$ 
DECLARE
    john_id UUID;
    conv1 UUID;
    conv2 UUID;
    conv3 UUID;
BEGIN
    -- Try to find John Doe
    SELECT id INTO john_id FROM public.user_profiles WHERE full_name = 'John Doe' LIMIT 1;
    
    -- Get the 3 conversations we created in the dashboard step for Acme Corp
    SELECT id INTO conv1 FROM public.conversations WHERE company_id = 'c1111111-1111-1111-1111-111111111111' ORDER BY created_at ASC LIMIT 1 OFFSET 0;
    SELECT id INTO conv2 FROM public.conversations WHERE company_id = 'c1111111-1111-1111-1111-111111111111' ORDER BY created_at ASC LIMIT 1 OFFSET 1;
    SELECT id INTO conv3 FROM public.conversations WHERE company_id = 'c1111111-1111-1111-1111-111111111111' ORDER BY created_at ASC LIMIT 1 OFFSET 2;
    
    -- Update Conversations
    IF conv1 IS NOT NULL THEN
        UPDATE public.conversations SET priority = 'high', assigned_to = john_id, unread_count = 2 WHERE id = conv1;
        INSERT INTO public.messages (conversation_id, sender_type, body, created_at) VALUES 
            (conv1, 'contact', 'Olá, gostaria de saber mais sobre a integração com o ERP X.', now() - interval '2 hours'),
            (conv1, 'agent', 'Claro! Nós temos suporte nativo. Posso te enviar o material?', now() - interval '1 hour'),
            (conv1, 'contact', 'Sim, por favor! Em quanto tempo conseguimos plugar?', now() - interval '10 minutes');
    END IF;

    IF conv2 IS NOT NULL THEN
        UPDATE public.conversations SET priority = 'normal', assigned_to = john_id, unread_count = 0 WHERE id = conv2;
        INSERT INTO public.messages (conversation_id, sender_type, body, created_at) VALUES 
            (conv2, 'agent', 'Obrigado por assinar, o seu onboarding começa amanhã.', now() - interval '1 day');
    END IF;

    IF conv3 IS NOT NULL THEN
        UPDATE public.conversations SET priority = 'urgent', assigned_to = NULL, unread_count = 1 WHERE id = conv3;
        INSERT INTO public.messages (conversation_id, sender_type, body, created_at) VALUES 
            (conv3, 'contact', 'Estou com problema no acesso, sistema fora do ar!', now() - interval '5 minutes');
    END IF;
END $$;
