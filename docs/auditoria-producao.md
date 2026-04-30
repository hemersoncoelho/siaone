# Auditoria de Produção — Sia One
Data: 2026-04-23
Versão auditada: branch main, commit 90d357a

---

## Resumo Executivo

### Pontuação por eixo
| Eixo | Críticos 🔴 | Altos 🟠 | Médios 🟡 | Baixos 🟢 |
|------|-------------|---------|----------|---------|
| Segurança | 3 | 4 | 3 | 2 |
| Qualidade | 0 | 3 | 5 | 4 |
| Performance | 0 | 4 | 4 | 2 |

### Veredicto
- [x] ⚠️ Pronto com ressalvas

O sistema está funcional e a maior parte dos controles de segurança está no lugar. Existem três brechas críticas que precisam ser resolvidas antes de receber tráfego real de produção (RPCs sem auth expostas a `anon`, token padrão hardcoded e `channel_events_raw` sem RLS). O restante dos problemas é de qualidade e performance e pode ser tratado nas primeiras semanas em operação.

### Top 5 problemas mais urgentes
1. **RPCs `rpc_save_ai_message` e `rpc_save_human_message` com `GRANT EXECUTE TO anon`** — qualquer pessoa sem autenticação pode chamar essas funções SECURITY DEFINER e gravar mensagens em qualquer empresa.
2. **`channel_events_raw` com RLS desabilitado via `DISABLE ROW LEVEL SECURITY`** — toda a tabela de payloads brutos de webhook está acessível sem restrição por qualquer role, incluindo `anon`.
3. **Fallback `'mock_admin_token_replace_in_secrets'` em `uazapi-connector/index.ts:69`** — se o secret `UAZAPI_ADMIN_TOKEN` não estiver configurado, o código usa um token placeholder em produção, o que pode resultar em erros silenciosos ou falsa sensação de segurança.
4. **`NewConversationModal` passa `user.id` como `p_agent_id`** — o ID do usuário autenticado (que é um `user_profile.id`) é enviado como agente. A RPC verifica se esse ID pertence à empresa via `user_companies`; se o usuário autenticado for um `system_admin` operando em modo suporte, a verificação falhará e a conversa será criada sem agente, silenciosamente.
5. **Mensagens sem paginação em `ConversationDetail.tsx:730`** — `SELECT * FROM messages WHERE conversation_id = X` sem `LIMIT` retorna todas as mensagens de uma conversa. Em conversas longas isso pode travar o browser e sobrecarregar o banco.

---

## EIXO 1 — SEGURANÇA

### 1.1 Tabelas e RLS

| Tabela | RLS Ativo | SELECT | INSERT | UPDATE | DELETE | Observação |
|--------|-----------|--------|--------|--------|--------|------------|
| `companies` | S | S | S | N | N | INSERT só para platform_admin (backend_companies_insert_policy.sql); UPDATE/DELETE ausentes — bloqueiam por padrão (safe) |
| `user_profiles` | S | S | S (trigger) | S | N | UPDATE só para próprio usuário; DELETE ausente (safe) |
| `user_companies` | S | S | S | N | N | INSERT policy para company_admin existe; UPDATE/DELETE ausentes |
| `contacts` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() |
| `conversations` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() |
| `messages` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() ou via conversations |
| `contact_identities` | S | S (via ALL) | S | S | S | Policy FOR ALL via contacts join |
| `deals` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() |
| `tasks` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() |
| `app_integrations` | S | S | N | N | N | INSERT/UPDATE só via Edge Function (service_role) — by design; OK |
| `ai_agents` | S | S (via ALL) | S | S | S | Policy via user_companies; não usa is_company_member() — pode bloquear company_memberships |
| `ai_agent_bindings` | S | S (via ALL) | S | S | S | Mesmo problema que ai_agents |
| `pipelines` | S | S | S | S | S | Políticas granulares por operação |
| `pipeline_stages` | S | S | S | S | S | Políticas granulares via join com pipelines |
| `teams` | S | S | S | S (?) | S (?) | UPDATE/DELETE não encontrado explicitamente nas migrações — verificar no banco |
| `schedules` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() |
| `service_types` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() |
| `appointments` | S | S (via ALL) | S | S | S | Policy FOR ALL com is_company_member() |
| `audit_logs` | S | S | S | N | N | INSERT/SELECT apenas platform_admin; política usa subconsulta inline em user_profiles (potencial recursão — não corrigida por FIX_rls_infinite_recursion.sql) |
| `channel_events_raw` | **N** | — | — | — | — | **CRÍTICO: RLS desabilitado explicitamente em fix_channel_events_raw_rls.sql:18** |
| `subscription_plans` | S | S | S | S | S | Leitura para qualquer autenticado; admin manage |
| `company_subscriptions` | S | S | S | S | S | Apenas platform_admin |
| `company_invites` | S | S | S | N | N | UPDATE/DELETE ausentes |
| `kpi_company_daily_snapshots` | Não verificável | — | — | — | — | Não encontrada definição de RLS nas migrações |

**Problemas encontrados:**

**🔴 CRÍTICO — `channel_events_raw` sem RLS**
Arquivo: `frontend/supabase-migrations/fix_channel_events_raw_rls.sql:18`
O comando `ALTER TABLE public.channel_events_raw DISABLE ROW LEVEL SECURITY` foi aplicado como solução para um problema operacional. A tabela armazena todos os payloads brutos recebidos do UAZAPI (números de WhatsApp, conteúdo de mensagens, metadados). Com RLS desabilitado, qualquer client com a chave `anon` pode fazer SELECT de todo o histórico de webhooks de todos os tenants.

**🟠 ALTO — `ai_agents` e `ai_agent_bindings` não usam `is_company_member()`**
Arquivo: `frontend/supabase-migrations/backend_ai_agents.sql:46-53`
A policy foi criada com `EXISTS (SELECT 1 FROM user_companies uc WHERE ...)` em vez de `is_company_member()`. Usuários provisionados via `company_memberships` (fluxo pós-consolidação Etapa 2) não conseguem ver ou editar agentes de IA da empresa.

**🟡 MÉDIO — `audit_logs` usa subconsulta inline em user_profiles**
Arquivo: `frontend/supabase-migrations/supabase_audit.sql:18`
A policy de INSERT/SELECT consulta `user_profiles` inline, padrão que foi identificado como causa de recursão infinita e corrigido em outras tabelas via `is_platform_admin()`. Esta correção não foi aplicada em `audit_logs`.

**🟢 BAIXO — `company_invites` sem UPDATE/DELETE**
Arquivo: `frontend/supabase-migrations/backend_invite_and_teams.sql:18`
Convites pendentes não podem ser deletados ou expirados via queries diretas. Aceitável se o fluxo é feito via RPC, mas não documentado.

---

### 1.2 RPCs e Edge Functions

**🔴 CRÍTICO — `rpc_save_ai_message` e `rpc_save_human_message` expostas a `anon`**
Arquivos:
- `frontend/supabase-migrations/rpc_save_ai_message.sql:118`
- `frontend/supabase-migrations/rpc_save_human_message.sql:129-130`

```sql
GRANT EXECUTE ON FUNCTION public.rpc_save_ai_message(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_human_message(...) TO anon, authenticated, service_role;
```

Ambas são `SECURITY DEFINER` e recebem `p_company_id` como parâmetro sem verificar se o caller tem relação com essa empresa. Um atacante sem autenticação pode chamar essas funções com qualquer `company_id` e inserir mensagens falsas no Inbox de qualquer tenant. Isso também abre vetor para pollution de dados e contaminação do histórico de conversa.

**Motivação do grant:** necessário porque o n8n chama essas RPCs com `anon` key (sem JWT de usuário). Porém a solução correta é usar `service_role` key no n8n, não expor para `anon`.

**🔴 CRÍTICO — `rpc_get_company_integration` retorna `instance_token` para `anon`**
Arquivo: `frontend/supabase-migrations/rpc_get_company_integration.sql:40-41`

```sql
GRANT EXECUTE ON FUNCTION public.rpc_get_company_integration(UUID) TO anon, authenticated, service_role;
```

Esta RPC retorna `instance_id` e `instance_token` (credencial de acesso ao WhatsApp da empresa). Qualquer pessoa sem autenticação que conheça um `company_id` válido obtém o token de integração WhatsApp, permitindo enviar mensagens em nome da empresa.

**🟠 ALTO — `rpc_mark_deal_won` e `rpc_mark_deal_lost` usam `SECURITY INVOKER`**
Arquivo: `frontend/supabase-migrations/rpc_mark_deal_won_lost.sql:13` e `:53`

```sql
CREATE OR REPLACE FUNCTION public.rpc_mark_deal_won(...) LANGUAGE plpgsql SECURITY INVOKER
```

Com `SECURITY INVOKER`, a função roda com as permissões do caller e as políticas RLS se aplicam. O caller precisa ter permissão de UPDATE na tabela `deals`. Isso é seguro desde que as políticas RLS de deals estejam corretas, mas é inconsistente com o padrão do projeto (todas as outras RPCs usam `SECURITY DEFINER` com verificação explícita). Não há validação de que o caller é membro da empresa — a validação acontece apenas via RLS.

**🟠 ALTO — `rpc_update_deal_details` usa `SECURITY INVOKER` sem auth check**
Arquivo: `frontend/supabase-migrations/rpc_update_deal_details.sql:11`

Mesmo problema que acima — `security invoker` sem verificação explícita de autenticação.

**🟠 ALTO — RPCs de agenda sem `GRANT EXECUTE` explícito**
Arquivo: `frontend/supabase-migrations/rpc_agenda.sql`

As funções `rpc_get_available_slots`, `rpc_create_appointment`, `rpc_cancel_appointment`, `rpc_reschedule_appointment` são `SECURITY DEFINER` mas não têm `GRANT EXECUTE` explícito no arquivo. Por padrão, apenas o owner (superuser) pode executá-las. Se o n8n precisar chamar essas funções, elas estarão inacessíveis. O frontend as chama com JWT de usuário (authenticated role), que pode funcionar dependendo do grant default do Supabase.

**🟠 ALTO — CORS wildcard `'*'` em todas as Edge Functions**
Arquivos:
- `supabase/functions/uazapi-connector/index.ts:8`
- `supabase/functions/create-member/index.ts:9`
- `supabase/functions/create-platform-user/index.ts:9`
- `supabase/functions/send-whatsapp-message/index.ts:9`

```typescript
'Access-Control-Allow-Origin': '*',
```

Em produção, o CORS deve ser restrito ao domínio do frontend (ex: `https://siaone.vercel.app`). Com wildcard, qualquer origem pode chamar as Edge Functions diretamente.

**🟡 MÉDIO — `rpc_resolve_company_by_token` e `rpc_get_active_ai_agent` expostas a `anon`**
Arquivo: `frontend/supabase-migrations/backend_n8n_agent_lookup.sql:38,71`

As funções são `SECURITY DEFINER` e retornam informações de configuração interna (company_id, system_prompt, model). Expostas para `anon` para viabilizar o n8n. Impacto menor porque não modificam dados, mas `rpc_get_active_ai_agent` retorna o `system_prompt` completo — que pode conter instruções confidenciais de negócio.

**🟡 MÉDIO — `findUserByEmailViaGoTrue` faz paginação linear em `create-member/index.ts`**
Arquivo: `supabase/functions/create-member/index.ts:41-63`

Ao tentar vincular um usuário existente, a função pagina até 2.000 usuários (20 páginas × 100) chamando a GoTrue Admin API em loop síncrono. Com muitos usuários cadastrados na plataforma, isso pode causar timeout (o Supabase Edge Functions tem timeout de 30s) ou lentidão perceptível.

**🟢 BAIXO — `create-platform-user` usa `setTimeout(600)` para aguardar trigger**
Arquivo: `supabase/functions/create-platform-user/index.ts:92`

```typescript
await new Promise(resolve => setTimeout(resolve, 600));
```

Aguarda 600ms na esperança de que o trigger `handle_new_user` tenha processado o `user_profiles`. Race condition: se o banco estiver lento, a atualização subsequente de `system_role` não encontrará o perfil e falhará silenciosamente (sem verificação de erro do `update`).

---

### 1.3 Frontend — Exposição de dados

**🟠 ALTO — Token fallback hardcoded em Edge Function**
Arquivo: `supabase/functions/uazapi-connector/index.ts:69`

```typescript
const uazapiAdminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN') || 'mock_admin_token_replace_in_secrets';
```

Se o secret `UAZAPI_ADMIN_TOKEN` não estiver configurado na instância Supabase, o código usa o placeholder como token real. Em produção, isso resulta em chamadas à UAZAPI com token inválido sem qualquer alerta claro ao desenvolvedor.

**🟡 MÉDIO — `localStorage` armazena dados de empresa**
Arquivo: `frontend/src/contexts/TenantContext.tsx:26-31`

```typescript
const stored = localStorage.getItem(STORAGE_KEY);
return stored ? JSON.parse(stored) : null;
```

O objeto `Company` (id, name) é serializado no localStorage com a chave `siaone-current-company`. Dados de nome de empresa são expostos para qualquer script na mesma origem. XSS em qualquer dependência comprometeria esses dados. Impacto baixo dado que só contém id e name, mas é um padrão a observar.

**🟢 BAIXO — Queries Supabase sem filtro explícito de `company_id` em alguns pontos**
A proteção via RLS é suficiente, mas queries como `supabase.from('v_company_kpis').select(...).eq('company_id', currentCompany.id)` em `Dashboard.tsx:631` mostram boa prática. Há pontos onde o filtro poderia ser omitido (ex: queries via `rpc` onde a RLS cuida do isolamento), o que é correto pelo design mas pode confundir revisores.

---

### 1.4 Autenticação e sessão

**🟡 MÉDIO — Logout não invalida tokens Supabase ativos no servidor**
Arquivo: `frontend/src/contexts/AuthContext.tsx:188-196`

```typescript
const logout = async () => {
    ...
    await supabase.auth.signOut();
```

O `signOut()` invalida a sessão localmente e no Supabase. Porém, tokens JWT já emitidos continuam válidos até expirar (padrão Supabase: 1 hora). Em cenários de comprometimento de sessão, o admin não consegue invalidar imediatamente. Isso é limitação do Supabase Auth e não um bug do código.

**🟢 BAIXO — `SIGNED_IN` tratado como token refresh em vez de login em TenantContext**
Arquivo: `frontend/src/contexts/TenantContext.tsx:44-49`

O Supabase emite `SIGNED_IN` tanto no login quanto no token refresh. A solução atual verifica a presença de `localStorage` para distinguir. Funciona na prática, mas é frágil: se o localStorage for limpo por outra tab ou por uma política do browser, o usuário perderá a seleção de empresa e será redirecionado para `/select-company` mesmo estando autenticado.

---

### 1.5 Webhooks e integrações

**🟡 MÉDIO — Webhook da UAZAPI não valida token de origem**
A UAZAPI envia payloads para o endpoint do n8n. Não há evidência de validação de um `x-webhook-secret` ou similar nos workflows n8n (os arquivos JSON de workflow não foram exportados para todos os casos). O `channel_events_raw` armazena todos os payloads recebidos, mas qualquer origem que conheça a URL do webhook n8n pode inserir dados falsos. Verificar se o workflow n8n valida algum header de autenticação.

---

## EIXO 2 — QUALIDADE

### 2.1 Tratamento de erros

**🟠 ALTO — `fetchTasks` em `ConversationDetail.tsx` ignora erros completamente**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:841-870`

```typescript
const { data } = await supabase.from('tasks').select('...')...
```

O resultado destructuring não captura `error`. Se a query falhar, `data` será `null` e `setTasks([])` não é chamado, deixando o estado de tasks como está (potencialmente stale) sem qualquer feedback ao usuário.

**🟠 ALTO — `fetchCompanyRole` em `TenantContext.tsx` ignora erros**
Arquivo: `frontend/src/contexts/TenantContext.tsx:130-137`

```typescript
const { data } = await supabase.from('user_companies')...maybeSingle();
setCompanyRole((data?.role_in_company as Role) ?? null);
```

Erros de rede ou RLS são silenciados. O companyRole ficará `null`, o que pode afetar guards de rota e fazer o usuário parecer sem permissão.

**🟠 ALTO — `create-platform-user` não verifica erro do `update` em `user_profiles`**
Arquivo: `supabase/functions/create-platform-user/index.ts:95-98`

```typescript
await supabase.from('user_profiles').update({...}).eq('id', userId);
```

O resultado é descartado sem verificação. Se o trigger não tiver criado o perfil ainda (race condition da linha 92), a role será 'agent' em vez da role solicitada, sem qualquer indicação de erro para o chamador.

**🟡 MÉDIO — `fetchInbox` em `Inbox.tsx` captura erro mas só loga no console**
Arquivo: `frontend/src/pages/Inbox.tsx:47-51`

```typescript
} catch (err: any) {
    console.error('Error fetching inbox:', err);
}
```

Nenhuma mensagem é exibida ao usuário. Se o Inbox falhar ao carregar, o usuário verá uma lista vazia sem entender o motivo.

**🟡 MÉDIO — Realtime no Inbox não tem callback de erro**
Arquivo: `frontend/src/pages/Inbox.tsx:64-82`

O `subscribe()` não recebe callback de status. Se a conexão Realtime falhar (ex: limite de conexões atingido), o Inbox ficará estático sem qualquer indicação para o usuário.

**🟡 MÉDIO — `TransferButton.fetchMembers` em `ConversationDetail.tsx` ignora erros**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:167-188`

Queries a `company_memberships` e `user_profiles` não verificam erros. Falha silenciosa resulta em lista de membros vazia sem feedback.

**🟢 BAIXO — `uazapi-connector` sempre retorna HTTP 200 mesmo em erros**
Arquivo: `supabase/functions/uazapi-connector/index.ts:57,63`

```typescript
return new Response(JSON.stringify({ success: false, error: '...' }), { status: 200, ...})
```

Erros de autenticação (401) e validação retornam HTTP 200. Isso confunde clientes e ferramentas de monitoramento que esperam códigos HTTP semânticos.

**🟢 BAIXO — `SlotsPicker` em `Agenda.tsx:71` não verifica erro da RPC**
Arquivo: `frontend/src/pages/Agenda.tsx:71`

```typescript
supabase.rpc('rpc_get_available_slots',...).then(({data}) => { ... setSlots(r?.slots??[]); setLoading(false); });
```

O campo `error` não é verificado. Falha na RPC resulta em lista de slots vazia sem feedback ao usuário.

---

### 2.2 Race conditions e loading states

**🟠 ALTO — `fetchMessages` em `ConversationDetail.tsx` sem cancelamento**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:719-767`

O `useEffect` inicia `fetchMessages()` mas não tem mecanismo de cancelamento. Se o usuário trocar de conversa antes da resposta chegar, o resultado da conversa anterior pode ser aplicado à conversa ativa (stale state). A dependência `[conversation?.conversation_id]` dispara novo fetch, mas o fetch anterior ainda pode resolver depois.

**🟡 MÉDIO — `fetchContacts` em `Contacts.tsx` não cancela fetches anteriores**
Arquivo: `frontend/src/pages/Contacts.tsx:452-487`

Sem `AbortController`. Digitação rápida no filtro de busca pode resultar em múltiplas chamadas concorrentes cujos resultados chegam fora de ordem.

**🟡 MÉDIO — Subscription Realtime de Inbox sem filtro de `company_id`**
Arquivo: `frontend/src/pages/Inbox.tsx:68-80`

```typescript
{ event: 'INSERT', schema: 'public', table: 'messages' }
```

A subscription de `messages` não filtra por `company_id` no nível Realtime. O Supabase filtrará via RLS antes de entregar o evento, mas sem o filtro Realtime explícito, o banco envia o evento para o cliente que então o descarta por RLS. Isso aumenta tráfego desnecessário. Adicionar `filter: 'company_id=eq.{currentCompany.id}'` é a correção.

**🟡 MÉDIO — `useCountUp` em `Dashboard.tsx:136` sem cancelamento de RAF**
Arquivo: `frontend/src/pages/Dashboard.tsx:136-153`

A função cleanup retorna `cancelAnimationFrame`, o que está correto, mas há um caso edge: se `target` mudar enquanto o RAF está rodando (período trocado), dois RAFs podem rodar concorrentemente até o primeiro terminar o ciclo.

---

### 2.3 Consistência de código

**🟠 ALTO — Arquivos acima de 500 linhas (difícil manutenção)**

| Arquivo | Linhas |
|---------|--------|
| `frontend/src/pages/Dashboard.tsx` | 1.528 |
| `frontend/src/components/Inbox/ConversationDetail.tsx` | 1.666 |
| `frontend/src/pages/admin/CompaniesList.tsx` | 1.188 |
| `frontend/src/components/Pipeline/DealDetailPanel.tsx` | 805 |
| `frontend/src/pages/Agenda.tsx` | 495 |
| `frontend/src/pages/AgendaSettings.tsx` | 483 |

`ConversationDetail.tsx` com 1.666 linhas agrupa lógica de mensagens, tarefas, notas, deals, agentes de IA e UI de header em um único componente. `Dashboard.tsx` com 1.528 linhas define 10+ sub-componentes inline.

**🟡 MÉDIO — Bug documentado e não resolvido em `NewConversationModal`**
Arquivo: `frontend/src/components/Inbox/NewConversationModal.tsx:49`

```typescript
p_agent_id: user.id
```

O CLAUDE.md documenta: "NewConversationModal passa `user.id` como `p_agent_id` — deve passar `null` ou um ID de agente válido". O `user.id` é o ID do usuário logado no momento. A RPC `rpc_create_contact_and_conversation` verifica se esse usuário é membro da empresa via `user_companies`/`company_memberships`. Funciona para usuários comuns, mas falha quando o caller é um `system_admin` em modo suporte (sistema admin não está em `user_companies` da empresa do tenant). Nesse caso, a conversa é criada com `assigned_to = system_admin_id`, que não pertence à empresa, corrompendo o dado.

**🟡 MÉDIO — Duplicação da lógica de normalização de mensagem**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:680-716` e `frontend/src/pages/Inbox.tsx`

A função `normalizeMessage` mapeia campos do banco para o tipo `Message` com fallbacks. Essa lógica existe apenas em `ConversationDetail.tsx` mas deveria ser extraída para um utilitário compartilhado.

**🟢 BAIXO — `Agenda.tsx` usa código minificado inline**
Arquivo: `frontend/src/pages/Agenda.tsx:51-53`

```typescript
const getMonthGrid = (y:number,m:number)=>{const fd=new Date(y,m,1),...};
```

Helpers escritos com formatação minificada dificultam leitura e manutenção.

---

### 2.4 TypeScript

**🟡 MÉDIO — Uso de `any` em componentes críticos**

| Local | Uso problemático |
|-------|-----------------|
| `Dashboard.tsx:168` | `const ProfoundTooltip = ({ active, payload, label }: any)` — props do Recharts não tipadas |
| `Dashboard.tsx:708` | `const stage = (d as any).pipeline_stages` — asserção não verificada |
| `ConversationDetail.tsx:701` | `sender_type: senderType as any` — enum cast sem validação |
| `ConversationDetail.tsx:714` | `(m.sender_profile as any)?.full_name` — acesso unsafe |
| `ConversationDetail.tsx:864` | `(t.assigned_to_profile as any)?.full_name` — acesso unsafe |
| `TenantContext.tsx:91` | `companies = data.map((row: any) => row.companies)` — join tipagem perdida |
| `Contacts.tsx:469` | `(data ?? []).map((c: any) => {...})` — mapeamento sem tipo |

**🟡 MÉDIO — Props sem tipagem em Agenda.tsx**
Arquivo: `frontend/src/pages/Agenda.tsx:57-75`

Componentes internos como `Toast`, `Av`, `SlotsPicker`, `ContactSearch` têm props tipadas inline de forma compacta, mas o tipo retornado pela RPC `rpc_get_available_slots` é tratado como `{success: boolean; slots?: Slot[]}` sem validação do campo `success`.

**🟢 BAIXO — `SessionState` inclui `'expired'` mas esse estado nunca é setado**
Arquivo: `frontend/src/types.ts:22`

```typescript
export type SessionState = 'loading' | 'authenticated' | 'unauthenticated' | 'expired';
```

O valor `'expired'` existe no tipo mas o `AuthContext.tsx` nunca o usa — o estado vai direto para `'unauthenticated'`. Dead code no tipo.

---

## EIXO 3 — PERFORMANCE

### 3.1 Índices ausentes

| Tabela | Índice Ausente | Impacto | Severidade |
|--------|---------------|---------|------------|
| `messages` | `(company_id, created_at)` | Dashboard conta mensagens por período com `gte('created_at', since)` — full table scan | 🟠 ALTO |
| `messages` | `(conversation_id, created_at)` | ConversationDetail carrega todas mensagens de uma conversa ordenadas por data; sem índice composto faz seq scan | 🟠 ALTO |
| `conversations` | `(company_id, status)` | KPI de conversas abertas filtra por ambos — sem índice, seq scan em toda a tabela de conversas | 🟠 ALTO |
| `conversations` | `(company_id, last_message_at DESC)` | `rpc_get_inbox_conversations` ordena por `last_message_at DESC` — crítico para a lista do inbox | 🟠 ALTO |
| `contacts` | `(company_id, status)` | Dashboard filtra leads por status e company_id | 🟡 MÉDIO |
| `contact_identities` | `(company_id, channel_type, normalized_value)` | `rpc_persist_inbound_message` busca contato por telefone — lookup crítico em cada mensagem recebida | 🟡 MÉDIO |
| `deals` | `(company_id, status)` | Pipeline e dashboard filtram deals abertos/ganhos/perdidos | 🟡 MÉDIO |
| `deals` | `(company_id, stage_id)` | Busca deals por etapa no pipeline | 🟡 MÉDIO |
| `tasks` | `(company_id, assigned_to_user_id, status)` | Queries de tarefas atrasadas por agente no Dashboard | 🟡 MÉDIO |
| `channel_events_raw` | `(company_id)` | Tabela crescerá rapidamente; sem índice qualquer query por empresa é seq scan | 🟡 MÉDIO |

**Índices existentes notáveis (positivo):**
- `idx_appointments_company_scheduled_at` — presente
- `idx_messages_external_id` — presente (deduplicação UAZAPI)
- `idx_ai_agents_company` — presente
- `idx_kpi_snapshots_company_date` — presente
- `idx_channel_events_raw_unprocessed` — presente

---

### 3.2 Queries problemáticas

**🟠 ALTO — Messages sem paginação em `ConversationDetail.tsx`**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:728-732`

```typescript
await supabase.from('messages').select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
```

Sem `limit()`. Uma conversa com histórico de 6 meses pode ter milhares de mensagens. Carregar tudo de uma vez pode travar o browser e sobrecarregar o banco. Implementar paginação reversa (últimas N mensagens + scroll infinito para cima) é o padrão correto.

**🟠 ALTO — `select('*')` em messages**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:730`

O `select('*')` em `messages` retorna também `raw_provider_payload` (JSONB com o payload bruto de webhook) e `metadata` JSONB, que podem ser grandes e não são usados na Timeline. Selecionar apenas as colunas necessárias reduziria drasticamente o payload.

**🟠 ALTO — Contacts sem paginação**
Arquivo: `frontend/src/pages/Contacts.tsx:458-467`

```typescript
await supabase.from('contacts').select(`id, company_id, full_name, ...`)
    .eq('company_id', currentCompany.id)
    .order('created_at', { ascending: false });
```

Sem `limit()`. Uma empresa com 10.000 contatos carregará todos de uma vez no frontend.

**🟡 MÉDIO — Deals sem paginação**
Arquivo: `frontend/src/pages/Deals.tsx:82-96`

```typescript
let dealsQuery = supabase.from('deals').select('*, contact:contact_id (...), ...')
    .eq('company_id', currentCompany.id)
    .eq('status', statusFilter)
    .order('created_at', { ascending: false });
```

Sem `limit()`. O `select('*')` em `deals` + joins em contato e usuário pode crescer rapidamente.

**🟡 MÉDIO — N+1 implícito no Dashboard fetchKPIs (agent view)**
Arquivo: `frontend/src/pages/Dashboard.tsx:601-618`

Cinco queries paralelas via `Promise.all` — o que é bom. Mas uma delas (`qualifiedDealsRes`) busca todos os `contact_id` de deals abertos sem `limit` e faz um `new Set()` no cliente para contar leads qualificados. Com muitos deals, isso traz todos os IDs para o cliente quando o correto seria fazer `COUNT(DISTINCT contact_id)` no banco.

**🟡 MÉDIO — `fetchMembers` em `TransferButton` faz duas queries sequenciais (N+1 leve)**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:167-188`

Primeiro busca `company_memberships` para obter `user_id[]`, depois faz segundo SELECT em `user_profiles` com `.in('id', ids)`. Uma query com JOIN resolveria em uma única ida ao banco.

**🟢 BAIXO — `rpc_get_inbox_conversations` busca sem filtro de status**
A função retorna conversas de todos os status (open, closed, pending). O frontend filtra por tab depois. Com alto volume, retornar conversas fechadas desnecessariamente aumenta o payload.

---

### 3.3 Realtime

**Subscriptions encontradas:**

| Arquivo | Canal | Tabela | Filtro Realtime | Cleanup |
|---------|-------|--------|-----------------|---------|
| `Inbox.tsx:65-82` | `inbox-messages-{company_id}` | `messages` (INSERT) | **Nenhum** | S (`removeChannel`) |
| `Inbox.tsx:65-82` | `inbox-messages-{company_id}` | `conversations` (UPDATE) | **Nenhum** | S (`removeChannel`) |
| `ConversationDetail.tsx:770-834` | `messages-conv-{conversationId}` | `messages` (INSERT + UPDATE) | `conversation_id=eq.{id}` | S (`removeChannel`) |

**Problemas:**

**🟡 MÉDIO — Subscription de `messages` no Inbox sem filtro de `company_id`**
Arquivo: `frontend/src/pages/Inbox.tsx:69-73`

```typescript
{ event: 'INSERT', schema: 'public', table: 'messages' }
```

Sem `filter: 'company_id=eq.{company}'`. O Supabase Realtime filtra via RLS antes de entregar ao cliente, mas envia o evento para o servidor analisar mesmo assim. Em alta escala, qualquer INSERT na tabela `messages` de qualquer tenant acorda o canal para analisar se deve ser entregue a esse subscriber. Adicionar filtro Realtime explícito reduz carga no servidor.

**🟢 BAIXO — Subscription de conversas sem filtro de `company_id`**
Arquivo: `frontend/src/pages/Inbox.tsx:74-77`

Mesmo problema para UPDATE em `conversations`.

**Pontos positivos:**
- `ConversationDetail.tsx` tem filtro por `conversation_id` no Realtime — correto.
- Todos os canais têm cleanup via `supabase.removeChannel(channel)` no retorno do `useEffect`.

---

### 3.4 Estimativa de capacidade

**Cenário A — Pequeno (até 100 tenants)**
- Sistema funciona bem com o código atual.
- As queries sem paginação são aceitáveis (poucos registros por empresa).
- A falta de índices em `messages(conversation_id, created_at)` começa a aparecer em conversas longas.
- Realtime sem filtro é estável.
- **Recomendação:** adicionar índices críticos antes de atingir 50 tenants ativos.

**Cenário B — Médio (100–1.000 tenants)**
- `Contacts.tsx` sem paginação começa a ser um problema: empresas com 1.000+ contatos travam o browser.
- `messages` sem paginação torna-se crítico: conversas com histórico de 3+ meses carregam segundos.
- Realtime sem filtro de `company_id` gera carga no servidor Supabase Realtime que cresce O(tenants × eventos).
- `channel_events_raw` sem índice em `company_id` e sem particionamento começa a acumular milhões de linhas.
- A função `rpc_get_inbox_conversations` (que retorna todas as conversas abertas + fechadas) passa a ser gargalo sem índice em `(company_id, last_message_at DESC)`.
- **Recomendação:** paginação obrigatória, filtros Realtime, índices todos aplicados.

**Cenário C — Grande (1.000–10.000 tenants)**
- `channel_events_raw` precisa de particionamento por data ou estratégia de TTL/archival (tabela pode atingir bilhões de linhas).
- As views analíticas (`v_pipeline_conversion`, `v_agent_performance`) fazem full scan de deals/messages sem materialização. Precisam de `MATERIALIZED VIEW` com refresh periódico.
- O Admin KPI global (`rpc_get_admin_kpi_global`) faz COUNT de todas as conversas/deals do sistema — query global que não escala; precisa de snapshot periódico.
- Subscriptions Realtime atingem o limite de conexões do plano Supabase Pro (500 conexões simultâneas).
- O `findUserByEmailViaGoTrue` com paginação linear é impraticável com 100k+ usuários.
- **Recomendação:** arquitetura de snapshot, filas de eventos, particionamento, CDN para mídias.

---

## Plano de ação recomendado

### Fase 1 — Antes do go-live (obrigatório)

**SEG-01 🔴 Revogar `GRANT TO anon` das RPCs de gravação**
```sql
-- Aplicar no Supabase SQL Editor:
REVOKE EXECUTE ON FUNCTION public.rpc_save_ai_message(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_save_human_message(UUID, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_get_company_integration(UUID) FROM anon;
```
Reconfigurar o n8n para usar `service_role` key em vez de `anon` key ao chamar essas RPCs.
Arquivos: `frontend/supabase-migrations/rpc_save_ai_message.sql:118`, `rpc_save_human_message.sql:129`, `rpc_get_company_integration.sql:40`

**SEG-02 🔴 Reabilitar RLS em `channel_events_raw`**
```sql
ALTER TABLE public.channel_events_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel_events_raw_service_only" ON public.channel_events_raw
  FOR ALL USING (false)  -- bloqueia todos os roles client-side
  WITH CHECK (false);
```
O n8n usa `service_role` (bypassa RLS por design). Arquivo: `frontend/supabase-migrations/fix_channel_events_raw_rls.sql:18`

**SEG-03 🔴 Remover fallback do token UAZAPI**
Arquivo: `supabase/functions/uazapi-connector/index.ts:69`
```typescript
// ANTES:
const uazapiAdminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN') || 'mock_admin_token_replace_in_secrets';
// DEPOIS:
const uazapiAdminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN');
if (!uazapiAdminToken) {
  return new Response(JSON.stringify({ success: false, error: 'UAZAPI_ADMIN_TOKEN não configurado.' }), { status: 500, ... });
}
```

**SEG-04 🟠 Restringir CORS nas Edge Functions**
Substituir `'Access-Control-Allow-Origin': '*'` pelo domínio de produção em todas as 4 Edge Functions.

**SEG-05 🟠 Corrigir bug `p_agent_id: user.id` em NewConversationModal**
Arquivo: `frontend/src/components/Inbox/NewConversationModal.tsx:49`
Substituir por `p_agent_id: null` ou pelo ID correto de um agente selecionado pelo usuário.

**PERF-01 🟠 Criar índices críticos ausentes**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_date
  ON public.messages(conversation_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_company_date
  ON public.messages(company_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_status
  ON public.conversations(company_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_last_msg
  ON public.conversations(company_id, last_message_at DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_identities_lookup
  ON public.contact_identities(company_id, channel_type, normalized_value);
```

**PERF-02 🟠 Adicionar paginação em mensagens**
Arquivo: `frontend/src/components/Inbox/ConversationDetail.tsx:728-732`
Limitar a `100` mensagens e implementar scroll infinito reverso. Trocar `select('*')` por lista explícita de colunas excluindo `raw_provider_payload`.

---

### Fase 2 — Primeira semana em produção

**SEG-06 🟠 Corrigir políticas RLS de `ai_agents` e `ai_agent_bindings`**
Substituir a subconsulta a `user_companies` por `is_company_member()` para suportar ambos os fluxos de membros.

**SEG-07 🟠 Adicionar verificação de erro em `create-platform-user`**
Arquivo: `supabase/functions/create-platform-user/index.ts:95-98`
Verificar o retorno do `update` e retornar erro adequado se o perfil não foi criado ainda.

**QUAL-01 🟠 Adicionar tratamento de erro em `fetchTasks` e `fetchCompanyRole`**
Arquivos: `ConversationDetail.tsx:841` e `TenantContext.tsx:130`

**QUAL-02 🟠 Adicionar paginação em Contacts**
Arquivo: `frontend/src/pages/Contacts.tsx:458`
Adicionar `.limit(100)` e implementar paginação ou busca server-side via RPC com `search` param.

**PERF-03 🟠 Adicionar filtros Realtime nas subscriptions do Inbox**
Arquivo: `frontend/src/pages/Inbox.tsx:69-78`
```typescript
filter: `company_id=eq.${currentCompany.id}`
```

**PERF-04 🟠 Criar índices de deals e tasks**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_company_status
  ON public.deals(company_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_company_assigned_status
  ON public.tasks(company_id, assigned_to_user_id, status);
```

---

### Fase 3 — Primeiro mês

**SEG-08 🟡 Corrigir subconsulta inline em `audit_logs`**
Substituir por chamada à função `is_platform_admin()`.

**QUAL-03 🟡 Extrair `ConversationDetail.tsx` em componentes menores**
Separar em: `MessageTimeline`, `ConversationSidebar`, `TasksSection`, `DealsSection`, `AIAgentSection`.

**QUAL-04 🟡 Tipar Recharts callbacks no Dashboard**
Criar interface `RechartPayload` e substituir `any` no `ProfoundTooltip`.

**QUAL-05 🟡 Adicionar `AbortController` em fetches críticos**
Arquivos: `ConversationDetail.tsx:724` e `Contacts.tsx:452`

**QUAL-06 🟡 Adicionar feedback de erro no Inbox ao falhar**
Arquivo: `Inbox.tsx:47-51` — mostrar toast ou banner quando `fetchInbox` falhar.

**PERF-05 🟡 Implementar paginação em Deals**
Arquivo: `frontend/src/pages/Deals.tsx:82`

**PERF-06 🟡 Otimizar `rpc_get_inbox_conversations` com filtro de status**
Adicionar parâmetro `p_status TEXT DEFAULT 'open'` para não retornar conversas fechadas por padrão.

**PERF-07 🟡 Adicionar índice em `channel_events_raw(company_id)`**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channel_events_raw_company
  ON public.channel_events_raw(company_id);
```

**PERF-08 🟢 Corrigir retorno HTTP semântico no uazapi-connector**
Substituir `status: 200` por códigos adequados (401, 400, 500) nas respostas de erro.

---

## Apêndice — Inventário de tabelas auditadas

| Tabela | RLS | Políticas | Índices notáveis |
|--------|-----|-----------|-----------------|
| `companies` | S | SELECT, INSERT (platform_admin) | PK |
| `user_profiles` | S | SELECT, UPDATE (own) | PK, `idx_user_profiles_email` |
| `user_companies` | S | SELECT, INSERT (company_admin) | PK(user_id, company_id), `idx_user_companies_team` |
| `contacts` | S | ALL (is_company_member) | PK |
| `conversations` | S | ALL (is_company_member) | PK, `idx_conversations_agent` |
| `messages` | S | ALL (is_company_member ou via conv) | `idx_messages_external_id`, `idx_messages_direction_type`, `idx_messages_agent` |
| `contact_identities` | S | ALL (via contacts join) | PK |
| `deals` | S | ALL (is_company_member) | PK |
| `tasks` | S | ALL (is_company_member) | PK |
| `app_integrations` | S | SELECT (is_company_member); sem INSERT/UPDATE user | PK |
| `ai_agents` | S | ALL (user_companies only) | `idx_ai_agents_company` |
| `ai_agent_bindings` | S | ALL (user_companies only) | `idx_ai_agent_bindings_agent` |
| `pipelines` | S | SELECT/INSERT/UPDATE/DELETE granular | PK |
| `pipeline_stages` | S | SELECT/INSERT/UPDATE/DELETE granular via pipelines | PK |
| `teams` | S | SELECT, INSERT (company_admin) | `idx_teams_company`, `idx_teams_manager` |
| `schedules` | S | ALL (is_company_member) | `idx_schedules_company_weekday` |
| `service_types` | S | ALL (is_company_member) | `idx_service_types_company` |
| `appointments` | S | ALL (is_company_member) | `idx_appointments_company_scheduled_at`, `idx_appointments_company_contact`, `idx_appointments_company_status` |
| `audit_logs` | S | INSERT/SELECT (inline user_profiles check) | PK |
| `channel_events_raw` | **N** | Nenhuma (RLS desabilitado) | `idx_channel_events_raw_unprocessed`, `idx_channel_events_raw_external_id` |
| `subscription_plans` | S | SELECT (authenticated), ALL (platform_admin) | PK |
| `company_subscriptions` | S | ALL (platform_admin) | `idx_company_subscriptions_status`, `idx_company_subscriptions_company_id` |
| `company_invites` | S | SELECT (is_company_member), INSERT (company_admin) | PK |
| `kpi_company_daily_snapshots` | Não verificável | Não verificado | `idx_kpi_snapshots_company_date` |
