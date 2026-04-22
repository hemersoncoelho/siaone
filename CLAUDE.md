# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com o código deste repositório.

## Visão Geral do Projeto

Sia One é um CRM SaaS multi-tenant construído com React + Supabase. Não há backend tradicional — toda a lógica de negócio roda pelo Supabase (PostgreSQL + Auth + Realtime + Edge Functions). O frontend fica em `frontend/` e as Edge Functions em `supabase/functions/`.

## Comandos de Desenvolvimento

Todos os comandos rodam a partir de `frontend/`:

```bash
npm run dev       # Inicia o servidor de desenvolvimento em http://localhost:5173
npm run build     # Checagem TypeScript (tsc -b) + build de produção com Vite
npm run lint      # Verificação com ESLint
npm run preview   # Preview do build de produção localmente
```

Sem suite de testes — o projeto usa testes manuais e checklists de auditoria (`AUDITORIA_*.md`).

## Arquitetura

### Stack de Tecnologias
- **Frontend:** React 19, React Router 7, TypeScript 5.9, Vite 8, Tailwind CSS 4, Recharts
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Edge Functions no runtime Deno)
- **API Externa:** UAZAPI (`https://simplifique.uazapi.com`) para integração com WhatsApp
- **Automação:** Workflows n8n (exports JSON em `frontend/`) para orquestração de agentes de IA e processamento de mensagens

### Multi-Tenancy e Autenticação
Usuários pertencem a uma ou mais empresas. O banco de dados aplica isolamento por tenant em todas as camadas:
- **Políticas RLS** em todas as tabelas — queries são automaticamente escopadas para a empresa do usuário
- **Papéis:** `system_admin`, `platform_admin`, `company_admin`, `manager`, `agent`, `viewer`
- **Impersonação:** Modo suporte permite que admins atuem como outra empresa (TenantContext)

### Gerenciamento de Estado (Context API)
Três contextos globais envolvem o app em `main.tsx`:
- `AuthContext` — sessão, perfil do usuário, `effectiveUser` (suporta impersonação)
- `TenantContext` — empresa ativa, empresas disponíveis, papel do usuário na empresa, flag de modo suporte
- `ThemeContext` — alternância dark/light

Sempre use `TenantContext.currentCompany.id` para obter o ID da empresa ativa — nunca use um ID hardcoded ou derivado da URL.

### Roteamento e Guards
Definidos em `frontend/src/routes/AppRoutes.tsx`. Páginas pesadas são carregadas com lazy load via `React.lazy` + `Suspense` (fallback PageSkeleton). Componentes guard em `routes/Guards.tsx`:
- `<ProtectedRoute>` — exige sessão válida
- `<ProtectedRoute allowedRoles={[...]}>` — seções restritas por papel
- `<AgentRestrictedRoute>` — bloqueia o papel `agent` em determinadas páginas

### Organização de Componentes
- `components/ui/` — primitivos reutilizáveis (botões, modais, inputs)
- `components/Inbox/`, `components/Pipeline/`, `components/AiAgents/`, etc. — componentes agrupados por feature
- `lib/utils.ts` exporta `cn(...classes)` (clsx + tailwind-merge) — use para todas as classes condicionais do Tailwind
- Tipos TypeScript centralizados em `src/types.ts`

### Temas (Dark/Light)
Use classes CSS Tailwind baseadas em variáveis (`bg-background`, `text-primary`, `border-border`, etc.) — nunca cores hexadecimais hardcoded. O ThemeContext alterna a classe `dark` no `<html>`.

### Padrão de Busca de Dados
1. **Leituras simples:** `supabase.from('table').select(...)` — RLS cuida do escopo por tenant automaticamente
2. **Mutações complexas:** `supabase.rpc('rpc_function_name', { p_param: value })` — lógica server-side com operações atômicas
3. **Operações sensíveis:** `supabase.functions.invoke('function-name', { body })` — Edge Functions para chamadas UAZAPI e criação de membros
4. **Tempo real:** Assinaturas Supabase Realtime nas tabelas `conversations` e `messages` no Inbox

### Migrações SQL
Arquivos `.sql` em `frontend/supabase-migrations/` — aplicados manualmente via Supabase Dashboard (SQL Editor) ou `supabase db push`. Não existe pipeline de migração automatizado.

### Backoffice Admin
Seção `/admin` acessível apenas para `system_admin` e `platform_admin`. Usa `AdminShell` separado do `AppShell` principal. Páginas: CompaniesList, CompanyDetails, UsersList, SupportPanel.

O `UsersList` inclui modal de criação de usuário que chama a Edge Function `create-platform-user` — exige vínculo com uma empresa obrigatoriamente.

### Compatibilidade Vite/OXC
O Vite 8 usa o parser OXC que é mais restrito que o `tsc`:
- **Proibido:** misturar `??` e `||` sem parênteses — use `(a ?? b) || c`
- **Proibido:** declarar `type` alias dentro do corpo de funções ou componentes — declare sempre no escopo de módulo
- Sempre rode `npx tsc --noEmit` após mudanças em TypeScript; o OXC pode rejeitar padrões que o `tsc` aceita

### Edge Functions
Localizadas em `supabase/functions/`. Cada função:
- Valida o JWT do usuário via header `Authorization`
- Usa `SUPABASE_SERVICE_ROLE_KEY` para operações administrativas (bypass de RLS quando necessário)
- Recebe credenciais UAZAPI via secrets do Supabase (`UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`)

| Função | Propósito |
|--------|-----------|
| `uazapi-connector` | Gerenciamento de canais WhatsApp (conectar/desconectar instâncias) |
| `send-whatsapp-message` | Envio de mensagens via UAZAPI |
| `create-member` | Convite e criação de membros na empresa (requer `company_id` + caller ser `company_admin`) |
| `create-platform-user` | Criação de usuário de plataforma com vínculo obrigatório a empresa (requer caller ser `platform_admin`) |

### Funções RPC Principais
| RPC | Propósito |
|-----|-----------|
| `rpc_get_inbox_conversations` | Conversas paginadas com filtros |
| `rpc_create_contact_and_conversation` | Criação atômica de contato + conversa |
| `rpc_persist_inbound_message` | Salva mensagem recebida do n8n, respeita attendance_mode |
| `rpc_enqueue_outbound_message` | Enfileira mensagem para envio via UAZAPI |
| `rpc_mark_conversation_read` | Zera contador de não lidos |
| `rpc_assign_conversation` | Atribui conversa a um agente |
| `rpc_close_conversation` | Fecha conversa com evento de auditoria |
| `rpc_set_conversation_attendance` | Alterna entre modo human/ai/hybrid e vincula agente |
| `rpc_update_deal_stage` | Move deal no pipeline |
| `rpc_mark_deal_won` | Fecha deal como Ganho: `status='won'`, `closed_at=now()` |
| `rpc_mark_deal_lost` | Fecha deal como Perdido: `status='lost'`, `loss_reason`, `closed_at=now()` |
| `rpc_update_deal_details` | Atualiza título e/ou valor de um deal (COALESCE — null preserva valor atual) |
| `rpc_ensure_prospeccao_deal` | Cria automaticamente deal de prospecção em nova conversa |
| `rpc_update_contact_lead_metadata` | Atualiza campos de qualificação do lead |
| `rpc_save_ai_agent` | Upsert de configuração do agente de IA (nome, model, system_prompt, scope) |
| `rpc_toggle_ai_agent` | Ativa/desativa agente de IA |
| `rpc_invite_member` | Convida usuário para empresa com papel definido |

### Principais Tabelas do Banco
| Tabela | Propósito |
|--------|-----------|
| `companies` | Tenants |
| `user_profiles` | Perfil do usuário: `id`, `full_name`, `avatar_url`, `system_role` (enum `app_role`) |
| `user_companies` | Vínculo usuário-empresa-papel (`role_in_company`) |
| `contacts` / `contact_identities` | Contatos do CRM; identidades vinculam telefone/email ao contato |
| `conversations` / `messages` | Hub do Inbox; conversas possuem `attendance_mode` (human/ai/hybrid) |
| `channel_events_raw` | Eventos brutos recebidos da UAZAPI, processados pelo n8n |
| `app_integrations` | Credenciais do canal WhatsApp por empresa |
| `pipelines` / `pipeline_stages` / `deals` | Pipeline do CRM |
| `tasks` | Tarefas vinculadas a contatos/deals |
| `teams` | Times de agentes dentro de uma empresa |
| `ai_agents` | Configuração do agente de IA por empresa (model, system_prompt, scope, is_active) |
| `ai_agent_bindings` | Vincula agentes de IA a canais ou conversas específicas |
| `audit_logs` | Trilha de auditoria imutável |
| `kpi_company_daily_snapshots` | Snapshots diários de KPIs para analytics |

### Modelo de Deal (Pipeline)
A tabela `deals` suporta o ciclo de vida completo de um negócio:
- **`status`** — enum `app_role`: `open` | `won` | `lost`
- **`closed_at`** — timestamp preenchido por `rpc_mark_deal_won` / `rpc_mark_deal_lost`
- **`loss_reason`** — texto opcional, preenchido ao marcar como perdido
- **`conversation_id`** — link direto à conversa; usado pelo Inbox para buscar o deal vinculado
- Deals ganhos/perdidos **não aparecem** no filtro "Ativos" do Pipeline; use os filtros "Ganhos" / "Perdidos"

**UI de ganho/perda disponível em dois lugares:**
1. `DealDetailPanel` (Pipeline) — seção "Fechar Negócio" com confirmação inline; só exibida quando `deal.status === 'open'`
2. `ConversationDetail` (Inbox) — seção "Negócios" no sidebar; busca o deal por `conversation_id` (fallback: `contact_id + status=open`)

### Views Analíticas
| View | Propósito |
|------|-----------|
| `v_inbox_conversations` | Lista de conversas enriquecida com contato, agente e campos de IA |
| `v_company_kpis` | KPIs agregados por empresa |
| `v_kpi_company_daily` | Série temporal diária de KPIs |
| `v_pipeline_conversion` | Taxas de conversão por etapa do funil |
| `v_agent_performance` | Métricas de resposta por agente |
| `v_cohort_retention` | Retenção de contatos por coorte |
| `v_integration_health` | Status da integração WhatsApp por empresa |
| `v_memberships_canonical` | View achatada de usuário-empresa-papel |
| `v_users_canonical` | Todos os usuários com sua empresa principal |

## Módulo de Agentes de IA

Agentes de IA são configurados por empresa na tabela `ai_agents` e orquestrados via n8n:

- **`is_active`** — ativa/desativa o agente (via `rpc_toggle_ai_agent`)
- **`is_published`** — false = modo rascunho/teste apenas
- **`system_prompt`** — mensagem de sistema completa injetada no LLM
- **`model`** — string do modelo OpenAI (ex: `gpt-4o-mini`, `gpt-4.1-mini`)
- **`provider`** — enum: `openai`, `anthropic`, `google`, `custom`
- **`scope`** — JSONB: `{ channels: [], auto_reply: bool }`
- **`handoff_keywords`** / **`handoff_after_mins`** — gatilhos para transferência ao humano

Conversas carregam `attendance_mode` (`human` | `ai` | `hybrid`) e `ai_agent_id` para roteamento das mensagens.

## Workflows n8n (Orquestração de IA)

Três workflows formam o pipeline completo de mensagens com IA (exports JSON em `frontend/`):

| Arquivo | Workflow | Papel |
|---------|----------|-------|
| `[Sia One] [Messages].json` | Messages | Recebe webhook da UAZAPI → normaliza → salva em `channel_events_raw` |
| *(workflow buffer)* | Buffer | Debounce de mensagens rápidas, agrupa em uma única invocação de IA |
| `[Sia One] [IA - Comercial].json` | IA - Comercial | Busca config do agente no Supabase → executa LLM → envia resposta via UAZAPI |

**Fluxo do IA - Comercial:**
1. Acionado pelo workflow buffer com `{ role, content, company_id, message, sender_name }`
2. **`Buscar IA no Supabase`** — consulta `ai_agents` filtrado por `company_id`, `is_active=true`, `is_published=true`
3. **`message`** — formata role/content para entrada no LLM
4. **`Valeria1`** (LangChain Agent) — usa `system_prompt` e `model` buscados dinamicamente no passo 2
5. Divide a resposta em partes → envia cada parte via UAZAPI com 2s de intervalo entre mensagens
6. Salva mensagem do assistente e atualiza memória de longo prazo

## Variáveis de Ambiente

Frontend (`frontend/.env`):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Edge Functions usam `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN` e `SUPABASE_SERVICE_ROLE_KEY` definidos como secrets do Supabase (não no `.env`).

## Problemas Conhecidos
1. `NewConversationModal` passa `user.id` como `p_agent_id` — deve passar `null` ou um ID de agente válido

## Convenções de Commit
Commits seguem os prefixos `feat:`, `fix:`, `refactor:`. Mensagens de commit são escritas em português.
