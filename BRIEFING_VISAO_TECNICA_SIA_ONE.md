# Briefing — Visao Tecnica do Sia One

## 1) Resumo executivo

O Sia One esta em uma fase de consolidacao: o produto ja opera fluxos centrais de CRM e atendimento (Inbox, contatos, pipeline, tarefas, agentes IA), com frontend React e backend serverless em Supabase, enquanto a orquestracao de canais externos evolui com N8N + UAZAPI.

A prioridade agora e sair de um modelo "funcional por fluxo" para um modelo "confiavel por plataforma": ingestao robusta de mensagens multimidia, observabilidade ponta a ponta, governanca de dados multitenant e operacao escalavel para clientes reais.

---

## 2) Onde estamos hoje (estado atual)

### 2.1 Arquitetura atual
- **Frontend:** React + TypeScript + Vite, com Timeline de mensagens ja preparada para tipos multimidia (`audio`, `image`, `video`, `document`, etc.).
- **Backend de dados:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions).
- **Orquestracao externa:** N8N recebendo webhook da UAZAPI, normalizando eventos e persistindo no Supabase via RPC.
- **Modelo multiempresa:** isolamento por `company_id` + RLS.

### 2.2 O que ja funciona bem
- Entrada e persistencia de mensagens de texto.
- Pipeline de atendimento humano/IA com modos de atendimento.
- Interface do Inbox preparada para play de audio e render de anexos.
- Evolucao de schema e migracoes em andamento (inclusive bucket de midia no Storage).

### 2.3 Gargalos atuais
- **Midia de WhatsApp:** URL crua de webhook pode ser temporaria/criptografada, quebrando playback no frontend.
- **Confiabilidade de entrega:** faltam padroes unificados de retentativa, deduplicacao e DLQ no fluxo N8N.
- **Observabilidade:** ainda sem trilha operacional completa por evento (do webhook ate render no cliente).
- **Padronizacao operacional:** parte da logica ainda distribuida em regras de fluxo e ajustes pontuais.

---

## 3) Para onde vamos (visao-alvo)

### 3.1 Visao de produto tecnico
Ser uma plataforma conversacional CRM-first, com:
- ingestao omnichannel robusta,
- historico auditavel de mensagens e contexto,
- operacao assistida por IA com controle humano,
- dados confiaveis para automacao, analytics e expansao comercial.

### 3.2 Principios da arquitetura alvo
- **Event-driven:** todo evento de canal entra por um funil padronizado.
- **Media-first:** anexos sempre resolvidos para URL estavel (Storage/CDN) antes de chegar no app.
- **Observable by default:** cada etapa com status, timestamp, correlation id e metricas.
- **Tenant-safe by design:** qualquer processamento sempre escopado por empresa.
- **Idempotencia:** eventos repetidos nao geram duplicidade funcional.

---

## 4) Arquitetura tecnica alvo (Norte)

### 4.1 Camada de ingestao (N8N)
- Webhook UAZAPI recebe evento bruto.
- Persistencia inicial em `channel_events_raw` (rastreamento e replay).
- Normalizacao para contrato canonico de mensagem.
- Resolucao de midia:
  1. download via provider,
  2. upload para Supabase Storage,
  3. persistencia da URL publica/estavel no registro final.
- Chamada RPC de persistencia (`rpc_persist_inbound_message`) com idempotencia por `external_message_id`.

### 4.2 Camada de dominio (Supabase)
- Tabelas canonicas de `conversations`, `messages`, `contacts`, `app_integrations`.
- RPCs como fronteira de negocio para mutacoes sensiveis.
- RLS como primeira linha de seguranca tenant.
- Storage como origem de verdade de midia.

### 4.3 Camada de experiencia (Frontend)
- Timeline multimidia unificada (texto, audio, imagem, video, documento, etc.).
- Realtime para atualizacao de conversa sem refresh.
- Estados operacionais claros (queued/sent/delivered/failed).
- Experiencia resiliente para indisponibilidade de midia (fallbacks).

### 4.4 Camada de IA e automacao
- Atendimento em modos `human`, `ai`, `hybrid`.
- Buffer e consolidacao de mensagens para contexto de IA.
- Handoff humano rastreavel com eventos de sistema.

---

## 5) Roadmap proposto (onde iremos chegar)

## Fase 0 — Estabilizacao imediata (0-30 dias)
- Fechar pipeline de midia fim-a-fim (audio/video/documentos) com Storage.
- Garantir MIME normalizado no upload.
- Padronizar idempotencia por mensagem externa.
- Criar checklist de validacao operacional por tipo de mensagem.

**Meta:** 100% dos tipos suportados renderizando no frontend com URL estavel.

## Fase 1 — Confiabilidade e observabilidade (30-60 dias)
- Instrumentar fluxo com `trace_id`/`event_id`.
- Dashboard operacional com:
  - throughput por canal,
  - taxa de erro por etapa,
  - tempo medio webhook -> persistencia -> render.
- Implementar retentativas controladas + dead-letter strategy.

**Meta:** diagnostico de falhas em minutos (nao horas).

## Fase 2 — Escala e governanca (60-90 dias)
- Contratos de evento versionados (schema governance).
- Politica de retenção e arquivamento de eventos brutos.
- Melhorias de performance (indices e consultas de inbox em alto volume).
- Hardening de seguranca (auditoria de policies RLS + secrets lifecycle).

**Meta:** operacao segura com crescimento de volume sem degradacao perceptivel.

## Fase 3 — Plataforma inteligente (90+ dias)
- Motor de automacoes por gatilhos de conversa.
- Recomendacoes de proxima melhor acao (IA copiloto para agentes).
- KPI semantico de qualidade de atendimento e conversao por jornada.
- Evolucao para omnichannel completo com padrao unico de ingestao.

**Meta:** transformar atendimento em vantagem competitiva orientada a dados.

---

## 6) KPIs tecnicos de sucesso

- **Confiabilidade de ingestao:** `% eventos processados com sucesso`.
- **Latencia fim-a-fim:** `P95 webhook -> mensagem visivel no inbox`.
- **Integridade de midia:** `% mensagens multimidia com render valido`.
- **Deduplicacao:** `% eventos duplicados neutralizados corretamente`.
- **Disponibilidade operacional:** tempo medio para detectar e corrigir falhas.
- **Saude de dados:** divergencia entre evento bruto e mensagem canonica.

---

## 7) Riscos e mitigacoes

- **Risco:** dependencia forte de payload externo (UAZAPI muda formato).  
  **Mitigacao:** normalizador defensivo + contratos versionados.

- **Risco:** links temporarios de midia expirarem.  
  **Mitigacao:** persistir sempre no Storage proprio.

- **Risco:** aumento de custo por armazenar toda midia sem politica.  
  **Mitigacao:** lifecycle policy por tipo/tamanho/idade.

- **Risco:** drift entre logica no N8N e regras no banco.  
  **Mitigacao:** centralizar regras de negocio criticas em RPCs.

---

## 8) Decisoes estrategicas recomendadas para o briefing

1. **N8N como orquestrador oficial de canais** e Supabase como dominio canonico.
2. **Storage obrigatorio para toda midia de entrada** (nao depender de URL do provider).
3. **Observabilidade como requisito de release**, nao como melhoria futura.
4. **RPC-first para regras de negocio**, reduzindo inconsistencias entre fluxos.
5. **Roadmap em ondas curtas (30/60/90 dias)** com metas tecnicas mensuraveis.

---

## 9) Mensagem de posicionamento tecnico (para abrir o briefing)

> O Sia One ja provou valor funcional.  
> O proximo passo e consolidar uma base tecnica robusta para escalar atendimento inteligente com confiabilidade, rastreabilidade e experiencia multimidia completa, do webhook ao play no inbox.

