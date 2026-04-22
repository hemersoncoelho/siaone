-- Habilita Supabase Realtime para as tabelas do Inbox
-- Sem isso, nenhum evento postgres_changes é entregue ao frontend,
-- fazendo com que a UI só atualize após refresh manual.
--
-- REPLICA IDENTITY FULL: garante que eventos UPDATE incluam todos os campos
-- (necessário para filtros por conversation_id funcionarem em eventos UPDATE)
ALTER TABLE public.messages      REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

-- Adiciona as tabelas à publicação do Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
