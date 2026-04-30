-- ============================================================
-- Admin Dashboard: Planos de Assinatura + Subscriptions por Tenant
-- ============================================================

-- ── 1. Tabela subscription_plans (catálogo de planos) ─────────────────

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    price_monthly   numeric(10,2) NOT NULL DEFAULT 0,
    description     text,
    is_active       boolean DEFAULT true,
    created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read plans" ON public.subscription_plans;
CREATE POLICY "Authenticated users can read plans" ON public.subscription_plans
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Platform admin manages plans" ON public.subscription_plans;
CREATE POLICY "Platform admin manages plans" ON public.subscription_plans
    FOR ALL USING (public.is_platform_admin());


-- ── 2. Tabela company_subscriptions (plano ativo por tenant) ──────────

CREATE TABLE IF NOT EXISTS public.company_subscriptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    plan_id         uuid NOT NULL REFERENCES public.subscription_plans(id),
    status          text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('trial', 'active', 'churned', 'suspended')),
    trial_ends_at   timestamptz,
    churned_at      timestamptz,
    churn_reason    text,
    subscribed_at   timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_status
    ON public.company_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_id
    ON public.company_subscriptions(company_id);

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admin manages subscriptions" ON public.company_subscriptions;
CREATE POLICY "Platform admin manages subscriptions" ON public.company_subscriptions
    FOR ALL USING (public.is_platform_admin());

-- Trigger updated_at (reutiliza a função set_updated_at se já existir)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_subscriptions_updated_at
    ON public.company_subscriptions;
CREATE TRIGGER trg_company_subscriptions_updated_at
    BEFORE UPDATE ON public.company_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. rpc_get_admin_kpi_global ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_get_admin_kpi_global()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_companies          int;
    v_active_companies         int;
    v_trial_companies          int;
    v_churned_companies        int;
    v_churn_rate_pct           numeric;
    v_mrr                      numeric;
    v_avg_ticket               numeric;
    v_open_deals_count         int;
    v_open_deals_value         numeric;
    v_closed_won_count         int;
    v_closed_won_value         numeric;
    v_ai_managed_conversations int;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RETURN json_build_object('error', 'Acesso negado. Apenas Platform Admin.');
    END IF;

    SELECT COUNT(*) INTO v_total_companies
    FROM public.companies;

    SELECT
        COALESCE(COUNT(*) FILTER (WHERE cs.status = 'active'), 0),
        COALESCE(COUNT(*) FILTER (WHERE cs.status = 'trial'), 0),
        COALESCE(COUNT(*) FILTER (WHERE cs.status = 'churned'), 0)
    INTO v_active_companies, v_trial_companies, v_churned_companies
    FROM public.company_subscriptions cs;

    v_churn_rate_pct := CASE
        WHEN v_total_companies > 0
        THEN ROUND((v_churned_companies::numeric / v_total_companies::numeric) * 100, 1)
        ELSE 0
    END;

    SELECT COALESCE(SUM(sp.price_monthly), 0)
    INTO v_mrr
    FROM public.company_subscriptions cs
    JOIN public.subscription_plans sp ON sp.id = cs.plan_id
    WHERE cs.status = 'active';

    v_avg_ticket := CASE
        WHEN v_active_companies > 0 THEN ROUND(v_mrr / v_active_companies, 2)
        ELSE 0
    END;

    SELECT
        COALESCE(COUNT(*) FILTER (WHERE d.status = 'open'), 0),
        COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'open'), 0),
        COALESCE(COUNT(*) FILTER (WHERE d.status = 'won'), 0),
        COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'won'), 0)
    INTO v_open_deals_count, v_open_deals_value, v_closed_won_count, v_closed_won_value
    FROM public.deals d;

    SELECT COALESCE(COUNT(*), 0)
    INTO v_ai_managed_conversations
    FROM public.conversations
    WHERE attendance_mode::text = 'ai';

    RETURN json_build_object(
        'total_companies',           v_total_companies,
        'active_companies',          v_active_companies,
        'trial_companies',           v_trial_companies,
        'churned_companies',         v_churned_companies,
        'churn_rate_pct',            v_churn_rate_pct,
        'mrr',                       v_mrr,
        'avg_ticket',                v_avg_ticket,
        'open_deals_count',          v_open_deals_count,
        'open_deals_value',          v_open_deals_value,
        'closed_won_count',          v_closed_won_count,
        'closed_won_value',          v_closed_won_value,
        'ai_managed_conversations',  v_ai_managed_conversations
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_admin_kpi_global() TO authenticated;


-- ── 4. rpc_get_admin_tenants_table ────────────────────────────────────
-- Usa CTEs separados para agregar deals e conversations antes do JOIN,
-- evitando multiplicação de linhas (produto cartesiano) quando uma empresa
-- tem N deals e M conversas (N×M sem CTE, N+M com CTE).

CREATE OR REPLACE FUNCTION public.rpc_get_admin_tenants_table()
RETURNS TABLE (
    company_id               uuid,
    company_name             text,
    status                   text,
    plan_name                text,
    price_monthly            numeric,
    subscribed_at            timestamptz,
    churned_at               timestamptz,
    open_deals_count         bigint,
    open_deals_value         numeric,
    closed_won_value         numeric,
    ai_managed_conversations bigint,
    total_conversations      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas Platform Admin.';
    END IF;

    RETURN QUERY
    WITH deal_stats AS (
        SELECT
            d.company_id,
            COUNT(*) FILTER (WHERE d.status::text = 'open')         AS open_deals_count,
            COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'open'), 0) AS open_deals_value,
            COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'won'),  0) AS closed_won_value
        FROM public.deals d
        GROUP BY d.company_id
    ),
    conv_stats AS (
        SELECT
            conv.company_id,
            COUNT(*) FILTER (WHERE conv.attendance_mode::text = 'ai') AS ai_managed_conversations,
            COUNT(*)                                                    AS total_conversations
        FROM public.conversations conv
        GROUP BY conv.company_id
    )
    SELECT
        c.id                                      AS company_id,
        c.name                                    AS company_name,
        COALESCE(cs.status, 'none')               AS status,
        COALESCE(sp.name, 'Sem plano')            AS plan_name,
        COALESCE(sp.price_monthly, 0::numeric)    AS price_monthly,
        cs.subscribed_at,
        cs.churned_at,
        COALESCE(ds.open_deals_count,         0)  AS open_deals_count,
        COALESCE(ds.open_deals_value,         0)  AS open_deals_value,
        COALESCE(ds.closed_won_value,         0)  AS closed_won_value,
        COALESCE(cvs.ai_managed_conversations, 0) AS ai_managed_conversations,
        COALESCE(cvs.total_conversations,      0) AS total_conversations
    FROM public.companies c
    LEFT JOIN public.company_subscriptions cs  ON cs.company_id  = c.id
    LEFT JOIN public.subscription_plans    sp  ON sp.id          = cs.plan_id
    LEFT JOIN deal_stats                   ds  ON ds.company_id  = c.id
    LEFT JOIN conv_stats                   cvs ON cvs.company_id = c.id
    ORDER BY c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_admin_tenants_table() TO authenticated;
