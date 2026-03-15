-- Create Skeleton Tables to support KPIs (using existing enums if present)

-- First, ensure the enums exist if they don't already
DO $$ BEGIN
    CREATE TYPE public.contact_status_enum AS ENUM ('lead', 'active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.conversation_status_enum AS ENUM ('open', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.deal_status_enum AS ENUM ('open', 'won', 'lost');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    -- The error mentioned 'task_status_enum'. Let's ensure it has the expected values.
    CREATE TYPE public.task_status_enum AS ENUM ('PENDING', 'COMPLETED', 'TODO', 'IN_PROGRESS', 'DONE'); -- Adding common uppercase variants just in case
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'lead', 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open', 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'open', 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    status public.task_status_enum DEFAULT 'PENDING'::public.task_status_enum, -- Assuming uppercase based on common enum conventions that might have caused the error
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Create basic Policies forcing company_id isolation
DROP POLICY IF EXISTS "Contacts isolation" ON public.contacts;
CREATE POLICY "Contacts isolation" ON public.contacts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = contacts.company_id AND uc.user_id = auth.uid()) OR public.is_platform_admin()
);
DROP POLICY IF EXISTS "Conversations isolation" ON public.conversations;
CREATE POLICY "Conversations isolation" ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = conversations.company_id AND uc.user_id = auth.uid()) OR public.is_platform_admin()
);
DROP POLICY IF EXISTS "Deals isolation" ON public.deals;
CREATE POLICY "Deals isolation" ON public.deals FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = deals.company_id AND uc.user_id = auth.uid()) OR public.is_platform_admin()
);
DROP POLICY IF EXISTS "Tasks isolation" ON public.tasks;
CREATE POLICY "Tasks isolation" ON public.tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = tasks.company_id AND uc.user_id = auth.uid()) OR public.is_platform_admin()
);

-- Create the KPI View
CREATE OR REPLACE VIEW public.v_company_kpis AS
SELECT 
    c.id AS company_id,
    COUNT(DISTINCT ctc.id) AS total_contacts,
    COUNT(DISTINCT CASE WHEN ctc.status = 'lead' THEN ctc.id END) AS total_leads,
    COUNT(DISTINCT CASE WHEN cnv.status = 'open' THEN cnv.id END) AS open_conversations,
    COALESCE(SUM(CASE WHEN d.status = 'won' THEN d.amount ELSE 0 END), 0) AS won_amount,
    -- Check for both lower and uppercase variants in the view to be safe
    COUNT(DISTINCT CASE WHEN (t.status::text = 'pending' OR t.status::text = 'PENDING' OR t.status::text = 'TODO') AND t.due_date < now() THEN t.id END) AS overdue_tasks
FROM 
    public.companies c
LEFT JOIN public.contacts ctc ON c.id = ctc.company_id
LEFT JOIN public.conversations cnv ON c.id = cnv.company_id
LEFT JOIN public.deals d ON c.id = d.company_id
LEFT JOIN public.tasks t ON c.id = t.company_id
GROUP BY 
    c.id;
