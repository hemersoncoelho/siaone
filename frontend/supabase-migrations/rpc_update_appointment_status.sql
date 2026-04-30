-- ============================================================
-- RPC: rpc_update_appointment_status
-- Atualiza o status de um agendamento com validação de tenant
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_appointment_status(
  p_company_id     uuid,
  p_appointment_id uuid,
  p_new_status     text,
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt appointments%ROWTYPE;
BEGIN
  -- Validar status
  IF p_new_status NOT IN ('scheduled', 'completed', 'cancelled', 'rescheduled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status inválido. Use: scheduled, completed, cancelled ou rescheduled.');
  END IF;

  -- Buscar e validar ownership
  SELECT * INTO v_appt
  FROM appointments
  WHERE id = p_appointment_id
    AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agendamento não encontrado ou sem permissão.');
  END IF;

  -- Atualizar
  UPDATE appointments
  SET
    status             = p_new_status,
    updated_at         = now(),
    cancellation_reason = CASE
      WHEN p_new_status = 'cancelled' THEN p_reason
      ELSE cancellation_reason
    END
  WHERE id = p_appointment_id
    AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'success',        true,
    'appointment_id', p_appointment_id,
    'status',         p_new_status
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_update_appointment_status IS
  'Atualiza o status de um agendamento. Valida company_id. Versão: 2026-04-23.';
