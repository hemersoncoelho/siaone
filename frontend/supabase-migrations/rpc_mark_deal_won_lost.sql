-- RPCs para fechar um deal como Ganho ou Perdido
-- Validam company_id para segurança multi-tenant
-- Preenchem closed_at, atualizam status e retornam resultado

-- ── Ganho ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_mark_deal_won(
  p_deal_id    UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_deal public.deals;
BEGIN
  UPDATE public.deals
     SET status      = 'won',
         closed_at   = NOW(),
         loss_reason = NULL,      -- limpa motivo de perda se revertido
         updated_at  = NOW()
   WHERE id          = p_deal_id
     AND company_id  = p_company_id
  RETURNING * INTO v_deal;

  IF v_deal.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Deal não encontrado para a empresa informada'
    );
  END IF;

  RETURN jsonb_build_object(
    'success',   true,
    'deal_id',   v_deal.id,
    'status',    v_deal.status,
    'closed_at', v_deal.closed_at
  );
END;
$$;

-- ── Perdido ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_mark_deal_lost(
  p_deal_id     UUID,
  p_company_id  UUID,
  p_loss_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_deal public.deals;
BEGIN
  UPDATE public.deals
     SET status      = 'lost',
         -- preserva motivo anterior se novo vier vazio
         loss_reason = NULLIF(TRIM(COALESCE(p_loss_reason, '')), ''),
         closed_at   = NOW(),
         updated_at  = NOW()
   WHERE id          = p_deal_id
     AND company_id  = p_company_id
  RETURNING * INTO v_deal;

  IF v_deal.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Deal não encontrado para a empresa informada'
    );
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'deal_id',     v_deal.id,
    'status',      v_deal.status,
    'closed_at',   v_deal.closed_at,
    'loss_reason', v_deal.loss_reason
  );
END;
$$;
