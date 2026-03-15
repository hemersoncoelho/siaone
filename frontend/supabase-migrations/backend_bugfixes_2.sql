-- Let's force the enum value or cast as text first to bypass the PENDING vs pending conflict
-- Since we are getting ERROR: 22P02: invalid input value for enum task_status_enum: "PENDING"
-- It means the enum was actually created as 'pending'.

DROP VIEW IF EXISTS public.v_company_kpis;

CREATE OR REPLACE VIEW public.v_company_kpis AS
SELECT 
    c.id AS company_id,
    COUNT(DISTINCT ctc.id) AS total_contacts,
    COUNT(DISTINCT CASE WHEN ctc.status = 'lead' THEN ctc.id END) AS total_leads,
    COUNT(DISTINCT CASE WHEN cnv.status = 'open' THEN cnv.id END) AS open_conversations,
    COALESCE(SUM(CASE WHEN d.status = 'won' THEN d.amount ELSE 0 END), 0) AS won_amount,
    -- FIX: Reverting to 'pending' as it seems the DB already had it registered in lowercase from an earlier run.
    COUNT(DISTINCT CASE WHEN t.status::text = 'pending' AND t.due_at < now() THEN t.id END) AS overdue_tasks
FROM 
    public.companies c
LEFT JOIN public.contacts ctc ON c.id = ctc.company_id
LEFT JOIN public.conversations cnv ON c.id = cnv.company_id
LEFT JOIN public.deals d ON c.id = d.company_id
LEFT JOIN public.tasks t ON c.id = t.company_id
GROUP BY 
    c.id;
