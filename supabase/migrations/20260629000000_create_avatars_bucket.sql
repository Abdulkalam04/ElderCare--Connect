-- =============================================================================
-- Create avatars Storage Bucket
-- 
-- IMPORTANT: Run this SQL to create the public bucket for user profile photos.
-- =============================================================================

-- Create the public bucket for profile photo uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,      -- public bucket
  5242880,   -- 5 MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Storage RLS Policies ────────────────────────────────────────────────────

-- SELECT: Anyone can read avatar files (public bucket)
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
CREATE POLICY "avatars_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- INSERT: Authenticated users can upload to their own folder (folder name matching user uuid)
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
CREATE POLICY "avatars_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  );

-- UPDATE: Authenticated users can update files in their own folder
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  );

-- DELETE: Authenticated users can delete files in their own folder
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1])::uuid = auth.uid()
  );

-- Verify the bucket was created
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
    RAISE EXCEPTION 'avatars bucket was NOT created. Check permissions.';
  ELSE
    RAISE NOTICE 'avatars bucket created successfully.';
  END IF;
END $$;
