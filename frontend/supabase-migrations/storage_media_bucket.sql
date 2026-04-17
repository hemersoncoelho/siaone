-- ============================================================
-- Storage: bucket 'media' para mídias do WhatsApp
--
-- Cria o bucket público onde o N8N faz upload dos arquivos
-- baixados via UAZAPI (áudio, imagem, vídeo, documento, sticker).
--
-- Como aplicar:
--   Execute no SQL Editor do Supabase (projeto phlgzzjyzkgvveqevqbg)
--   ou via Supabase CLI: supabase db push
-- ============================================================

-- 1. Criar o bucket (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,    -- leitura pública sem autenticação
  52428800, -- 50 MB por arquivo
  NULL     -- sem restrição de MIME type: o N8N (service_role) é o único que faz upload
           -- e já normaliza o MIME antes de enviar. A policy de INSERT já restringe quem pode subir.
)
ON CONFLICT (id) DO UPDATE SET
  public          = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Política: leitura pública para qualquer pessoa (anon, autenticado, service_role)
--    Para buckets públicos o Supabase Storage já libera leitura via URL pública,
--    mas a policy abaixo garante acesso também via SDK.
DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- 3. Política: upload/sobrescrita apenas para service_role
--    O N8N usa a service role key (Settings > API > service_role secret)
DROP POLICY IF EXISTS "media_service_insert" ON storage.objects;
CREATE POLICY "media_service_insert"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "media_service_update" ON storage.objects;
CREATE POLICY "media_service_update"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_service_delete" ON storage.objects;
CREATE POLICY "media_service_delete"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'media');

-- ============================================================
-- Após aplicar:
-- URL pública dos arquivos será:
--   https://phlgzzjyzkgvveqevqbg.supabase.co/storage/v1/object/public/media/{path}
--
-- Exemplo para áudio:
--   https://phlgzzjyzkgvveqevqbg.supabase.co/storage/v1/object/public/media/f5de34df/3EB05892C82807793E9387.mp3
-- ============================================================
