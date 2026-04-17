-- ============================================================
-- n8n Flow: Normalização de phone + Deal em Prospecção + Metadados do lead
-- ============================================================

-- 1. Coluna metadata em contacts (para armazenar campos do lead UAZAPI)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ============================================================
-- 2. RPC: rpc_ensure_prospeccao_deal
--    Verifica se o contato (identificado pelo phone normalizado)
--    já tem um deal aberto. Se não tiver, cria no primeiro
--    estágio do pipeline ativo da empresa (Prospecção).
--
--    Retorna JSONB: { success, contact_id, deal_id, is_new_deal }
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_ensure_prospeccao_deal(
  p_company_id    UUID,
  p_phone         TEXT,
  p_sender_name   TEXT DEFAULT '',
  p_lead_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id  UUID;
  v_deal_id     UUID;
  v_pipeline_id UUID;
  v_stage_id    UUID;
  v_is_new      BOOLEAN := FALSE;
BEGIN

  -- Localiza o contato pelo telefone normalizado (ex: 558898325848)
  SELECT ci.contact_id INTO v_contact_id
  FROM contact_identities ci
  WHERE ci.company_id     = p_company_id
    AND ci.channel_type   = 'whatsapp'::channel_type_enum
    AND ci.normalized_value = p_phone
  LIMIT 1;

  -- Contato ainda não existe (situação improvável pois rpc_persist_inbound_message
  -- já o cria, mas tratamos o caso por segurança)
  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Contato não encontrado para phone=' || p_phone
    );
  END IF;

  -- Verifica se já existe algum deal aberto para este contato
  SELECT id INTO v_deal_id
  FROM deals
  WHERE company_id = p_company_id
    AND contact_id = v_contact_id
    AND status     = 'open'::deal_status_enum
  ORDER BY created_at ASC
  LIMIT 1;

  -- Nenhum deal encontrado → cria no primeiro estágio (Prospecção)
  IF v_deal_id IS NULL THEN

    -- Pipeline padrão ativo da empresa
    SELECT p.id INTO v_pipeline_id
    FROM pipelines p
    WHERE p.company_id = p_company_id
      AND p.is_active  = true
    ORDER BY p.is_default DESC, p.created_at ASC
    LIMIT 1;

    -- Primeiro estágio do pipeline (posição mais baixa = Prospecção)
    IF v_pipeline_id IS NOT NULL THEN
      SELECT ps.id INTO v_stage_id
      FROM pipeline_stages ps
      WHERE ps.pipeline_id = v_pipeline_id
      ORDER BY ps.position ASC
      LIMIT 1;
    END IF;

    IF v_pipeline_id IS NOT NULL AND v_stage_id IS NOT NULL THEN
      INSERT INTO deals (
        company_id, contact_id,
        pipeline_id, stage_id,
        title, amount, currency, status
      ) VALUES (
        p_company_id,
        v_contact_id,
        v_pipeline_id,
        v_stage_id,
        COALESCE(NULLIF(trim(p_sender_name), ''), 'Lead WhatsApp ' || p_phone),
        0,
        'BRL',
        'open'::deal_status_enum
      )
      RETURNING id INTO v_deal_id;

      v_is_new := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'contact_id',  v_contact_id,
    'deal_id',     v_deal_id,
    'is_new_deal', v_is_new
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'rpc_ensure_prospeccao_deal error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 3. RPC: rpc_update_contact_lead_metadata
--    Salva os metadados do lead (campos UAZAPI: lead_field01-20,
--    lead_status, lead_tags, track_source, track_id, etc.)
--    no contato usando merge JSONB — não sobrescreve campos
--    existentes que o n8n não enviou.
--
--    Retorna JSONB: { success, contact_id }
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_update_contact_lead_metadata(
  p_contact_id    UUID,
  p_company_id    UUID,
  p_lead_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- Nada a salvar se metadata estiver vazio
  IF p_lead_metadata IS NULL OR p_lead_metadata = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', true, 'contact_id', p_contact_id, 'skipped', true);
  END IF;

  -- Merge: mantém campos existentes e adiciona/atualiza os novos
  UPDATE contacts
  SET metadata = COALESCE(metadata, '{}') || p_lead_metadata
  WHERE id         = p_contact_id
    AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true, 'contact_id', p_contact_id);

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'rpc_update_contact_lead_metadata error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
