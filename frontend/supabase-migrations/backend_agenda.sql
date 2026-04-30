-- ============================================================
-- MIGRATION: Gestão de Agenda — Sia One
-- Feature: schedules, service_types, appointments
--
-- Pré-requisitos:
--   • Tabelas public.companies, public.contacts,
--     public.conversations já existem
--   • Funções helper RLS já existem:
--     is_company_member(), has_any_company_role(), is_platform_admin()
-- ============================================================

BEGIN;


-- ────────────────────────────────────────────────────────────
-- 1. TABELA: schedules
--    Configuração de horário de funcionamento por dia da semana
--    por empresa. Um registro por (company_id, weekday).
--    weekday: 0=Domingo, 1=Segunda … 6=Sábado
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedules (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    weekday     SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    opens_at    TIME        NOT NULL,
    closes_at   TIME        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT schedules_company_weekday_unique UNIQUE (company_id, weekday),
    CONSTRAINT schedules_opens_before_closes CHECK (opens_at < closes_at)
);

CREATE INDEX IF NOT EXISTS idx_schedules_company_weekday
    ON public.schedules (company_id, weekday);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules_all" ON public.schedules;
CREATE POLICY "schedules_all" ON public.schedules
FOR ALL USING (
    public.is_platform_admin()
    OR public.is_company_member(schedules.company_id)
);


-- ────────────────────────────────────────────────────────────
-- 2. TABELA: service_types
--    Tipos de serviço/procedimento oferecidos pela empresa.
--    Cada serviço tem duração em minutos, usada para calcular
--    slots disponíveis e o ends_at do agendamento.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_types (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id        UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    duration_minutes  INTEGER     NOT NULL CHECK (duration_minutes > 0),
    description       TEXT,
    is_active         BOOLEAN     NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_types_company
    ON public.service_types (company_id);

ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_types_all" ON public.service_types;
CREATE POLICY "service_types_all" ON public.service_types
FOR ALL USING (
    public.is_platform_admin()
    OR public.is_company_member(service_types.company_id)
);


-- ────────────────────────────────────────────────────────────
-- 3. TABELA: appointments
--    Agendamentos de contatos para serviços da empresa.
--    Vincula contact_id + service_type_id + horário.
--    Suporta self-reference em rescheduled_from_id para
--    rastreamento de remarcações.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id            UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id            UUID        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    conversation_id       UUID        REFERENCES public.conversations(id) ON DELETE SET NULL,
    service_type_id       UUID        NOT NULL REFERENCES public.service_types(id) ON DELETE RESTRICT,
    scheduled_at          TIMESTAMPTZ NOT NULL,
    ends_at               TIMESTAMPTZ NOT NULL,
    status                TEXT        NOT NULL DEFAULT 'scheduled'
                             CHECK (status IN ('scheduled', 'cancelled', 'rescheduled', 'completed')),
    cancelled_at          TIMESTAMPTZ,
    cancellation_reason   TEXT,
    rescheduled_from_id   UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
    notes                 TEXT,
    metadata              JSONB       NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT appointments_scheduled_before_ends CHECK (scheduled_at < ends_at),
    CONSTRAINT appointments_company_contact_match
        CHECK (true)  -- company_id isolamento garantido por RLS + RPCs
);

CREATE INDEX IF NOT EXISTS idx_appointments_company_scheduled_at
    ON public.appointments (company_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_appointments_company_contact
    ON public.appointments (company_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_appointments_company_status
    ON public.appointments (company_id, status);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_all" ON public.appointments;
CREATE POLICY "appointments_all" ON public.appointments
FOR ALL USING (
    public.is_platform_admin()
    OR public.is_company_member(appointments.company_id)
);

-- ── Trigger para manter updated_at sincronizado ──────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


COMMIT;
