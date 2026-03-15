-- ============================================================
-- AI Agents Module - Migration
-- ============================================================

-- ── 1. Enums ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.ai_agent_provider_enum AS ENUM ('openai', 'anthropic', 'google', 'custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_mode_enum AS ENUM ('human', 'ai', 'hybrid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_binding_type_enum AS ENUM ('all', 'channel', 'conversation');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 2. ai_agents ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  provider        public.ai_agent_provider_enum NOT NULL DEFAULT 'openai',
  model           TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  -- Sensitive: system prompt with company context/instructions
  system_prompt   TEXT,
  -- Scope: JSONB blob { channels: [], auto_reply: bool, working_hours: {} }
  scope           JSONB NOT NULL DEFAULT '{"channels": [], "auto_reply": false}',
  -- Handoff triggers
  handoff_keywords    TEXT[] DEFAULT '{}',
  handoff_after_mins  INTEGER,                       -- transfer to human if unresolved after N min
  -- Lifecycle
  is_active       BOOLEAN NOT NULL DEFAULT false,
  is_published    BOOLEAN NOT NULL DEFAULT false,    -- false = draft / test mode only
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Only members of the company can see/edit agents
CREATE POLICY "ai_agents company isolation" ON public.ai_agents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = ai_agents.company_id
        AND uc.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );

-- ── 3. ai_agent_bindings ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_agent_bindings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  binding_type    public.agent_binding_type_enum NOT NULL DEFAULT 'channel',
  -- For channel binding
  channel         TEXT CHECK (channel IN ('whatsapp', 'email', 'sms', 'webchat', 'instagram', 'telegram')),
  -- For conversation binding
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_agent_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agent_bindings company isolation" ON public.ai_agent_bindings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = ai_agent_bindings.company_id
        AND uc.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );

-- ── 4. Enhance conversations ──────────────────────────────────

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_agent_id      UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_mode  public.attendance_mode_enum NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS ai_paused_at     TIMESTAMPTZ;

-- ── 5. Enhance messages ───────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ai_agent_id    UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_agent_name  TEXT;   -- denormalized snapshot of agent name at send time

-- ── 6. Updated Inbox View (includes ai fields) ────────────────

DROP VIEW IF EXISTS public.v_inbox_conversations CASCADE;

CREATE OR REPLACE VIEW public.v_inbox_conversations AS
SELECT
  cnv.id                AS conversation_id,
  cnv.company_id,
  cnv.status,
  cnv.priority::TEXT,
  cnv.unread_count,
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
    WHERE d.contact_id = ctc.id AND d.status = 'active'
  ) AS open_deals_count,
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

-- ── 7. RPCs ───────────────────────────────────────────────────

-- Toggle agent active/inactive
CREATE OR REPLACE FUNCTION public.rpc_toggle_ai_agent(
  p_agent_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSON AS $$
BEGIN
  UPDATE public.ai_agents
  SET is_active = p_is_active, updated_at = NOW()
  WHERE id = p_agent_id;

  RETURN json_build_object('success', true, 'is_active', p_is_active);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set attendance mode on a conversation + link agent
CREATE OR REPLACE FUNCTION public.rpc_set_conversation_attendance(
  p_conversation_id UUID,
  p_mode            TEXT,         -- 'human' | 'ai' | 'hybrid'
  p_agent_id        UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_body TEXT;
BEGIN
  UPDATE public.conversations
  SET
    attendance_mode = p_mode::public.attendance_mode_enum,
    ai_agent_id     = p_agent_id,
    ai_paused_at    = CASE WHEN p_mode = 'human' THEN NOW() ELSE NULL END
  WHERE id = p_conversation_id;

  -- Insert a system event message so the timeline reflects the change
  v_body := CASE p_mode
    WHEN 'ai'     THEN 'Atendimento transferido para IA.'
    WHEN 'human'  THEN 'Atendimento retomado por humano.'
    WHEN 'hybrid' THEN 'Modo híbrido ativado: IA assistindo o atendimento.'
    ELSE 'Modo de atendimento alterado.'
  END;

  INSERT INTO public.messages (
    conversation_id, sender_type, body, status, is_internal, ai_agent_id
  ) VALUES (
    p_conversation_id, 'system', v_body, 'sent', false, p_agent_id
  );

  RETURN json_build_object('success', true, 'mode', p_mode);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Save / upsert agent
CREATE OR REPLACE FUNCTION public.rpc_save_ai_agent(
  p_company_id    UUID,
  p_name          TEXT,
  p_description   TEXT DEFAULT NULL,
  p_provider      TEXT DEFAULT 'openai',
  p_model         TEXT DEFAULT 'gpt-4o-mini',
  p_system_prompt TEXT DEFAULT NULL,
  p_scope         JSONB DEFAULT '{"channels": [], "auto_reply": false}',
  p_handoff_keywords  TEXT[] DEFAULT '{}',
  p_handoff_after_mins INTEGER DEFAULT NULL,
  p_is_published  BOOLEAN DEFAULT false,
  p_agent_id      UUID DEFAULT NULL   -- NULL = insert, non-null = update
)
RETURNS JSON AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_agent_id IS NULL THEN
    INSERT INTO public.ai_agents (
      company_id, name, description, provider, model,
      system_prompt, scope, handoff_keywords, handoff_after_mins,
      is_published, created_by
    ) VALUES (
      p_company_id, p_name, p_description, p_provider::public.ai_agent_provider_enum, p_model,
      p_system_prompt, p_scope, p_handoff_keywords, p_handoff_after_mins,
      p_is_published, auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.ai_agents SET
      name                = p_name,
      description         = p_description,
      provider            = p_provider::public.ai_agent_provider_enum,
      model               = p_model,
      system_prompt       = p_system_prompt,
      scope               = p_scope,
      handoff_keywords    = p_handoff_keywords,
      handoff_after_mins  = p_handoff_after_mins,
      is_published        = p_is_published,
      updated_at          = NOW()
    WHERE id = p_agent_id AND company_id = p_company_id
    RETURNING id INTO v_id;
  END IF;

  RETURN json_build_object('success', true, 'agent_id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_agents_company ON public.ai_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_bindings_agent ON public.ai_agent_bindings(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON public.conversations(ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON public.messages(ai_agent_id);

-- ── 9. Updated trigger: keep updated_at fresh ─────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_agents_updated_at ON public.ai_agents;
CREATE TRIGGER trg_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
