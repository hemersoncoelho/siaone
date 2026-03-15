-- Create Skeleton Tables to support KPIs
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'lead', -- e.g., 'lead', 'active', 'inactive'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open', -- 'open', 'closed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'open', -- 'open', 'won', 'lost'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Create basic Policies forcing company_id isolation
CREATE POLICY "Contacts isolation" ON public.contacts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = contacts.company_id AND uc.user_id = auth.uid()) OR public.is_platform_admin()
);
CREATE POLICY "Conversations isolation" ON public.conversations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = conversations.company_id AND uc.user_id = auth.uid()) OR public.is_platform_admin()
);
CREATE POLICY "Deals isolation" ON public.deals FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = deals.company_id AND uc.user_id = auth.uid()) OR public.is_platform_admin()
);
CREATE POLICY "Tasks isolation" ON public.tasks FOR ALL USING (
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
    COUNT(DISTINCT CASE WHEN t.status = 'pending' AND t.due_date < now() THEN t.id END) AS overdue_tasks
FROM 
    public.companies c
LEFT JOIN public.contacts ctc ON c.id = ctc.company_id
LEFT JOIN public.conversations cnv ON c.id = cnv.company_id
LEFT JOIN public.deals d ON c.id = d.company_id
LEFT JOIN public.tasks t ON c.id = t.company_id
GROUP BY 
    c.id;

