-- ============================================================
-- ANALYTICS LAYER — ETAPA 1
-- Camada analítica canônica sobre o schema transacional.
-- Views lidas por dashboards; não alteram dados operacionais.
--
-- ESTRATÉGIA GERAL
-- ┌─────────────────────────────────────────────────────────────┐
-- │ Tabelas TRANSACIONAIS (não alterar)                         │
-- │   user_profiles, user_companies, contacts, conversations,   │
-- │   messages, deals, pipeline_stages, tasks,                  │
-- │   app_integrations, channel_accounts, …                     │
-- └────────────────────────┬────────────────────────────────────┘
--                          │ camada semântica
-- ┌────────────────────────▼────────────────────────────────────┐
-- │ VIEWS ANALÍTICAS (esta migration)                           │
-- │   v_users_canonical       — usuários sem ambiguidade        │
-- │   v_memberships_canonical — vínculos sem duplicata          │
-- │   v_kpi_company_daily     — KPIs diários por empresa        │
-- │   v_pipeline_conversion   — funil comercial                 │
-- │   v_integration_health    — saúde de integrações            │
-- └─────────────────────────────────────────────────────────────┘
-- ============================================================

-- ============================================================
-- 1. v_users_canonical
--
-- OBJETIVO: 1 linha por usuário com role global canônica.
-- TABELAS FONTE:
--   user_profiles (primária) — cobre 100% dos users via trigger on_auth_user_created
--   profiles      (secundária) — enriquece com email, is_active, platform_role
-- REGRA DE PRECEDÊNCIA:
--   platform_admin vence em qualquer das fontes.
--   user_profiles.system_role é a fonte operacional de autoridade.
--   profiles.platform_role é enriquecimento do sistema novo (platform_role_enum).
-- OBSERVAÇÕES:
--   Apenas 2 de 8 usuários têm registro em profiles (email disponível apenas para esses).
--   has_new_profile = false indica usuário provisionado apenas pelo sistema legado.
-- ============================================================
DROP VIEW IF EXISTS public.v_users_canonical CASCADE;
CREATE OR REPLACE VIEW public.v_users_canonical AS
SELECT
  up.id                                         AS user_id,
  COALESCE(p.full_name, up.full_name)           AS full_name,
  p.email,
  up.avatar_url,
  -- Role global canonizada: platform_admin tem precedência máxima
  CASE
    WHEN up.system_role::text = 'platform_admin'
      OR p.platform_role::text = 'platform_admin' THEN 'platform_admin'
    WHEN up.system_role::text = 'company_admin'   THEN 'company_admin'
    WHEN up.system_role::text = 'manager'         THEN 'manager'
    ELSE                                               'agent'
  END                                           AS canonical_role,
  -- Valores brutos para auditoria
  up.system_role::text                          AS system_role_raw,
  p.platform_role::text                         AS platform_role_raw,
  -- Ativação: profiles.is_active quando disponível; default true
  COALESCE(p.is_active, true)                   AS is_active,
  -- Diagnóstico da dualidade de tabelas
  (p.user_id IS NOT NULL)                       AS has_new_profile,
  -- Timestamps
  up.created_at,
  GREATEST(up.updated_at, p.updated_at)         AS updated_at,
  -- Campos operacionais de agentes WhatsApp
  up.instance_whatsapp,
  up.connected                                  AS is_whatsapp_connected,
  up.last_connected                             AS whatsapp_last_connected_at
FROM public.user_profiles up
LEFT JOIN public.profiles p ON p.user_id = up.id;

COMMENT ON VIEW public.v_users_canonical IS
  'Visão canônica de usuários. Consolida user_profiles (fonte operacional principal) '
  'e profiles (enriquecimento: email, is_active, platform_role). '
  '1 linha por usuário. canonical_role resolve conflito entre as duas tabelas.';

-- ============================================================
-- 2. v_memberships_canonical
--
-- OBJETIVO: 1 linha por (user_id, company_id) sem duplicata.
-- TABELAS FONTE:
--   company_memberships (nova) — schema rico: status, joined_at, invited_by, company_role_enum
--   user_companies      (antiga) — schema simples: role_in_company (app_role), sem status
-- ESTRATÉGIA:
--   FULL OUTER JOIN por (user_id, company_id).
--   Quando ambas existem: company_memberships prevalece (mais completa).
--   source_system indica a origem: 'both', 'company_memberships', 'user_companies'.
-- OBSERVAÇÕES:
--   3 vínculos existem nas duas tabelas (source='both').
--   5 vínculos apenas em user_companies (sistema legado).
--   3 vínculos apenas em company_memberships (sistema novo).
-- ============================================================
DROP VIEW IF EXISTS public.v_memberships_canonical CASCADE;
CREATE OR REPLACE VIEW public.v_memberships_canonical AS
WITH uc AS (
  SELECT
    user_id,
    company_id,
    role_in_company::text   AS role,
    team_id,
    'active'::text          AS membership_status,
    created_at              AS joined_at,
    NULL::uuid              AS invited_by,
    created_at,
    'user_companies'        AS source_system
  FROM public.user_companies
),
cm AS (
  SELECT
    user_id,
    company_id,
    role::text              AS role,
    team_id,
    status::text            AS membership_status,
    COALESCE(joined_at, created_at) AS joined_at,
    invited_by,
    created_at,
    'company_memberships'   AS source_system
  FROM public.company_memberships
),
merged AS (
  SELECT
    COALESCE(cm.user_id,    uc.user_id)    AS user_id,
    COALESCE(cm.company_id, uc.company_id) AS company_id,
    COALESCE(cm.role,       uc.role)       AS company_role,
    COALESCE(cm.team_id,    uc.team_id)    AS team_id,
    COALESCE(cm.membership_status, uc.membership_status) AS membership_status,
    COALESCE(cm.joined_at,  uc.joined_at)  AS joined_at,
    cm.invited_by,
    LEAST(cm.created_at,    uc.created_at) AS created_at,
    CASE
      WHEN cm.user_id IS NOT NULL AND uc.user_id IS NOT NULL THEN 'both'
      WHEN cm.user_id IS NOT NULL                            THEN 'company_memberships'
      ELSE                                                        'user_companies'
    END AS source_system
  FROM cm
  FULL OUTER JOIN uc
    ON uc.user_id = cm.user_id AND uc.company_id = cm.company_id
)
SELECT
  m.user_id,
  u.full_name   AS user_full_name,
  u.email       AS user_email,
  u.canonical_role AS user_global_role,
  m.company_id,
  c.name        AS company_name,
  m.company_role,
  m.team_id,
  t.name        AS team_name,
  m.membership_status,
  m.membership_status = 'active' AS is_active,
  m.joined_at,
  m.invited_by,
  m.created_at,
  m.source_system
FROM merged m
JOIN  public.companies c    ON c.id = m.company_id
LEFT JOIN public.teams t    ON t.id = m.team_id
LEFT JOIN public.v_users_canonical u ON u.user_id = m.user_id;

COMMENT ON VIEW public.v_memberships_canonical IS
  'Visão canônica de vínculos usuário-empresa. Consolida user_companies (antigo) '
  'e company_memberships (novo) via FULL OUTER JOIN. '
  'Quando o mesmo vínculo existe nas duas tabelas, company_memberships tem precedência. '
  '1 linha lógica por (user_id, company_id). source_system indica a origem.';

-- ============================================================
-- 3. v_kpi_company_daily
--
-- OBJETIVO: KPIs diários por empresa, 1 linha por (company_id, date).
-- TABELAS FONTE: contacts, conversations, deals, messages, tasks.
-- CRITÉRIOS TEMPORAIS:
--   Métricas de FLUXO (prefixo new_, won_, lost_, closed_):
--     usam a data do evento relevante (created_at ou closed_at).
--   Métricas de COORTE (open_conversations, open_pipeline_amount, tasks_*):
--     criados naquele dia e atualmente ainda no estado aberto.
--     NÃO representam estoque histórico exato. Para isso, materialize com snapshot diário.
-- OBSERVAÇÕES:
--   new_leads usa lifecycle_stage = 'lead' (não contacts.status).
--   messages exclui mensagens internas (is_internal = true).
--   tasks_open/overdue usam LOWER(status) NOT IN ('done','completed').
--   open_conversations considera status IN ('open','pending').
-- ============================================================
DROP VIEW IF EXISTS public.v_kpi_company_daily CASCADE;
CREATE OR REPLACE VIEW public.v_kpi_company_daily AS
WITH
-- Eixo de datas: todos os (company_id, date) com qualquer atividade
dates AS (
  SELECT company_id, created_at::date AS ref_date FROM public.contacts
  UNION
  SELECT company_id, created_at::date FROM public.conversations
  UNION
  SELECT company_id, created_at::date FROM public.deals
  UNION
  SELECT company_id, created_at::date FROM public.messages
  UNION
  SELECT company_id, created_at::date FROM public.tasks
),
contacts_daily AS (
  SELECT
    company_id,
    created_at::date AS ref_date,
    COUNT(*)                                                AS new_contacts,
    COUNT(*) FILTER (WHERE lifecycle_stage::text = 'lead') AS new_leads
  FROM public.contacts
  GROUP BY company_id, created_at::date
),
conv_new AS (
  SELECT company_id, created_at::date AS ref_date, COUNT(*) AS new_conversations
  FROM public.conversations
  GROUP BY company_id, created_at::date
),
conv_closed AS (
  SELECT company_id, closed_at::date AS ref_date, COUNT(*) AS closed_conversations
  FROM public.conversations
  WHERE closed_at IS NOT NULL
  GROUP BY company_id, closed_at::date
),
-- Coorte: criadas no dia, ainda abertas hoje
conv_open_cohort AS (
  SELECT
    company_id,
    created_at::date AS ref_date,
    COUNT(*) FILTER (WHERE status::text IN ('open','pending')) AS open_conversations
  FROM public.conversations
  GROUP BY company_id, created_at::date
),
deals_new AS (
  SELECT
    company_id,
    created_at::date AS ref_date,
    COUNT(*) AS new_deals,
    -- Coorte: deals criados nesse dia, atualmente abertos
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'open'), 0) AS open_pipeline_amount
  FROM public.deals
  GROUP BY company_id, created_at::date
),
deals_closed AS (
  SELECT
    company_id,
    closed_at::date AS ref_date,
    COUNT(*) FILTER (WHERE status::text = 'won')  AS won_deals,
    COUNT(*) FILTER (WHERE status::text = 'lost') AS lost_deals,
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'won'), 0) AS won_amount
  FROM public.deals
  WHERE closed_at IS NOT NULL
  GROUP BY company_id, closed_at::date
),
messages_daily AS (
  SELECT
    company_id,
    created_at::date AS ref_date,
    COUNT(*) FILTER (WHERE direction::text = 'inbound')              AS messages_inbound,
    COUNT(*) FILTER (WHERE direction::text IN ('outbound','system')) AS messages_outbound
  FROM public.messages
  WHERE COALESCE(is_internal, false) = false
  GROUP BY company_id, created_at::date
),
tasks_daily AS (
  SELECT
    company_id,
    created_at::date AS ref_date,
    COUNT(*) FILTER (
      WHERE LOWER(status) NOT IN ('done','completed')
    ) AS tasks_open,
    COUNT(*) FILTER (
      WHERE LOWER(status) NOT IN ('done','completed')
        AND due_at IS NOT NULL
        AND due_at < NOW()
    ) AS tasks_overdue
  FROM public.tasks
  GROUP BY company_id, created_at::date
)
SELECT
  d.company_id,
  c.name                              AS company_name,
  d.ref_date                          AS reference_date,
  COALESCE(ct.new_contacts,    0)     AS new_contacts,
  COALESCE(ct.new_leads,       0)     AS new_leads,
  COALESCE(cn.new_conversations, 0)   AS new_conversations,
  COALESCE(ccl.closed_conversations, 0) AS closed_conversations,
  COALESCE(coc.open_conversations, 0) AS open_conversations,
  COALESCE(dn.new_deals,       0)     AS new_deals,
  COALESCE(dcl.won_deals,      0)     AS won_deals,
  COALESCE(dcl.lost_deals,     0)     AS lost_deals,
  COALESCE(dn.open_pipeline_amount, 0) AS open_pipeline_amount,
  COALESCE(dcl.won_amount,     0)     AS won_amount,
  COALESCE(md.messages_inbound,  0)   AS messages_inbound,
  COALESCE(md.messages_outbound, 0)   AS messages_outbound,
  COALESCE(td.tasks_open,      0)     AS tasks_open,
  COALESCE(td.tasks_overdue,   0)     AS tasks_overdue
FROM dates d
JOIN  public.companies c    ON c.id = d.company_id
LEFT JOIN contacts_daily ct   ON ct.company_id  = d.company_id AND ct.ref_date  = d.ref_date
LEFT JOIN conv_new        cn  ON cn.company_id  = d.company_id AND cn.ref_date  = d.ref_date
LEFT JOIN conv_closed     ccl ON ccl.company_id = d.company_id AND ccl.ref_date = d.ref_date
LEFT JOIN conv_open_cohort coc ON coc.company_id = d.company_id AND coc.ref_date = d.ref_date
LEFT JOIN deals_new       dn  ON dn.company_id  = d.company_id AND dn.ref_date  = d.ref_date
LEFT JOIN deals_closed    dcl ON dcl.company_id = d.company_id AND dcl.ref_date = d.ref_date
LEFT JOIN messages_daily  md  ON md.company_id  = d.company_id AND md.ref_date  = d.ref_date
LEFT JOIN tasks_daily     td  ON td.company_id  = d.company_id AND td.ref_date  = d.ref_date
ORDER BY d.company_id, d.ref_date;

COMMENT ON VIEW public.v_kpi_company_daily IS
  'KPIs diários por empresa. 1 linha por (company_id, data). '
  'Métricas de fluxo: new_*, closed_*, won_*, messages_* usam a data do evento. '
  'open_conversations e open_pipeline_amount são COORTE (criados naquele dia, estado atual). '
  'Para estoque histórico real, materialize esta view com snapshot diário.';

-- ============================================================
-- 4. v_pipeline_conversion
--
-- OBJETIVO: Funil comercial por pipeline/stage.
-- TABELAS FONTE: pipelines, pipeline_stages, deals, deal_stage_history.
-- MÉTRICAS:
--   Snapshot atual: total/open/won/lost deals e amounts por stage.
--   Weighted forecast: open_amount * win_probability / 100.
--   Aging: avg dias em cada stage, via deal_stage_history (NULL se sem histórico).
--   Conversion rate: deals avançados / deals entrados (via histórico).
-- OBSERVAÇÕES:
--   stage_advance_rate_pct e avg_days_in_stage são NULL quando deal_stage_history
--   está vazio (histórico não populado automaticamente — requer trigger ou RPC).
--   deals_with_stage_history indica cobertura do histórico para confiabilidade.
-- ============================================================
DROP VIEW IF EXISTS public.v_pipeline_conversion CASCADE;
CREATE OR REPLACE VIEW public.v_pipeline_conversion AS
WITH
deals_snapshot AS (
  SELECT
    d.company_id,
    d.pipeline_id,
    d.stage_id,
    COUNT(*)                                              AS total_deals,
    COUNT(*) FILTER (WHERE d.status::text = 'open')     AS open_deals,
    COUNT(*) FILTER (WHERE d.status::text = 'won')      AS won_deals,
    COUNT(*) FILTER (WHERE d.status::text = 'lost')     AS lost_deals,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'open'),  0) AS open_amount,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'won'),   0) AS won_amount,
    COALESCE(SUM(d.amount), 0)                          AS total_amount
  FROM public.deals d
  GROUP BY d.company_id, d.pipeline_id, d.stage_id
),
-- Aging: para cada entrada em uma stage, tempo até a próxima saída da mesma stage
stage_durations AS (
  SELECT
    enter.new_stage_id                 AS stage_id,
    enter.deal_id,
    enter.changed_at                   AS entered_at,
    MIN(exit_ev.changed_at)            AS left_at
  FROM public.deal_stage_history enter
  LEFT JOIN public.deal_stage_history exit_ev
    ON  exit_ev.deal_id      = enter.deal_id
    AND exit_ev.old_stage_id = enter.new_stage_id
    AND exit_ev.changed_at   > enter.changed_at
  GROUP BY enter.new_stage_id, enter.deal_id, enter.changed_at
),
stage_aging AS (
  SELECT
    stage_id,
    AVG(
      EXTRACT(EPOCH FROM COALESCE(left_at, NOW()) - entered_at) / 86400.0
    )                                  AS avg_days_in_stage,
    COUNT(DISTINCT deal_id)            AS deals_with_history
  FROM stage_durations
  GROUP BY stage_id
),
stage_entries AS (
  SELECT new_stage_id AS stage_id, COUNT(DISTINCT deal_id) AS deals_entered
  FROM public.deal_stage_history
  GROUP BY new_stage_id
),
-- Avanço: deals que saíram desta stage para uma de posição maior
stage_advances AS (
  SELECT
    dsh.old_stage_id                   AS stage_id,
    COUNT(DISTINCT dsh.deal_id)        AS deals_advanced
  FROM public.deal_stage_history dsh
  JOIN public.pipeline_stages ps_old ON ps_old.id = dsh.old_stage_id
  JOIN public.pipeline_stages ps_new
    ON  ps_new.id          = dsh.new_stage_id
    AND ps_new.pipeline_id = ps_old.pipeline_id
    AND ps_new.position    > ps_old.position
  GROUP BY dsh.old_stage_id
)
SELECT
  p.id                                           AS pipeline_id,
  p.company_id,
  co.name                                        AS company_name,
  p.name                                         AS pipeline_name,
  p.is_default,
  ps.id                                          AS stage_id,
  ps.name                                        AS stage_name,
  ps.position                                    AS stage_position,
  ps.win_probability,
  ps.color                                       AS stage_color,
  COALESCE(ds.total_deals, 0)                    AS total_deals,
  COALESCE(ds.open_deals,  0)                    AS open_deals,
  COALESCE(ds.won_deals,   0)                    AS won_deals,
  COALESCE(ds.lost_deals,  0)                    AS lost_deals,
  COALESCE(ds.open_amount, 0)                    AS open_amount,
  COALESCE(ds.won_amount,  0)                    AS won_amount,
  COALESCE(ds.total_amount, 0)                   AS total_amount,
  -- Previsão ponderada pela probabilidade da stage
  ROUND(
    COALESCE(ds.open_amount, 0) * ps.win_probability / 100.0, 2
  )                                              AS weighted_forecast,
  -- Aging médio (dias) — NULL se sem histórico
  ROUND(sa.avg_days_in_stage::numeric, 1)        AS avg_days_in_stage,
  COALESCE(sa.deals_with_history, 0)             AS deals_with_stage_history,
  -- Conversão via histórico
  COALESCE(se.deals_entered,  0)                 AS deals_entered_historical,
  COALESCE(adv.deals_advanced, 0)                AS deals_advanced_historical,
  CASE
    WHEN COALESCE(se.deals_entered, 0) > 0
    THEN ROUND(
      100.0 * COALESCE(adv.deals_advanced, 0) / se.deals_entered, 1
    )
    ELSE NULL
  END                                            AS stage_advance_rate_pct
FROM public.pipelines p
JOIN  public.companies       co  ON co.id = p.company_id
JOIN  public.pipeline_stages ps  ON ps.pipeline_id = p.id
LEFT JOIN deals_snapshot     ds  ON ds.pipeline_id = p.id AND ds.stage_id = ps.id
LEFT JOIN stage_aging        sa  ON sa.stage_id = ps.id
LEFT JOIN stage_entries      se  ON se.stage_id = ps.id
LEFT JOIN stage_advances     adv ON adv.stage_id = ps.id
WHERE p.is_active = true
ORDER BY p.company_id, p.id, ps.position;

COMMENT ON VIEW public.v_pipeline_conversion IS
  'Funil de pipeline por stage. Métricas de estoque (snapshot atual) + '
  'aging e conversão via deal_stage_history (quando disponível). '
  'weighted_forecast = open_amount * win_probability / 100. '
  'stage_advance_rate_pct requer deal_stage_history populado; NULL = sem histórico.';

-- ============================================================
-- 5. v_integration_health
--
-- OBJETIVO: Saúde operacional de integrações e canais por empresa.
-- TABELAS FONTE:
--   app_integrations       — sistema legado WhatsApp/UAZAPI (1 por empresa/provider)
--   channel_accounts       — sistema novo multi-canal (N por empresa)
--   integration_webhook_logs — logs de webhook (últimos 7 dias)
--   message_dispatch_queue — fila de envio (estado atual)
-- JANELA OPERACIONAL: 7 dias para métricas de webhooks.
-- OBSERVAÇÕES:
--   Métricas de webhook/fila são aplicáveis apenas para channel_accounts
--   (o sistema legado app_integrations não tem channel_account_id).
--   health_status: healthy | degraded (>10 msgs falhadas ou >20% webhooks com erro)
--                | disconnected | unknown.
-- ============================================================
DROP VIEW IF EXISTS public.v_integration_health CASCADE;
CREATE OR REPLACE VIEW public.v_integration_health AS
WITH
webhook_7d AS (
  SELECT
    company_id,
    channel_account_id,
    COUNT(*)                               AS total_webhooks_7d,
    COUNT(*) FILTER (WHERE status = 'error') AS failed_webhooks_7d,
    MAX(received_at)                       AS last_webhook_at
  FROM public.integration_webhook_logs
  WHERE received_at >= NOW() - INTERVAL '7 days'
  GROUP BY company_id, channel_account_id
),
dispatch_stats AS (
  SELECT
    company_id,
    channel_account_id,
    COUNT(*) FILTER (
      WHERE status::text IN ('pending','processing','retry')
    )                                      AS messages_pending,
    COUNT(*) FILTER (
      WHERE status::text IN ('failed','dead')
        OR  attempt_count >= max_attempts
    )                                      AS messages_failed,
    COUNT(*) FILTER (WHERE status::text = 'sent') AS messages_sent_total,
    MAX(updated_at) FILTER (WHERE status::text = 'sent') AS last_sent_at
  FROM public.message_dispatch_queue
  GROUP BY company_id, channel_account_id
),
-- Sistema legado: app_integrations
legacy_integrations AS (
  SELECT
    ai.id                                  AS integration_id,
    ai.company_id,
    ai.provider,
    NULL::uuid                             AS channel_account_id,
    'whatsapp'::text                       AS channel_type,
    COALESCE(ai.profile_name, ai.phone, ai.instance_id) AS display_name,
    ai.phone                               AS identifier,
    ai.status                              AS channel_status,
    ai.is_connected,
    ai.last_connected_at,
    ai.last_disconnect_reason,
    ai.updated_at                          AS last_status_at,
    'app_integrations'::text               AS source_table
  FROM public.app_integrations ai
),
-- Sistema novo: channel_accounts
new_channels AS (
  SELECT
    ca.id                                  AS integration_id,
    ca.company_id,
    ca.provider,
    ca.id                                  AS channel_account_id,
    ca.channel_type::text                  AS channel_type,
    ca.display_name,
    ca.external_account_id                 AS identifier,
    ca.status                              AS channel_status,
    (ca.status = 'active')                 AS is_connected,
    NULL::timestamptz                      AS last_connected_at,
    NULL::text                             AS last_disconnect_reason,
    ca.updated_at                          AS last_status_at,
    'channel_accounts'::text               AS source_table
  FROM public.channel_accounts ca
),
all_integrations AS (
  SELECT * FROM legacy_integrations
  UNION ALL
  SELECT * FROM new_channels
)
SELECT
  ai.integration_id,
  ai.company_id,
  co.name                                AS company_name,
  ai.provider,
  ai.channel_type,
  ai.display_name,
  ai.identifier,
  ai.channel_status,
  ai.is_connected,
  ai.last_connected_at,
  ai.last_disconnect_reason,
  ai.last_status_at,
  ai.source_table,
  -- Métricas operacionais (7 dias) — via channel_account_id
  COALESCE(wh.total_webhooks_7d,  0)     AS webhooks_received_7d,
  COALESCE(wh.failed_webhooks_7d, 0)     AS webhooks_failed_7d,
  CASE
    WHEN COALESCE(wh.total_webhooks_7d, 0) > 0
    THEN ROUND(
      100.0 * COALESCE(wh.failed_webhooks_7d, 0) / wh.total_webhooks_7d, 1
    )
    ELSE NULL
  END                                    AS webhook_failure_rate_pct,
  wh.last_webhook_at,
  -- Fila de envio
  COALESCE(ds.messages_pending,    0)    AS messages_pending,
  COALESCE(ds.messages_failed,     0)    AS messages_failed,
  COALESCE(ds.messages_sent_total, 0)    AS messages_sent_total,
  ds.last_sent_at,
  -- Health score simplificado para alertas
  CASE
    WHEN NOT COALESCE(ai.is_connected, false)           THEN 'disconnected'
    WHEN COALESCE(ds.messages_failed, 0) > 10           THEN 'degraded'
    WHEN COALESCE(wh.total_webhooks_7d, 0) > 0
     AND COALESCE(wh.failed_webhooks_7d, 0)::float
       / wh.total_webhooks_7d > 0.2                     THEN 'degraded'
    WHEN COALESCE(ai.is_connected, false)               THEN 'healthy'
    ELSE                                                     'unknown'
  END                                    AS health_status
FROM all_integrations ai
JOIN  public.companies       co ON co.id = ai.company_id
LEFT JOIN webhook_7d         wh ON wh.channel_account_id = ai.channel_account_id
                                AND wh.company_id         = ai.company_id
LEFT JOIN dispatch_stats     ds ON ds.channel_account_id = ai.channel_account_id
                                AND ds.company_id         = ai.company_id;

COMMENT ON VIEW public.v_integration_health IS
  'Saúde operacional de integrações por empresa. '
  'Combina app_integrations (sistema legado WhatsApp) e channel_accounts (sistema novo). '
  'Métricas operacionais (webhooks, fila) usam janela de 7 dias. '
  'health_status: healthy | degraded | disconnected | unknown.';


-- ============================================================
-- SANITY CHECKS — executar após apply para validação
-- ============================================================
/*
-- 1. v_users_canonical: sem duplicatas
SELECT 'total_users' AS check, COUNT(*) AS v FROM v_users_canonical
UNION ALL SELECT 'unique_ids', COUNT(DISTINCT user_id) FROM v_users_canonical;
-- Esperado: total_users = unique_ids

-- 2. v_memberships_canonical: sem duplicatas de (user_id, company_id)
SELECT 'total' AS check, COUNT(*) AS v FROM v_memberships_canonical
UNION ALL SELECT 'unique_pairs', COUNT(DISTINCT (user_id, company_id)) FROM v_memberships_canonical;
-- Esperado: total = unique_pairs

-- 3. v_kpi_company_daily: soma de new_contacts bate com tabela bruta
SELECT SUM(new_contacts) FROM v_kpi_company_daily;
SELECT COUNT(*) FROM contacts;
-- Esperado: iguais

-- 4. v_pipeline_conversion: total_deals bate com tabela bruta
SELECT SUM(total_deals) FROM v_pipeline_conversion;
SELECT COUNT(*) FROM deals;
-- Esperado: iguais

-- 5. v_integration_health: total bate com soma das fontes
SELECT COUNT(*) FROM v_integration_health;
SELECT COUNT(*) FROM app_integrations;
SELECT COUNT(*) FROM channel_accounts;
-- Esperado: view = app_integrations + channel_accounts
*/
