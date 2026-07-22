-- Settings improvements:
-- 1. Adds master controls for appointment and wellbeing reminders.
-- 2. Cleans invalid legacy values before adding validation constraints.
-- 3. Enables realtime updates for elder_settings.

ALTER TABLE public.elder_settings
  ADD COLUMN IF NOT EXISTS appointment_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wellbeing_reminders_enabled BOOLEAN NOT NULL DEFAULT true;

UPDATE public.elder_settings
SET med_reminder_lead_minutes = LEAST(120, GREATEST(0, med_reminder_lead_minutes));

UPDATE public.elder_settings
SET sos_escalation_minutes = LEAST(60, GREATEST(1, sos_escalation_minutes));

UPDATE public.elder_settings
SET preferred_contact_method = 'phone'
WHERE preferred_contact_method NOT IN ('phone', 'email', 'push');

UPDATE public.elder_settings
SET language = 'en'
WHERE language NOT IN ('en', 'hi');

UPDATE public.elder_settings
SET quiet_hours_start = NULL,
    quiet_hours_end = NULL
WHERE (quiet_hours_start IS NULL) <> (quiet_hours_end IS NULL)
   OR quiet_hours_start = quiet_hours_end;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elder_settings_med_grace_range'
      AND conrelid = 'public.elder_settings'::regclass
  ) THEN
    ALTER TABLE public.elder_settings
      ADD CONSTRAINT elder_settings_med_grace_range
      CHECK (med_reminder_lead_minutes BETWEEN 0 AND 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elder_settings_sos_escalation_range'
      AND conrelid = 'public.elder_settings'::regclass
  ) THEN
    ALTER TABLE public.elder_settings
      ADD CONSTRAINT elder_settings_sos_escalation_range
      CHECK (sos_escalation_minutes BETWEEN 1 AND 60);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elder_settings_contact_method_valid'
      AND conrelid = 'public.elder_settings'::regclass
  ) THEN
    ALTER TABLE public.elder_settings
      ADD CONSTRAINT elder_settings_contact_method_valid
      CHECK (preferred_contact_method IN ('phone', 'email', 'push'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elder_settings_language_valid'
      AND conrelid = 'public.elder_settings'::regclass
  ) THEN
    ALTER TABLE public.elder_settings
      ADD CONSTRAINT elder_settings_language_valid
      CHECK (language IN ('en', 'hi'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elder_settings_quiet_hours_pair'
      AND conrelid = 'public.elder_settings'::regclass
  ) THEN
    ALTER TABLE public.elder_settings
      ADD CONSTRAINT elder_settings_quiet_hours_pair
      CHECK (
        (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
        OR
        (
          quiet_hours_start IS NOT NULL
          AND quiet_hours_end IS NOT NULL
          AND quiet_hours_start <> quiet_hours_end
        )
      );
  END IF;
END
$$;

ALTER TABLE public.elder_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'elder_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.elder_settings;
  END IF;
END
$$;
