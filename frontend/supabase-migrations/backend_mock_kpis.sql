-- Insert mock KPI data for Acme Corp (c1111111-1111-1111-1111-111111111111)

-- Contacts
INSERT INTO public.contacts (id, company_id, name, status) VALUES 
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Alice', 'lead'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Bob', 'lead'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Charlie', 'active'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Dave', 'active')
ON CONFLICT DO NOTHING;

-- Conversations
INSERT INTO public.conversations (id, company_id, status) VALUES 
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'open'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'open'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'closed')
ON CONFLICT DO NOTHING;

-- Deals
INSERT INTO public.deals (id, company_id, name, amount, status) VALUES 
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Deal 1', 15000, 'won'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Deal 2', 32000, 'won'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Deal 3', 5000, 'open')
ON CONFLICT DO NOTHING;

-- Tasks (some overdue, some future)
INSERT INTO public.tasks (id, company_id, title, due_at, status) VALUES 
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Call prospect', now() - interval '2 days', 'PENDING'),
(uuid_generate_v4(), 'c1111111-1111-1111-1111-111111111111', 'Send proposal', now() + interval '2 days', 'PENDING')
ON CONFLICT DO NOTHING;

