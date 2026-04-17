-- ============================================================
-- HOTFIX: rpc_save_ai_agent — alinhado com schema REAL de ai_agents
--
-- Schema real (extraído do banco):
--   id, company_id, name, slug (NOT NULL), description,
--   system_prompt, operating_instructions,
--   model_provider (NOT NULL), model_name (NOT NULL),
--   temperature (default 0.7), max_tokens,
--   handoff_enabled (default true), is_active (default true),
--   config JSONB (armazena: channels, auto_reply, handoff_keywords,
--                           handoff_after_mins, is_published),
--   created_at, updated_at
--
-- Colunas que NÃO existem (usar config para elas):
--   provider, model, is_published, created_by,
--   scope, handoff_keywords, handoff_after_mins
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_save_ai_agent(
  p_company_id         UUID,
  p_name               TEXT,
  p_description        TEXT    DEFAULT NULL,
  p_provider           TEXT    DEFAULT 'openai',
  p_model              TEXT    DEFAULT 'gpt-4o-mini',
  p_system_prompt      TEXT    DEFAULT NULL,
  p_scope              JSONB   DEFAULT '{"channels": [], "auto_reply": false}',
  p_handoff_keywords   TEXT[]  DEFAULT '{}',
  p_handoff_after_mins INTEGER DEFAULT NULL,
  p_is_published       BOOLEAN DEFAULT false,
  p_agent_id           UUID    DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_id     UUID;
  v_slug   TEXT;
  v_config JSONB;
BEGIN
  -- Consolida configuração no JSONB config
  v_config := jsonb_build_object(
    'channels',           COALESCE(p_scope -> 'channels',   '[]'::jsonb),
    'auto_reply',         COALESCE(p_scope -> 'auto_reply', 'false'::jsonb),
    'handoff_keywords',   to_jsonb(COALESCE(p_handoff_keywords, '{}'::TEXT[])),
    'handoff_after_mins', p_handoff_after_mins,
    'is_published',       p_is_published
  );

  IF p_agent_id IS NULL THEN
    -- Gera slug a partir do nome (slug é NOT NULL na tabela)
    v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    IF v_slug = '' THEN v_slug := 'agente'; END IF;

    -- Garante unicidade dentro da empresa
    IF EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE company_id = p_company_id AND slug = v_slug
    ) THEN
      v_slug := v_slug || '-' || substring(gen_random_uuid()::text, 1, 8);
    END IF;

    INSERT INTO public.ai_agents (
      company_id,
      name,
      slug,
      description,
      model_provider,
      model_name,
      system_prompt,
      config,
      is_active,
      handoff_enabled
    ) VALUES (
      p_company_id,
      p_name,
      v_slug,
      p_description,
      p_provider,
      p_model,
      p_system_prompt,
      v_config,
      false,
      true
    ) RETURNING id INTO v_id;

  ELSE
    UPDATE public.ai_agents SET
      name           = p_name,
      description    = p_description,
      model_provider = p_provider,
      model_name     = p_model,
      system_prompt  = p_system_prompt,
      config         = v_config,
      updated_at     = NOW()
    WHERE id        = p_agent_id
      AND company_id = p_company_id
    RETURNING id INTO v_id;
  END IF;

  RETURN json_build_object('success', true, 'agent_id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
