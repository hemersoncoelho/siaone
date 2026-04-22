# Guarda de `attendance_mode` no Workflow n8n — IA Comercial

## 3.1 Descrição do Problema

### Por que o n8n precisa de uma guarda de `attendance_mode`

O workflow de IA no n8n é acionado por **toda mensagem inbound do contato**. Se um
agente humano assumir o atendimento (pausar a IA via frontend ou ao enviar uma mensagem),
o campo `attendance_mode` da conversa muda para `'human'` no banco de dados.

**Porém, o n8n não sabe disso automaticamente.** Sem uma guarda explícita, o workflow
continua executando e o LLM pode responder ao lead mesmo após a IA ter sido pausada.
Isso gera:

- Respostas duplicadas (humano + IA ao mesmo tempo)
- Experiência confusa para o lead
- Perda de controle do agente humano sobre o atendimento

---

## 3.2 Onde Inserir o Nó de Guarda

````text
[Webhook / Buffer inbound]
        │
        ▼
┌───────────────────────┐
│  ✅ INSERIR AQUI       │  ← Nó de guarda: busca attendance_mode
│  Guard: attendance?   │
└───────────┬───────────┘
            │
     ┌──────┴──────┐
     │  'ai'?      │  Sim → continua o fluxo
     │             │  Não → para silenciosamente
     └──────┬──────┘
            │
            ▼
  [Busca agente IA / configuração]
            │
            ▼
       [Chama LLM]
            │
            ▼
    [Envia resposta ao lead]
````

> **Regra:** o nó de guarda deve ser o **primeiro nó após o recebimento do payload do buffer**,
> antes de qualquer consulta ao agente IA, Redis ou LLM.

---

## 3.3 Lógica do Nó de Guarda

### Opção A — Nó "Supabase" (se instalado)

**Operação:** `Get Row` ou `Execute Query`  
**Tabela:** `conversations`  
**Query:**

```sql
SELECT attendance_mode
FROM conversations
WHERE company_id = '{{ $json.company_id }}'
  AND contact_id = '{{ $json.contact_id }}'
LIMIT 1;
```

### Opção B — Nó "HTTP Request" (mais universal)

**Method:** `POST`  
**URL:** `https://<seu-projeto>.supabase.co/rest/v1/rpc/` *(ou endpoint da API REST)*

Use a endpoint REST do Supabase diretamente:

```
GET https://<projeto>.supabase.co/rest/v1/conversations
    ?select=attendance_mode
    &company_id=eq.{{ $json.company_id }}
    &contact_id=eq.{{ $json.contact_id }}
    &limit=1
```

**Headers:**
```
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
```

### Nó IF — Condição de passagem

Após o nó de busca, adicione um nó **IF**:

| Campo | Valor |
|-------|-------|
| **Valor A** | `{{ $json[0].attendance_mode }}` (ou `{{ $json.attendance_mode }}` dependendo do retorno) |
| **Operação** | `Equal` |
| **Valor B** | `ai` |

- **Branch `true` (igual a `'ai'`)** → continua o fluxo normalmente
- **Branch `false` (qualquer outro valor: `'human'`, `'hybrid'`)** → conectar a um nó **NoOp** ou simplesmente não conectar nada (fluxo termina silenciosamente)

---

## 3.4 Avisos Importantes

> [!IMPORTANT]
> **Sempre use `company_id` na query.** Nunca busque apenas por `contact_id` sem filtrar por `company_id`. O sistema é multi-tenant e uma query sem `company_id` pode retornar dados de outro tenant.

> [!WARNING]
> **O nó de parada não deve emitir mensagem ao lead.** Quando `attendance_mode !== 'ai'`, o workflow deve encerrar silenciosamente. Não envie nenhuma mensagem ao WhatsApp, não registre erro, apenas pare.

> [!NOTE]
> **Não apague a memória Redis da IA.** A memória da sessão do lead no Redis deve ser preservada. Ela será necessária quando o atendimento retornar para a IA. Apenas ignore (não leia / não escreva) quando a guarda barrar o fluxo.

> [!NOTE]
> **Valores válidos de `attendance_mode`:** `'ai'`, `'human'`, `'hybrid'`. O fluxo da IA só deve continuar quando o valor for exatamente `'ai'`.

---

## Referência: Como o frontend pausa a IA

Quando um agente humano envia uma mensagem pelo frontend (Inbox), o sistema automaticamente:

1. Chama `rpc_set_conversation_attendance(p_conversation_id, 'human')` → muda `attendance_mode` e registra `ai_paused_at`
2. Chama `rpc_assign_conversation(p_conversation_id, user_id)` → atribui a conversa ao agente

A guarda no n8n garante que, mesmo que haja mensagens inbound chegando durante ou após essa transição, o workflow não acione o LLM.
