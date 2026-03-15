-- ============================================================
-- MIGRATION: Pipeline Comercial
-- Referência do schema real (já aplicado via Supabase Studio).
-- Execute este arquivo apenas em um banco do zero.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABELA: pipelines
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipelines (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL DEFAULT 'Pipeline Principal',
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    is_default  BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipelines_select" ON public.pipelines;
CREATE POLICY "pipelines_select" ON public.pipelines FOR SELECT USING (
    is_platform_admin() OR is_company_member(company_id)
);

DROP POLICY IF EXISTS "pipelines_insert" ON public.pipelines;
CREATE POLICY "pipelines_insert" ON public.pipelines FOR INSERT WITH CHECK (
    is_platform_admin() OR has_any_company_role(company_id, ARRAY['company_admin','manager'])
);

DROP POLICY IF EXISTS "pipelines_update" ON public.pipelines;
CREATE POLICY "pipelines_update" ON public.pipelines FOR UPDATE USING (
    is_platform_admin() OR has_any_company_role(company_id, ARRAY['company_admin','manager'])
);

DROP POLICY IF EXISTS "pipelines_delete" ON public.pipelines;
CREATE POLICY "pipelines_delete" ON public.pipelines FOR DELETE USING (
    is_platform_admin() OR has_any_company_role(company_id, ARRAY['company_admin','manager'])
);

-- ────────────────────────────────────────────────────────────
-- 2. TABELA: pipeline_stages
-- (NÃO tem company_id — acesso é via join com pipelines)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id     UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    position        INT         NOT NULL DEFAULT 0,
    win_probability NUMERIC     NOT NULL DEFAULT 0,
    color           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_stages_select" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_select" ON public.pipeline_stages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.pipelines p
        WHERE p.id = pipeline_stages.pipeline_id
          AND (is_platform_admin() OR is_company_member(p.company_id))
    )
);

DROP POLICY IF EXISTS "pipeline_stages_insert" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_insert" ON public.pipeline_stages FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.pipelines p
        WHERE p.id = pipeline_stages.pipeline_id
          AND (is_platform_admin() OR has_any_company_role(p.company_id, ARRAY['company_admin','manager']))
    )
);

DROP POLICY IF EXISTS "pipeline_stages_update" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_update" ON public.pipeline_stages FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.pipelines p
        WHERE p.id = pipeline_stages.pipeline_id
          AND (is_platform_admin() OR has_any_company_role(p.company_id, ARRAY['company_admin','manager']))
    )
);

DROP POLICY IF EXISTS "pipeline_stages_delete" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_delete" ON public.pipeline_stages FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.pipelines p
        WHERE p.id = pipeline_stages.pipeline_id
          AND (is_platform_admin() OR has_any_company_role(p.company_id, ARRAY['company_admin','manager']))
    )
);

-- ────────────────────────────────────────────────────────────
-- 3. EXPAND: tabela deals — adicionar colunas faltando
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS pipeline_id          UUID        NOT NULL REFERENCES public.pipelines(id),
    ADD COLUMN IF NOT EXISTS stage_id             UUID        NOT NULL REFERENCES public.pipeline_stages(id),
    ADD COLUMN IF NOT EXISTS title                TEXT        NOT NULL,
    ADD COLUMN IF NOT EXISTS owner_user_id        UUID        REFERENCES public.user_profiles(id),
    ADD COLUMN IF NOT EXISTS conversation_id      UUID        REFERENCES public.conversations(id),
    ADD COLUMN IF NOT EXISTS currency             TEXT        NOT NULL DEFAULT 'BRL',
    ADD COLUMN IF NOT EXISTS expected_close_date  DATE,
    ADD COLUMN IF NOT EXISTS loss_reason          TEXT,
    ADD COLUMN IF NOT EXISTS closed_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS metadata             JSONB       NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────
-- 4. RPC: rpc_update_deal_stage
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_deal_stage(
    p_deal_id     UUID,
    p_new_stage_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id     UUID;
    v_deal_pipeline  UUID;
    v_stage_pipeline UUID;
BEGIN
    SELECT company_id, pipeline_id
      INTO v_company_id, v_deal_pipeline
      FROM public.deals
     WHERE id = p_deal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Negócio não encontrado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.user_companies uc
        WHERE uc.company_id = v_company_id AND uc.user_id = auth.uid()
    ) AND NOT is_platform_admin() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT pipeline_id
      INTO v_stage_pipeline
      FROM public.pipeline_stages
     WHERE id = p_new_stage_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Estágio não encontrado.';
    END IF;

    IF v_stage_pipeline IS DISTINCT FROM v_deal_pipeline THEN
        RAISE EXCEPTION 'Estágio não pertence ao pipeline deste negócio.';
    END IF;

    UPDATE public.deals
       SET stage_id   = p_new_stage_id,
           updated_at = now()
     WHERE id = p_deal_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. SEED: Pipelines e estágios para as 3 empresas mock
-- ────────────────────────────────────────────────────────────

-- Acme Corp
INSERT INTO public.pipelines (id, company_id, name, is_active, is_default) VALUES
    ('a1c00001-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', 'Pipeline Comercial', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position, color, win_probability) VALUES
    ('b1c00001-0000-0000-0000-000000000001', 'a1c00001-0000-0000-0000-000000000001', 'Prospecção',   1, '#6B7280', 10),
    ('b1c00001-0000-0000-0000-000000000002', 'a1c00001-0000-0000-0000-000000000001', 'Qualificação', 2, '#3B82F6', 25),
    ('b1c00001-0000-0000-0000-000000000003', 'a1c00001-0000-0000-0000-000000000001', 'Proposta',     3, '#F59E0B', 50),
    ('b1c00001-0000-0000-0000-000000000004', 'a1c00001-0000-0000-0000-000000000001', 'Negociação',   4, '#8B5CF6', 75),
    ('b1c00001-0000-0000-0000-000000000005', 'a1c00001-0000-0000-0000-000000000001', 'Fechamento',   5, '#10B981', 90)
ON CONFLICT (id) DO NOTHING;

-- TechSolutions BR
INSERT INTO public.pipelines (id, company_id, name, is_active, is_default) VALUES
    ('a2c00002-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222', 'Pipeline Comercial', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position, color, win_probability) VALUES
    ('b2c00002-0000-0000-0000-000000000001', 'a2c00002-0000-0000-0000-000000000001', 'Prospecção',   1, '#6B7280', 10),
    ('b2c00002-0000-0000-0000-000000000002', 'a2c00002-0000-0000-0000-000000000001', 'Qualificação', 2, '#3B82F6', 30),
    ('b2c00002-0000-0000-0000-000000000003', 'a2c00002-0000-0000-0000-000000000001', 'Proposta',     3, '#F59E0B', 60),
    ('b2c00002-0000-0000-0000-000000000004', 'a2c00002-0000-0000-0000-000000000001', 'Fechamento',   4, '#10B981', 90)
ON CONFLICT (id) DO NOTHING;
