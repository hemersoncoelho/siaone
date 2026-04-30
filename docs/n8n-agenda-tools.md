# Tools de Agenda — Agente de IA (n8n) · Sia One

Especificação das 4 ferramentas disponíveis para o agente via n8n.
Todas as chamadas usam **service_role** (sem autenticação de usuário).

> **Regra absoluta:** `company_id` é **sempre obrigatório**. Nenhuma tool opera sem ele.

---

## 1. `check_available_slots`

**Objetivo:** Consultar horários disponíveis em uma data para um tipo de serviço.

**Quando usar:** Ao receber frases como:
- "Tem horário amanhã?", "Quais horários vocês têm na quinta?"
- "Está disponível às 14h na sexta?"
- Sempre antes de criar ou remarcar um agendamento.

### Parâmetros de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `company_id` | uuid | ✅ | ID da empresa (tenant) |
| `service_type_id` | uuid | ✅ | ID do tipo de serviço |
| `date` | date (`YYYY-MM-DD`) | ✅ | Data para consultar |

### Chamada Supabase (n8n HTTP Request)
```
POST https://<project>.supabase.co/rest/v1/rpc/rpc_get_available_slots
Authorization: Bearer <service_role_key>
apikey: <service_role_key>
Content-Type: application/json

{
  "p_company_id": "uuid-da-empresa",
  "p_service_type_id": "uuid-do-servico",
  "p_date": "2026-04-28"
}
```

### Retorno — sucesso com slots
```json
{
  "success": true,
  "date": "2026-04-28",
  "slots": [
    { "slot_start": "2026-04-28T08:00:00+00:00", "slot_end": "2026-04-28T09:00:00+00:00" },
    { "slot_start": "2026-04-28T09:00:00+00:00", "slot_end": "2026-04-28T10:00:00+00:00" }
  ]
}
```

### Retorno — dia sem atendimento
```json
{
  "success": true,
  "slots": [],
  "message": "Empresa não possui atendimento neste dia."
}
```

### Retorno — erro
```json
{ "success": false, "error": "Tipo de serviço não encontrado ou inativo para esta empresa." }
```

---

## 2. `create_appointment`

**Objetivo:** Criar um agendamento após o lead confirmar um horário.

**Quando usar:** Após apresentar os slots disponíveis e o lead confirmar um horário específico. **Nunca criar sem antes verificar disponibilidade.**

### Parâmetros de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `company_id` | uuid | ✅ | ID da empresa |
| `contact_id` | uuid | ✅ | ID do contato no CRM |
| `service_type_id` | uuid | ✅ | ID do tipo de serviço |
| `scheduled_at` | timestamptz (ISO 8601) | ✅ | Data e hora de início |
| `conversation_id` | uuid | ❌ | ID da conversa WhatsApp |
| `notes` | text | ❌ | Observações |

### Chamada Supabase
```
POST https://<project>.supabase.co/rest/v1/rpc/rpc_create_appointment

{
  "p_company_id": "uuid-da-empresa",
  "p_contact_id": "uuid-do-contato",
  "p_conversation_id": "uuid-da-conversa",
  "p_service_type_id": "uuid-do-servico",
  "p_scheduled_at": "2026-04-28T09:00:00+00:00",
  "p_notes": null
}
```

### Retorno — sucesso
```json
{
  "success": true,
  "appointment_id": "uuid-do-agendamento",
  "scheduled_at": "2026-04-28T09:00:00+00:00",
  "ends_at": "2026-04-28T10:00:00+00:00",
  "status": "scheduled"
}
```

### Retorno — conflito
```json
{ "success": false, "error": "Conflito de horário: já existe um agendamento neste intervalo. Consulte os slots disponíveis e tente outro horário." }
```

### Retorno — horário no passado
```json
{ "success": false, "error": "Não é possível agendar em uma data/hora no passado." }
```

---

## 3. `cancel_appointment`

**Objetivo:** Cancelar um agendamento com status `scheduled`.

**Quando usar:** Ao receber frases como:
- "Quero cancelar meu agendamento", "Não vou poder ir"
- Confirmar a intenção do lead antes de chamar a tool.

### Parâmetros de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `company_id` | uuid | ✅ | ID da empresa |
| `appointment_id` | uuid | ✅ | ID do agendamento |
| `reason` | text | ❌ | Motivo do cancelamento |

### Chamada Supabase
```
POST https://<project>.supabase.co/rest/v1/rpc/rpc_cancel_appointment

{
  "p_company_id": "uuid-da-empresa",
  "p_appointment_id": "uuid-do-agendamento",
  "p_reason": "Lead não poderá comparecer."
}
```

### Retorno — sucesso
```json
{
  "success": true,
  "appointment_id": "uuid-do-agendamento",
  "status": "cancelled",
  "cancelled_at": "2026-04-23T15:30:00+00:00",
  "cancellation_reason": "Lead não poderá comparecer."
}
```

### Retorno — erro
```json
{ "success": false, "error": "Não é possível cancelar um agendamento com status \"completed\"." }
```

---

## 4. `reschedule_appointment`

**Objetivo:** Remarcar um agendamento para nova data/hora. Cancela o original e cria um novo com `rescheduled_from_id` para rastreamento.

**Quando usar:** Ao receber frases como:
- "Posso remarcar para quinta?", "Aquele horário não ficou bom"
- Sempre verificar disponibilidade antes (`check_available_slots`) e confirmar com o lead.

### Parâmetros de entrada

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `company_id` | uuid | ✅ | ID da empresa |
| `appointment_id` | uuid | ✅ | ID do agendamento original |
| `new_scheduled_at` | timestamptz (ISO 8601) | ✅ | Nova data e hora |
| `notes` | text | ❌ | Observações (substitui anteriores) |

### Chamada Supabase
```
POST https://<project>.supabase.co/rest/v1/rpc/rpc_reschedule_appointment

{
  "p_company_id": "uuid-da-empresa",
  "p_appointment_id": "uuid-do-agendamento-original",
  "p_new_scheduled_at": "2026-04-30T14:00:00+00:00",
  "p_notes": null
}
```

### Retorno — sucesso
```json
{
  "success": true,
  "appointment_id": "uuid-novo-agendamento",
  "rescheduled_from_id": "uuid-agendamento-original",
  "scheduled_at": "2026-04-30T14:00:00+00:00",
  "ends_at": "2026-04-30T15:00:00+00:00",
  "status": "scheduled"
}
```

### Retorno — conflito
```json
{ "success": false, "error": "Conflito de horário no novo horário solicitado." }
```

---

## Resumo das Tools

| Tool | RPC | Quando usar |
|---|---|---|
| `check_available_slots` | `rpc_get_available_slots` | Consultar disponibilidade |
| `create_appointment` | `rpc_create_appointment` | Confirmar e criar agendamento |
| `cancel_appointment` | `rpc_cancel_appointment` | Cancelar a pedido do lead |
| `reschedule_appointment` | `rpc_reschedule_appointment` | Remarcar para nova data/hora |

---

## Instruções para o Agente

### Como conduzir o fluxo de agendamento via WhatsApp

#### 1. Identificar o serviço desejado
Antes de consultar slots, confirme qual serviço o lead deseja. Se a empresa tem múltiplos serviços, apresente a lista e aguarde a escolha:
> "Ótimo! Temos os seguintes serviços disponíveis: [nome 1] (X min), [nome 2] (Y min). Qual você gostaria de agendar?"

#### 2. Como perguntar a data sem confundir o lead
Nunca peça a data em formato técnico. Use linguagem natural:
> "Para qual dia você gostaria de agendar? Pode me dizer algo como 'amanhã', 'segunda-feira' ou uma data específica."

Converta a resposta do lead para o formato `YYYY-MM-DD` antes de chamar a tool.

#### 3. Como apresentar os slots de forma legível
Nunca exiba o timestamp técnico. Formate os horários para o lead:
- Converta `slot_start` para horário local: "09:00", "14:30"
- Apresente como lista simples:
  > "Esses são os horários disponíveis em [dia da semana], [data]:\n• 08:00\n• 09:00\n• 10:00\n\nQual prefere?"

#### 4. Como confirmar antes de criar
Sempre confirme com o lead antes de chamar `create_appointment`:
> "Perfeito! Vou confirmar: **[serviço]** no dia **[data]** às **[horário]**. Posso confirmar o agendamento?"

Só chame a tool após receber confirmação explícita (sim, pode, confirma, etc.).

#### 5. Como tratar ausência de slots disponíveis
Quando `slots` vier vazio:
> "Infelizmente não temos horários disponíveis em [data]. Quer que eu verifique outro dia?"

Se `message` indicar que a empresa não atende naquele dia:
> "Nossa agenda não tem atendimento nessa data. Posso verificar um dia útil próximo?"

#### 6. Como conduzir cancelamento
1. Confirme a intenção: "Você quer cancelar o agendamento de [serviço] marcado para [data e hora]. Confirma?"
2. Pergunte o motivo (opcional): "Há algum motivo para o cancelamento? (pode me dizer ou ignorar esta pergunta)"
3. Só então chame `cancel_appointment`
4. Confirme ao lead: "Pronto! Seu agendamento foi cancelado. Se quiser reagendar, é só me avisar. 😊"

#### 7. Como conduzir remarcação
1. Confirme o agendamento a remarcar
2. Pergunte a nova data desejada
3. Chame `check_available_slots` para a nova data
4. Apresente os slots disponíveis
5. Aguarde o lead escolher
6. Confirme: "Vou remarcar para [nova data] às [novo horário]. Confirma?"
7. Chame `reschedule_appointment`
8. Confirme ao lead: "Remarcado com sucesso! Novo agendamento: [data] às [horário]."

#### 8. Tratamento de erros
Nunca exiba mensagens técnicas ao lead. Interprete o campo `error` e responda naturalmente:

| Erro retornado | Resposta ao lead |
|---|---|
| `"Conflito de horário..."` | "Esse horário acabou de ser ocupado! Quer ver outros horários disponíveis?" |
| `"Empresa não possui atendimento neste dia."` | "Não temos atendimento nessa data. Posso verificar outra?" |
| `"Não é possível agendar em uma data/hora no passado."` | "Essa data já passou! Me diga uma data futura." |
| `"Agendamento não encontrado..."` | "Não encontrei esse agendamento. Pode confirmar seus dados?" |
| Qualquer outro erro | "Tive um problema técnico ao processar. Pode tentar novamente em instantes." |
