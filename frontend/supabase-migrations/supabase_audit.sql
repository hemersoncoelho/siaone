-- Add Audit Logs Table for Support Mode Actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES public.user_profiles(id) NOT NULL, -- The true platform_admin 
    impersonated_user_id UUID REFERENCES public.user_profiles(id), -- The simulated user (optional)
    company_id UUID REFERENCES public.companies(id) NOT NULL, -- The context they entered
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS: Platform admins can view and insert into audit logs. Others can do nothing.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform Admins can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles up 
            WHERE up.id = auth.uid() AND up.system_role = 'platform_admin'
        ) 
        AND actor_id = auth.uid()
    );

CREATE POLICY "Platform Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles up 
            WHERE up.id = auth.uid() AND up.system_role = 'platform_admin'
        )
    );
