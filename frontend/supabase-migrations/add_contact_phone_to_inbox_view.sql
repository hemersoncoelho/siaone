-- Adiciona contact_phone à view v_inbox_conversations.
-- CREATE OR REPLACE VIEW só permite adicionar colunas ao final — sem breaking change.

CREATE OR REPLACE VIEW public.v_inbox_conversations AS
SELECT
  cnv.id                AS conversation_id,
  cnv.company_id,
  cnv.status,
  cnv.priority::TEXT,
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
  m.created_at          AS last_message_at,
  -- Telefone WhatsApp do contato para despacho via n8n
  (
    SELECT ci.normalized_value
    FROM public.contact_identities ci
    WHERE ci.contact_id   = ctc.id
      AND ci.channel_type = 'whatsapp'
    LIMIT 1
  )                     AS contact_phone
FROM public.conversations cnv
JOIN public.contacts ctc ON cnv.contact_id = ctc.id
LEFT JOIN public.user_profiles up ON cnv.assigned_to = up.id
LEFT JOIN public.ai_agents agt ON cnv.ai_agent_id = agt.id
LEFT JOIN (
  SELECT conversation_id, body, created_at,
         ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC) AS rn
  FROM public.messages
) m ON m.conversation_id = cnv.id AND m.rn = 1;
