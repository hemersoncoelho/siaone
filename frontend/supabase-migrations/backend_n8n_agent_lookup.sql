-- ============================================================
-- n8n Agent Lookup RPCs
-- Permite que workflows n8n (sem JWT) resolvam company_id
-- a partir do instance_token e busquem o agente de IA ativo.
-- SECURITY DEFINER = roda como postgres, bypassando RLS.
-- ============================================================

-- ── 1. Resolve company_id a partir do instance_token ─────────

CREATE OR REPLACE FUNCTION public.rpc_resolve_company_by_token(
  p_instance_token TEXT
)
RETURNS JSON AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT ai.company_id INTO v_company_id
  FROM public.app_integrations ai
  WHERE ai.instance_token = p_instance_token
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'instance_token não encontrado'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'company_id', v_company_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_company_by_token(TEXT) TO anon, authenticated;

-- ── 2. Busca o agente de IA ativo por company_id ─────────────

CREATE OR REPLACE FUNCTION public.rpc_get_active_ai_agent(
  p_company_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_agent JSON;
BEGIN
  SELECT row_to_json(a) INTO v_agent
  FROM public.ai_agents a
  WHERE a.company_id = p_company_id
    AND a.is_active   = true
  LIMIT 1;

  IF v_agent IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Nenhum agente ativo/publicado para esta empresa'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'agent', v_agent
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_get_active_ai_agent(UUID) TO anon, authenticated;
