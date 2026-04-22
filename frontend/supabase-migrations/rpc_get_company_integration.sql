-- Retorna instance_id e instance_token da integração UAZAPI ativa de uma empresa.
-- SECURITY DEFINER permite que o n8n (anon key) leia sem depender de RLS.

CREATE OR REPLACE FUNCTION public.rpc_get_company_integration(
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance_id    TEXT;
  v_instance_token TEXT;
BEGIN
  SELECT instance_id, instance_token
    INTO v_instance_id, v_instance_token
    FROM app_integrations
   WHERE company_id = p_company_id
     AND provider   = 'uazapi'
     AND status     = 'connected'
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Integração UAZAPI não encontrada ou desconectada para a empresa.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'instance_id',    v_instance_id,
    'instance_token', v_instance_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_company_integration(UUID)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
