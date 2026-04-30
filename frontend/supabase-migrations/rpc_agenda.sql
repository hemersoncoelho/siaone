-- ============================================================
-- MIGRATION: RPCs de Gestão de Agenda — Sia One
--
-- Funções:
--   1. rpc_get_available_slots   — consulta slots livres
--   2. rpc_create_appointment    — cria agendamento
--   3. rpc_cancel_appointment    — cancela agendamento
--   4. rpc_reschedule_appointment — remarca agendamento
--
-- Todas usam SECURITY DEFINER e validam company_id.
-- Retornam JSON com { success: bool, error?: text, ... }
-- compatível com o padrão do restante do projeto.
--
-- Chamadas via service_role do n8n (sem auth.uid()).
-- ============================================================

BEGIN;


-- ────────────────────────────────────────────────────────────
-- 1. rpc_get_available_slots
--
-- Retorna lista de slots livres em uma data para um serviço.
-- Gera slots a cada duration_minutes dentro da janela de
-- funcionamento do dia, excluindo horários com conflito.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_available_slots(
    p_company_id      UUID,
    p_service_type_id UUID,
    p_date            DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_weekday          SMALLINT;
    v_opens_at         TIME;
    v_closes_at        TIME;
    v_duration_minutes INTEGER;
    v_slot_start       TIMESTAMPTZ;
    v_slot_end         TIMESTAMPTZ;
    v_tz               TEXT := 'UTC';
    v_slots            JSONB := '[]'::JSONB;
    v_cursor           TIME;
    v_schedule_exists  BOOLEAN;
BEGIN
    -- 1. Validar parâmetros mínimos
    IF p_company_id IS NULL OR p_service_type_id IS NULL OR p_date IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Parâmetros obrigatórios ausentes: company_id, service_type_id, date.'
        );
    END IF;

    -- 2. Buscar o número do dia da semana (0=domingo, 6=sábado)
    v_weekday := EXTRACT(DOW FROM p_date)::SMALLINT;

    -- 3. Buscar horário de funcionamento para o dia
    SELECT opens_at, closes_at
    INTO   v_opens_at, v_closes_at
    FROM   public.schedules
    WHERE  company_id = p_company_id
      AND  weekday    = v_weekday
      AND  is_active  = true
    LIMIT 1;

    IF NOT FOUND THEN
        -- Empresa não funciona nesse dia ou agenda inativa
        RETURN json_build_object(
            'success', true,
            'slots',   '[]'::JSONB,
            'message', 'Empresa não possui atendimento neste dia.'
        );
    END IF;

    -- 4. Buscar duração do serviço
    SELECT duration_minutes
    INTO   v_duration_minutes
    FROM   public.service_types
    WHERE  id         = p_service_type_id
      AND  company_id = p_company_id
      AND  is_active  = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Tipo de serviço não encontrado ou inativo para esta empresa.'
        );
    END IF;

    -- 5. Gerar slots e excluir os com conflito
    v_cursor := v_opens_at;

    WHILE v_cursor + (v_duration_minutes || ' minutes')::INTERVAL <= v_closes_at LOOP
        -- Montar timestamps do slot no timezone UTC (n8n enviará no tz correto)
        v_slot_start := (p_date::TEXT || ' ' || v_cursor::TEXT || ' UTC')::TIMESTAMPTZ;
        v_slot_end   := v_slot_start + (v_duration_minutes || ' minutes')::INTERVAL;

        -- Verificar se há conflito com agendamento existente (overlap)
        -- Overlap: inicio_existente < v_slot_end AND fim_existente > v_slot_start
        IF NOT EXISTS (
            SELECT 1
            FROM   public.appointments a
            WHERE  a.company_id   = p_company_id
              AND  a.status       = 'scheduled'
              AND  a.scheduled_at < v_slot_end
              AND  a.ends_at      > v_slot_start
        ) THEN
            v_slots := v_slots || jsonb_build_object(
                'slot_start', v_slot_start,
                'slot_end',   v_slot_end
            );
        END IF;

        v_cursor := v_cursor + (v_duration_minutes || ' minutes')::INTERVAL;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'date',    p_date,
        'slots',   v_slots
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. rpc_create_appointment
--
-- Cria um agendamento com validação de conflito.
-- Calcula ends_at automaticamente a partir da duração do serviço.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_appointment(
    p_company_id      UUID,
    p_contact_id      UUID,
    p_conversation_id UUID,      -- nullable
    p_service_type_id UUID,
    p_scheduled_at    TIMESTAMPTZ,
    p_notes           TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_duration_minutes INTEGER;
    v_ends_at          TIMESTAMPTZ;
    v_appointment      public.appointments%ROWTYPE;
BEGIN
    -- 1. Validar parâmetros obrigatórios
    IF p_company_id IS NULL OR p_contact_id IS NULL
       OR p_service_type_id IS NULL OR p_scheduled_at IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Parâmetros obrigatórios ausentes: company_id, contact_id, service_type_id, scheduled_at.'
        );
    END IF;

    -- 2. Não permitir agendamento no passado
    IF p_scheduled_at < now() THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Não é possível agendar em uma data/hora no passado.'
        );
    END IF;

    -- 3. Buscar duração do serviço e validar pertencimento à empresa
    SELECT duration_minutes
    INTO   v_duration_minutes
    FROM   public.service_types
    WHERE  id         = p_service_type_id
      AND  company_id = p_company_id
      AND  is_active  = true;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Tipo de serviço não encontrado ou inativo para esta empresa.'
        );
    END IF;

    -- 4. Calcular ends_at
    v_ends_at := p_scheduled_at + (v_duration_minutes || ' minutes')::INTERVAL;

    -- 5. Verificar conflito de overlap
    IF EXISTS (
        SELECT 1
        FROM   public.appointments a
        WHERE  a.company_id   = p_company_id
          AND  a.status       = 'scheduled'
          AND  a.scheduled_at < v_ends_at
          AND  a.ends_at      > p_scheduled_at
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Conflito de horário: já existe um agendamento neste intervalo. Consulte os slots disponíveis e tente outro horário.'
        );
    END IF;

    -- 6. Validar que o contato pertence à empresa
    IF NOT EXISTS (
        SELECT 1 FROM public.contacts
        WHERE id = p_contact_id AND company_id = p_company_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Contato não encontrado nesta empresa.'
        );
    END IF;

    -- 7. Inserir agendamento
    INSERT INTO public.appointments (
        company_id,
        contact_id,
        conversation_id,
        service_type_id,
        scheduled_at,
        ends_at,
        status,
        notes
    ) VALUES (
        p_company_id,
        p_contact_id,
        p_conversation_id,
        p_service_type_id,
        p_scheduled_at,
        v_ends_at,
        'scheduled',
        p_notes
    )
    RETURNING * INTO v_appointment;

    RETURN json_build_object(
        'success',        true,
        'appointment_id', v_appointment.id,
        'company_id',     v_appointment.company_id,
        'contact_id',     v_appointment.contact_id,
        'service_type_id',v_appointment.service_type_id,
        'scheduled_at',   v_appointment.scheduled_at,
        'ends_at',        v_appointment.ends_at,
        'status',         v_appointment.status,
        'notes',          v_appointment.notes,
        'created_at',     v_appointment.created_at
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 3. rpc_cancel_appointment
--
-- Cancela um agendamento existente com status 'scheduled'.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cancel_appointment(
    p_company_id     UUID,
    p_appointment_id UUID,
    p_reason         TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appointment public.appointments%ROWTYPE;
BEGIN
    -- 1. Validar parâmetros
    IF p_company_id IS NULL OR p_appointment_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Parâmetros obrigatórios ausentes: company_id, appointment_id.'
        );
    END IF;

    -- 2. Buscar o agendamento e verificar pertencimento à empresa
    SELECT * INTO v_appointment
    FROM   public.appointments
    WHERE  id         = p_appointment_id
      AND  company_id = p_company_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Agendamento não encontrado para esta empresa.'
        );
    END IF;

    -- 3. Verificar que o status é 'scheduled'
    IF v_appointment.status != 'scheduled' THEN
        RETURN json_build_object(
            'success', false,
            'error',   format(
                'Não é possível cancelar um agendamento com status "%s". Apenas agendamentos com status "scheduled" podem ser cancelados.',
                v_appointment.status
            )
        );
    END IF;

    -- 4. Cancelar
    UPDATE public.appointments
    SET
        status               = 'cancelled',
        cancelled_at         = now(),
        cancellation_reason  = p_reason
    WHERE id = p_appointment_id
    RETURNING * INTO v_appointment;

    RETURN json_build_object(
        'success',              true,
        'appointment_id',       v_appointment.id,
        'status',               v_appointment.status,
        'cancelled_at',         v_appointment.cancelled_at,
        'cancellation_reason',  v_appointment.cancellation_reason
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 4. rpc_reschedule_appointment
--
-- Remarca um agendamento para nova data/hora.
-- Cancela o original (status = 'rescheduled') e cria um novo
-- com rescheduled_from_id apontando para o original.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_reschedule_appointment(
    p_company_id        UUID,
    p_appointment_id    UUID,
    p_new_scheduled_at  TIMESTAMPTZ,
    p_notes             TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_original      public.appointments%ROWTYPE;
    v_new_appt      public.appointments%ROWTYPE;
    v_duration_mins INTEGER;
    v_new_ends_at   TIMESTAMPTZ;
BEGIN
    -- 1. Validar parâmetros
    IF p_company_id IS NULL OR p_appointment_id IS NULL OR p_new_scheduled_at IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Parâmetros obrigatórios ausentes: company_id, appointment_id, new_scheduled_at.'
        );
    END IF;

    -- 2. Não permitir remarcar para o passado
    IF p_new_scheduled_at < now() THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Não é possível remarcar para uma data/hora no passado.'
        );
    END IF;

    -- 3. Buscar agendamento original e validar empresa
    SELECT * INTO v_original
    FROM   public.appointments
    WHERE  id         = p_appointment_id
      AND  company_id = p_company_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Agendamento não encontrado para esta empresa.'
        );
    END IF;

    -- 4. Verificar que pode ser remarcado
    IF v_original.status != 'scheduled' THEN
        RETURN json_build_object(
            'success', false,
            'error',   format(
                'Não é possível remarcar um agendamento com status "%s". Apenas agendamentos com status "scheduled" podem ser remarcados.',
                v_original.status
            )
        );
    END IF;

    -- 5. Buscar duração do serviço
    SELECT duration_minutes
    INTO   v_duration_mins
    FROM   public.service_types
    WHERE  id         = v_original.service_type_id
      AND  company_id = p_company_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Tipo de serviço do agendamento original não encontrado.'
        );
    END IF;

    -- 6. Calcular novo ends_at
    v_new_ends_at := p_new_scheduled_at + (v_duration_mins || ' minutes')::INTERVAL;

    -- 7. Verificar conflito no novo horário, excluindo o próprio registro original
    IF EXISTS (
        SELECT 1
        FROM   public.appointments a
        WHERE  a.company_id   = p_company_id
          AND  a.status       = 'scheduled'
          AND  a.id          != p_appointment_id   -- exclui o próprio
          AND  a.scheduled_at < v_new_ends_at
          AND  a.ends_at      > p_new_scheduled_at
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Conflito de horário no novo horário solicitado. Consulte os slots disponíveis e tente outro horário.'
        );
    END IF;

    -- 8. Cancelar o agendamento original (status = 'rescheduled')
    UPDATE public.appointments
    SET
        status       = 'rescheduled',
        cancelled_at = now()
    WHERE id = p_appointment_id;

    -- 9. Criar novo agendamento com referência ao original
    INSERT INTO public.appointments (
        company_id,
        contact_id,
        conversation_id,
        service_type_id,
        scheduled_at,
        ends_at,
        status,
        rescheduled_from_id,
        notes
    ) VALUES (
        v_original.company_id,
        v_original.contact_id,
        v_original.conversation_id,
        v_original.service_type_id,
        p_new_scheduled_at,
        v_new_ends_at,
        'scheduled',
        v_original.id,   -- aponta para o original
        COALESCE(p_notes, v_original.notes)
    )
    RETURNING * INTO v_new_appt;

    RETURN json_build_object(
        'success',              true,
        'appointment_id',       v_new_appt.id,
        'rescheduled_from_id',  v_new_appt.rescheduled_from_id,
        'company_id',           v_new_appt.company_id,
        'contact_id',           v_new_appt.contact_id,
        'service_type_id',      v_new_appt.service_type_id,
        'scheduled_at',         v_new_appt.scheduled_at,
        'ends_at',              v_new_appt.ends_at,
        'status',               v_new_appt.status,
        'notes',                v_new_appt.notes,
        'created_at',           v_new_appt.created_at
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


COMMIT;
