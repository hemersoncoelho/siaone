-- ============================================================
-- Fix: unread_count deve refletir mensagens do contato não lidas
-- ============================================================

-- ── 1. Trigger: incrementa unread_count ao receber mensagem do contato ──

CREATE OR REPLACE FUNCTION public.fn_increment_unread_on_contact_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Só incrementa para mensagens do contato que não são internas
  IF NEW.sender_type = 'contact' AND NEW.is_internal = false THEN
    UPDATE public.conversations
    SET unread_count = unread_count + 1
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_unread_on_contact_message ON public.messages;
CREATE TRIGGER trg_increment_unread_on_contact_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_increment_unread_on_contact_message();

-- ── 2. Corrige rpc_mark_conversation_read ─────────────────────────────
-- Marca TODAS as mensagens do contato não lidas (received, delivered, sent)

DROP FUNCTION IF EXISTS public.rpc_mark_conversation_read(uuid);
CREATE OR REPLACE FUNCTION public.rpc_mark_conversation_read(
    p_conversation_id UUID
)
RETURNS JSON AS $$
BEGIN
    UPDATE public.conversations
    SET unread_count = 0
    WHERE id = p_conversation_id;

    UPDATE public.messages
    SET status = 'read'
    WHERE conversation_id = p_conversation_id
      AND sender_type = 'contact'
      AND status != 'read'
      AND is_internal = false;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Atualiza view: unread_count calculado dinamicamente ────────────
-- Garante que o badge sempre reflita o estado real das mensagens,
-- mesmo que o contador da coluna esteja desincronizado.

DROP VIEW IF EXISTS public.v_inbox_conversations CASCADE;

CREATE OR REPLACE VIEW public.v_inbox_conversations AS
SELECT
  cnv.id                AS conversation_id,
  cnv.company_id,
  cnv.status,
  cnv.priority::TEXT,
  -- Conta dinamicamente as mensagens do contato ainda não lidas
  (
    SELECT COUNT(*)::INTEGER
    FROM public.messages msg
    WHERE msg.conversation_id = cnv.id
      AND msg.sender_type = 'contact'
      AND msg.status != 'read'
      AND msg.is_internal = false
  )                     AS unread_count,
  cnv.attendance_mode::TEXT,
  cnv.ai_paused_at,
  ctc.id                AS contact_id,
  ctc.full_name         AS contact_name,
  up.id                 AS assigned_to_id,
  up.full_name          AS assigned_to_name,
  agt.id                AS ai_agent_id,
  agt.name              AS ai_agent_name,
  agt.is_active         AS ai_agent_active,
  (
    SELECT COUNT(d.id)
    FROM public.deals d
    WHERE d.contact_id = ctc.id AND d.status = 'open'
  )                     AS open_deals_count,
  m.body                AS last_message_preview,
  m.created_at          AS last_message_at
FROM public.conversations cnv
JOIN public.contacts ctc ON cnv.contact_id = ctc.id
LEFT JOIN public.user_profiles up ON cnv.assigned_to = up.id
LEFT JOIN public.ai_agents agt ON cnv.ai_agent_id = agt.id
LEFT JOIN (
  SELECT conversation_id, body, created_at,
         ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC) AS rn
  FROM public.messages
) m ON m.conversation_id = cnv.id AND m.rn = 1;

-- ── 4. Sincroniza unread_count existente com a realidade ─────────────
-- Corrige o valor atual da coluna para todos os registros

UPDATE public.conversations c
SET unread_count = (
  SELECT COUNT(*)
  FROM public.messages m
  WHERE m.conversation_id = c.id
    AND m.sender_type = 'contact'
    AND m.status != 'read'
    AND m.is_internal = false
);
