INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  (
    'health-records',
    'health-records',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'prescriptions',
    'prescriptions',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png'
    ]
  )
ON CONFLICT (id)
DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Safe UUID parsing for path-policy checks. Malformed object names should be
-- denied instead of causing a policy-cast error.
CREATE OR REPLACE FUNCTION public.try_parse_uuid(_value TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN _value::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION public.try_parse_uuid(TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.try_parse_uuid(TEXT)
TO authenticated, service_role;

-- =============================================================================
-- Health-record table validation and least-privilege RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_health_record_file()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  path_parts TEXT[];
  stored_filename TEXT;
  stored_stem TEXT;
  stored_extension TEXT;
  expected_extension TEXT;
BEGIN
  NEW.title := NULLIF(BTRIM(NEW.title), '');
  NEW.doctor_name := NULLIF(BTRIM(NEW.doctor_name), '');
  NEW.notes := NULLIF(BTRIM(NEW.notes), '');
  NEW.description := NULLIF(BTRIM(NEW.description), '');
  NEW.file_path := NULLIF(BTRIM(NEW.file_path), '');
  NEW.file_type := LOWER(NULLIF(BTRIM(NEW.file_type), ''));

  IF NEW.file_type = 'image/jpg' THEN
    NEW.file_type := 'image/jpeg';
  END IF;

  IF NEW.parent_id IS NULL THEN
    RAISE EXCEPTION 'A health record must belong to a parent account.';
  END IF;

  IF NEW.category NOT IN ('blood_test', 'prescription', 'ecg') THEN
    RAISE EXCEPTION 'Unsupported health-record category.';
  END IF;

  NEW.record_type := NEW.category;

  IF NEW.record_date IS NULL OR NEW.record_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'A health-record date cannot be in the future.';
  END IF;

  IF NEW.title IS NULL OR CHAR_LENGTH(NEW.title) > 180 THEN
    RAISE EXCEPTION 'Health-record title must contain 1 to 180 characters.';
  END IF;

  IF NEW.doctor_name IS NOT NULL AND CHAR_LENGTH(NEW.doctor_name) > 180 THEN
    RAISE EXCEPTION 'Doctor name must be 180 characters or fewer.';
  END IF;

  IF NEW.notes IS NOT NULL AND CHAR_LENGTH(NEW.notes) > 4000 THEN
    RAISE EXCEPTION 'Health-record notes must be 4,000 characters or fewer.';
  END IF;

  IF NEW.description IS NOT NULL AND CHAR_LENGTH(NEW.description) > 4000 THEN
    RAISE EXCEPTION 'Health-record description must be 4,000 characters or fewer.';
  END IF;

  IF NEW.file_path IS NULL THEN
    RAISE EXCEPTION 'A private storage path is required.';
  END IF;

  path_parts := STRING_TO_ARRAY(NEW.file_path, '/');

  IF ARRAY_LENGTH(path_parts, 1) <> 2
     OR path_parts[1] <> NEW.parent_id::TEXT THEN
    RAISE EXCEPTION 'Health-record storage path is invalid.';
  END IF;

  stored_filename := path_parts[2];
  stored_stem := SPLIT_PART(stored_filename, '.', 1);
  stored_extension := LOWER(REGEXP_REPLACE(stored_filename, '^.*\.', ''));

  IF public.try_parse_uuid(stored_stem) IS NULL THEN
    RAISE EXCEPTION 'Health-record storage filename must use a UUID.';
  END IF;

  IF NEW.file_type NOT IN (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ) THEN
    RAISE EXCEPTION 'Unsupported health-record file type.';
  END IF;

  expected_extension := CASE NEW.file_type
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
  END;

  IF stored_extension <> expected_extension THEN
    RAISE EXCEPTION 'Health-record file extension does not match its type.';
  END IF;

  IF NEW.file_size IS NULL OR NEW.file_size <= 0 OR NEW.file_size > 26214400 THEN
    RAISE EXCEPTION 'Health-record file size must be between 1 byte and 25 MB.';
  END IF;

  -- New records use private object paths only. Do not persist public/external
  -- URLs that can bypass Storage RLS or later become stale.
  NEW.file_url := NULL;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.uploaded_by := auth.uid();
    ELSIF NEW.uploaded_by IS NULL THEN
      NEW.uploaded_by := NEW.parent_id;
    END IF;
  ELSE
    IF NEW.parent_id <> OLD.parent_id
       OR NEW.file_path <> OLD.file_path
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
      RAISE EXCEPTION 'Health-record ownership and stored file are immutable.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.validate_health_record_file()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_health_record_file_trigger
ON public.health_records;

CREATE TRIGGER validate_health_record_file_trigger
BEFORE INSERT OR UPDATE
ON public.health_records
FOR EACH ROW
EXECUTE FUNCTION public.validate_health_record_file();

-- Remove every known historical policy before recreating the intended final
-- policy set. PostgreSQL combines permissive policies with OR, so stale write
-- policies must not remain.
DROP POLICY IF EXISTS "View records" ON public.health_records;
DROP POLICY IF EXISTS "Insert records" ON public.health_records;
DROP POLICY IF EXISTS "Update records" ON public.health_records;
DROP POLICY IF EXISTS "Delete records" ON public.health_records;
DROP POLICY IF EXISTS "Insert records (parent only)" ON public.health_records;
DROP POLICY IF EXISTS "Update records (parent only)" ON public.health_records;
DROP POLICY IF EXISTS "Delete records (parent only)" ON public.health_records;
DROP POLICY IF EXISTS "View health records (parent+child)" ON public.health_records;
DROP POLICY IF EXISTS "Insert health records (parent only)" ON public.health_records;
DROP POLICY IF EXISTS "Update health records (parent only)" ON public.health_records;
DROP POLICY IF EXISTS "Delete health records (parent only)" ON public.health_records;

CREATE POLICY "View health records (parent+child)"
ON public.health_records
FOR SELECT TO authenticated
USING (public.can_view_parent(parent_id));

CREATE POLICY "Insert health records (parent only)"
ON public.health_records
FOR INSERT TO authenticated
WITH CHECK (
  parent_id = auth.uid()
  AND uploaded_by = auth.uid()
);

CREATE POLICY "Update health records (parent only)"
ON public.health_records
FOR UPDATE TO authenticated
USING (parent_id = auth.uid())
WITH CHECK (
  parent_id = auth.uid()
  AND uploaded_by = auth.uid()
);

CREATE POLICY "Delete health records (parent only)"
ON public.health_records
FOR DELETE TO authenticated
USING (parent_id = auth.uid());

-- =============================================================================
-- Prescription validation and least-privilege RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_consultation_prescription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  consultation_parent UUID;
  path_parts TEXT[];
  stored_filename TEXT;
  stored_stem TEXT;
  stored_extension TEXT;
  expected_extension TEXT;
BEGIN
  SELECT parent_id
  INTO consultation_parent
  FROM public.video_consultations
  WHERE id = NEW.consultation_id;

  IF consultation_parent IS NULL THEN
    RAISE EXCEPTION 'Consultation not found.';
  END IF;

  IF consultation_parent <> NEW.parent_id THEN
    RAISE EXCEPTION 'Prescription parent does not match the consultation owner.';
  END IF;

  NEW.file_path := NULLIF(BTRIM(NEW.file_path), '');
  NEW.file_type := LOWER(NULLIF(BTRIM(NEW.file_type), ''));
  NEW.file_name := NULLIF(BTRIM(NEW.file_name), '');

  IF NEW.file_type = 'image/jpg' THEN
    NEW.file_type := 'image/jpeg';
  END IF;

  path_parts := STRING_TO_ARRAY(NEW.file_path, '/');

  IF NEW.file_path IS NULL
     OR ARRAY_LENGTH(path_parts, 1) <> 3
     OR path_parts[1] <> NEW.parent_id::TEXT
     OR path_parts[2] <> NEW.consultation_id::TEXT THEN
    RAISE EXCEPTION 'Prescription storage path is invalid.';
  END IF;

  stored_filename := path_parts[3];
  stored_stem := SPLIT_PART(stored_filename, '.', 1);
  stored_extension := LOWER(REGEXP_REPLACE(stored_filename, '^.*\.', ''));

  IF public.try_parse_uuid(stored_stem) IS NULL THEN
    RAISE EXCEPTION 'Prescription storage filename must use a UUID.';
  END IF;

  IF NEW.file_type NOT IN (
    'application/pdf',
    'image/jpeg',
    'image/png'
  ) THEN
    RAISE EXCEPTION 'Unsupported prescription file type.';
  END IF;

  expected_extension := CASE NEW.file_type
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
  END;

  IF stored_extension <> expected_extension THEN
    RAISE EXCEPTION 'Prescription file extension does not match its type.';
  END IF;

  IF NEW.file_size IS NULL OR NEW.file_size <= 0 OR NEW.file_size > 26214400 THEN
    RAISE EXCEPTION 'Prescription file size must be between 1 byte and 25 MB.';
  END IF;

  IF NEW.file_name IS NULL OR CHAR_LENGTH(NEW.file_name) > 180 THEN
    RAISE EXCEPTION 'Prescription file name must contain 1 to 180 characters.';
  END IF;

  NEW.file_url := NULL;

  IF TG_OP = 'UPDATE' AND (
    NEW.parent_id <> OLD.parent_id
    OR NEW.consultation_id <> OLD.consultation_id
    OR NEW.file_path <> OLD.file_path
  ) THEN
    RAISE EXCEPTION 'Prescription ownership and stored file are immutable.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.validate_consultation_prescription()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_consultation_prescription_trigger
ON public.consultation_prescriptions;

CREATE TRIGGER validate_consultation_prescription_trigger
BEFORE INSERT OR UPDATE
ON public.consultation_prescriptions
FOR EACH ROW
EXECUTE FUNCTION public.validate_consultation_prescription();

DROP POLICY IF EXISTS "View prescriptions (parent+child)"
ON public.consultation_prescriptions;
DROP POLICY IF EXISTS "Insert prescriptions (parent only)"
ON public.consultation_prescriptions;
DROP POLICY IF EXISTS "Update prescriptions (parent only)"
ON public.consultation_prescriptions;
DROP POLICY IF EXISTS "Delete prescriptions (parent only)"
ON public.consultation_prescriptions;

CREATE POLICY "View prescriptions (parent+child)"
ON public.consultation_prescriptions
FOR SELECT TO authenticated
USING (public.can_view_parent(parent_id));

CREATE POLICY "Insert prescriptions (parent only)"
ON public.consultation_prescriptions
FOR INSERT TO authenticated
WITH CHECK (parent_id = auth.uid());

-- Prescription metadata and object paths are immutable. Replacement requires
-- deleting the old prescription and uploading a new file.
CREATE POLICY "Delete prescriptions (parent only)"
ON public.consultation_prescriptions
FOR DELETE TO authenticated
USING (parent_id = auth.uid());

-- =============================================================================
-- Storage policies
-- =============================================================================

DROP POLICY IF EXISTS "health_records_read" ON storage.objects;
DROP POLICY IF EXISTS "health_records_insert" ON storage.objects;
DROP POLICY IF EXISTS "health_records_update" ON storage.objects;
DROP POLICY IF EXISTS "health_records_delete" ON storage.objects;

-- A linked child can read only an object that has a visible database record.
-- Orphaned files are not readable merely because their path can be guessed.
CREATE POLICY "health_records_read"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'health-records'
  AND EXISTS (
    SELECT 1
    FROM public.health_records AS record
    WHERE record.file_path = storage.objects.name
      AND public.can_view_parent(record.parent_id)
  )
);

CREATE POLICY "health_records_insert"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'health-records'
  AND ARRAY_LENGTH(STRING_TO_ARRAY(name, '/'), 1) = 2
  AND public.try_parse_uuid(SPLIT_PART(name, '/', 1)) = auth.uid()
  AND public.try_parse_uuid(
    SPLIT_PART(SPLIT_PART(name, '/', 2), '.', 1)
  ) IS NOT NULL
  AND LOWER(REGEXP_REPLACE(name, '^.*\.', '')) IN ('pdf', 'jpg', 'png', 'webp')
);

-- Objects are immutable: there is intentionally no UPDATE policy.
CREATE POLICY "health_records_delete"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'health-records'
  AND public.try_parse_uuid(SPLIT_PART(name, '/', 1)) = auth.uid()
);

DROP POLICY IF EXISTS "prescriptions_read" ON storage.objects;
DROP POLICY IF EXISTS "prescriptions_insert" ON storage.objects;
DROP POLICY IF EXISTS "prescriptions_update" ON storage.objects;
DROP POLICY IF EXISTS "prescriptions_delete" ON storage.objects;

CREATE POLICY "prescriptions_read"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND EXISTS (
    SELECT 1
    FROM public.consultation_prescriptions AS prescription
    WHERE prescription.file_path = storage.objects.name
      AND public.can_view_parent(prescription.parent_id)
  )
);

CREATE POLICY "prescriptions_insert"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'prescriptions'
  AND ARRAY_LENGTH(STRING_TO_ARRAY(name, '/'), 1) = 3
  AND public.try_parse_uuid(SPLIT_PART(name, '/', 1)) = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.video_consultations AS consultation
    WHERE consultation.id = public.try_parse_uuid(SPLIT_PART(name, '/', 2))
      AND consultation.parent_id = auth.uid()
  )
  AND public.try_parse_uuid(
    SPLIT_PART(SPLIT_PART(name, '/', 3), '.', 1)
  ) IS NOT NULL
  AND LOWER(REGEXP_REPLACE(name, '^.*\.', '')) IN ('pdf', 'jpg', 'png')
);

-- Objects are immutable: there is intentionally no UPDATE policy.
CREATE POLICY "prescriptions_delete"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND public.try_parse_uuid(SPLIT_PART(name, '/', 1)) = auth.uid()
);

-- =============================================================================
-- Access audit log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.medical_file_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_kind TEXT NOT NULL
    CHECK (document_kind IN ('health_record', 'prescription')),
  document_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'download')),
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medical_file_access_logs_parent_created_idx
ON public.medical_file_access_logs(parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS medical_file_access_logs_actor_created_idx
ON public.medical_file_access_logs(actor_id, created_at DESC);

ALTER TABLE public.medical_file_access_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT
ON public.medical_file_access_logs
TO authenticated;

GRANT ALL
ON public.medical_file_access_logs
TO service_role;

DROP POLICY IF EXISTS "Parents view medical file audit"
ON public.medical_file_access_logs;
DROP POLICY IF EXISTS "Users insert own medical file audit"
ON public.medical_file_access_logs;

-- Only the parent can inspect the complete access history for their documents.
CREATE POLICY "Parents view medical file audit"
ON public.medical_file_access_logs
FOR SELECT TO authenticated
USING (parent_id = auth.uid());

CREATE POLICY "Users insert own medical file audit"
ON public.medical_file_access_logs
FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND public.can_view_parent(parent_id)
);