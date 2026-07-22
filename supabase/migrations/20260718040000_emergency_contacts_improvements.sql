-- Emergency contacts: validation, efficient ordering, and realtime updates.

ALTER TABLE public.emergency_contacts
  DROP CONSTRAINT IF EXISTS emergency_contacts_priority_range;

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_priority_range
  CHECK (priority BETWEEN 1 AND 10) NOT VALID;

ALTER TABLE public.emergency_contacts
  DROP CONSTRAINT IF EXISTS emergency_contacts_contact_method_required;

ALTER TABLE public.emergency_contacts
  ADD CONSTRAINT emergency_contacts_contact_method_required
  CHECK (
    NULLIF(BTRIM(phone), '') IS NOT NULL
    OR NULLIF(BTRIM(email), '') IS NOT NULL
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_parent_order
  ON public.emergency_contacts(parent_id, priority ASC, created_at ASC);

ALTER TABLE public.emergency_contacts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'emergency_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.emergency_contacts;
  END IF;
END
$$;
