-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Enums for Roles (Safe creation)
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('platform_admin', 'company_admin', 'manager', 'agent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Companies (Tenants) Table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL
);

-- Ensure the is_active column exists if the table was created previously without it
DO $$ 
BEGIN
    ALTER TABLE public.companies ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 3. Create User Profiles Table (Extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    system_role public.app_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create User <-> Company Memberships (The multi-tenant link)
CREATE TABLE IF NOT EXISTS public.user_companies (
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    role_in_company public.app_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, company_id)
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- Companies: 
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
CREATE POLICY "Users can view their own companies" ON public.companies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            WHERE uc.company_id = companies.id 
            AND uc.user_id = auth.uid()
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.user_profiles up 
            WHERE up.id = auth.uid() AND up.system_role = 'platform_admin'
        )
    );

-- user_profiles:
DROP POLICY IF EXISTS "Users can view profiles in their companies" ON public.user_profiles;
CREATE POLICY "Users can view profiles in their companies" ON public.user_profiles
    FOR SELECT USING (
        id = auth.uid()
        OR 
        EXISTS (
            SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.system_role = 'platform_admin'
        )
        OR
        EXISTS (
            -- I share a company with this user
            SELECT 1 FROM public.user_companies my_uc
            JOIN public.user_companies their_uc ON my_uc.company_id = their_uc.company_id
            WHERE my_uc.user_id = auth.uid() AND their_uc.user_id = user_profiles.id
        )
    );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (id = auth.uid());

-- user_companies:
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_companies;
CREATE POLICY "Users can view their own memberships" ON public.user_companies
    FOR SELECT USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.system_role = 'platform_admin'
        )
        OR
        EXISTS (
             SELECT 1 FROM public.user_companies admin_uc 
             WHERE admin_uc.user_id = auth.uid() 
             AND admin_uc.company_id = user_companies.company_id 
             AND admin_uc.role_in_company = 'company_admin'
        )
    );

-- ==========================================
-- TRIGGERS & FUNCTIONS
-- ==========================================

-- Function to automatically create a user_profile when a new auth.user is created
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, system_role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', 'Novo Usuário'), 'agent');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for the function above
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- MOCK DATA SCRIPT (RUN ONLY ONCE / DESENVOLVIMENTO)
-- ==========================================
-- Do NOT run this if you want an empty DB. This inserts the mock tenants we used in the UI.

INSERT INTO public.companies (id, name, is_active) VALUES 
  ('c1111111-1111-1111-1111-111111111111', 'Acme Corp', true),
  ('c2222222-2222-2222-2222-222222222222', 'Globex Inc', true),
  ('c3333333-3333-3333-3333-333333333333', 'Initech', true)
ON CONFLICT DO NOTHING;
