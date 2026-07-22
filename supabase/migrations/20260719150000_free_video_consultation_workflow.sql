CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.video_consultations
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_minutes_before INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS waiting_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE public.video_consultations
SET meeting_url =
  'https://meet.jit.si/eldercare-' || id::TEXT
WHERE meeting_url IS NULL OR BTRIM(meeting_url) = '';

UPDATE public.video_consultations
SET status = 'scheduled'::public.booking_status
WHERE status::TEXT NOT IN (
  'scheduled',
  'waiting',
  'pending',
  'in_progress',
  'completed',
  'cancelled'
);

UPDATE public.video_consultations
SET
  consultation_date = (scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE,
  consultation_time = (scheduled_at AT TIME ZONE 'Asia/Kolkata')::TIME,
  completed_at = CASE
    WHEN status::TEXT = 'completed' THEN COALESCE(completed_at, updated_at)
    ELSE completed_at
  END,
  cancelled_at = CASE
    WHEN status::TEXT = 'cancelled' THEN COALESCE(cancelled_at, updated_at)
    ELSE cancelled_at
  END;

UPDATE public.video_consultations
SET
  doctor_name = COALESCE(NULLIF(BTRIM(doctor_name), ''), 'Doctor'),
  specialty = NULLIF(BTRIM(specialty), ''),
  consultation_reason = COALESCE(
    NULLIF(BTRIM(consultation_reason), ''),
    'General consultation'
  ),
  meeting_url = NULLIF(BTRIM(meeting_url), ''),
  notes = NULLIF(BTRIM(notes), ''),
  cancellation_reason = NULLIF(BTRIM(cancellation_reason), ''),
  reminder_minutes_before = LEAST(1440, GREATEST(5, reminder_minutes_before));

ALTER TABLE public.video_consultations
  DROP CONSTRAINT IF EXISTS video_consult_doctor_name_length,
  ADD CONSTRAINT video_consult_doctor_name_length
    CHECK (char_length(BTRIM(doctor_name)) BETWEEN 2 AND 120),

  DROP CONSTRAINT IF EXISTS video_consult_reason_length,
  ADD CONSTRAINT video_consult_reason_length
    CHECK (
      consultation_reason IS NULL
      OR char_length(consultation_reason) BETWEEN 3 AND 300
    ),

  DROP CONSTRAINT IF EXISTS video_consult_https_meeting_url,
  ADD CONSTRAINT video_consult_https_meeting_url
    CHECK (
      meeting_url IS NULL
      OR meeting_url ~* '^https://[^[:space:]]+$'
    ),

  DROP CONSTRAINT IF EXISTS video_consult_reminder_range,
  ADD CONSTRAINT video_consult_reminder_range
    CHECK (reminder_minutes_before BETWEEN 5 AND 1440),

  DROP CONSTRAINT IF EXISTS video_consult_cancel_reason_length,
  ADD CONSTRAINT video_consult_cancel_reason_length
    CHECK (
      cancellation_reason IS NULL
      OR char_length(cancellation_reason) BETWEEN 3 AND 300
    );

CREATE INDEX IF NOT EXISTS idx_video_consult_parent_status_schedule
  ON public.video_consultations(parent_id, status, scheduled_at ASC);

-- Validate transitions and keep lifecycle timestamps trustworthy.
CREATE OR REPLACE FUNCTION public.validate_video_consultation_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  NEW.doctor_name := BTRIM(NEW.doctor_name);
  NEW.specialty := NULLIF(BTRIM(NEW.specialty), '');
  NEW.consultation_reason := NULLIF(BTRIM(NEW.consultation_reason), '');
  NEW.meeting_url := NULLIF(BTRIM(NEW.meeting_url), '');
  NEW.notes := NULLIF(BTRIM(NEW.notes), '');
  NEW.cancellation_reason := NULLIF(BTRIM(NEW.cancellation_reason), '');

  IF NEW.doctor_name = '' THEN
    RAISE EXCEPTION 'Doctor name is required.';
  END IF;

  IF NEW.consultation_reason IS NULL THEN
    RAISE EXCEPTION 'Consultation reason is required.';
  END IF;

  IF NEW.scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Consultation date and time are required.';
  END IF;

  IF NEW.meeting_url IS NULL THEN
    RAISE EXCEPTION 'A secure HTTPS meeting link is required.';
  END IF;

  NEW.consultation_date :=
    (NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE;
  NEW.consultation_time :=
    (NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata')::TIME;

  new_status := NEW.status::TEXT;

  IF TG_OP = 'INSERT' THEN
    IF new_status NOT IN ('scheduled', 'pending') THEN
      RAISE EXCEPTION 'New consultations must start as scheduled.';
    END IF;

    NEW.status := 'scheduled'::public.booking_status;
    NEW.requested_by := NEW.parent_id;
    NEW.waiting_at := NULL;
    NEW.started_at := NULL;
    NEW.completed_at := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancellation_reason := NULL;

    RETURN NEW;
  END IF;

  old_status := OLD.status::TEXT;

  IF new_status = old_status THEN
    IF old_status IN ('completed', 'cancelled') AND ROW(
      NEW.doctor_name,
      NEW.specialty,
      NEW.consultation_reason,
      NEW.scheduled_at,
      NEW.meeting_url,
      NEW.notes,
      NEW.reminder_enabled,
      NEW.reminder_minutes_before
    ) IS DISTINCT FROM ROW(
      OLD.doctor_name,
      OLD.specialty,
      OLD.consultation_reason,
      OLD.scheduled_at,
      OLD.meeting_url,
      OLD.notes,
      OLD.reminder_enabled,
      OLD.reminder_minutes_before
    ) THEN
      RAISE EXCEPTION 'Completed or cancelled consultations cannot be edited.';
    END IF;

    RETURN NEW;
  END IF;

  IF new_status = 'cancelled' THEN
    IF old_status NOT IN ('scheduled', 'pending', 'waiting') THEN
      RAISE EXCEPTION 'This consultation can no longer be cancelled.';
    END IF;

    IF NEW.cancellation_reason IS NULL THEN
      RAISE EXCEPTION 'A cancellation reason is required.';
    END IF;

    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    RETURN NEW;
  END IF;

  IF old_status IN ('scheduled', 'pending') AND new_status = 'waiting' THEN
    NEW.waiting_at := COALESCE(NEW.waiting_at, now());

  ELSIF old_status IN ('scheduled', 'pending', 'waiting')
    AND new_status = 'in_progress' THEN
    NEW.waiting_at := COALESCE(NEW.waiting_at, now());
    NEW.started_at := COALESCE(NEW.started_at, now());

  ELSIF old_status = 'in_progress' AND new_status = 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());

  ELSE
    RAISE EXCEPTION 'Invalid consultation status change from % to %.',
      old_status,
      new_status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.validate_video_consultation_workflow()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_video_consultation_workflow_trigger
ON public.video_consultations;

CREATE TRIGGER validate_video_consultation_workflow_trigger
BEFORE INSERT OR UPDATE
ON public.video_consultations
FOR EACH ROW
EXECUTE FUNCTION public.validate_video_consultation_workflow();

-- Linked children can view consultations, but only the parent can mutate them.
DROP POLICY IF EXISTS "View video" ON public.video_consultations;
DROP POLICY IF EXISTS "View video (parent+child)" ON public.video_consultations;
CREATE POLICY "View video (parent+child)"
ON public.video_consultations
FOR SELECT TO authenticated
USING (public.can_view_parent(parent_id));

DROP POLICY IF EXISTS "Create video" ON public.video_consultations;
DROP POLICY IF EXISTS "Create video (parent only)" ON public.video_consultations;
CREATE POLICY "Create video (parent only)"
ON public.video_consultations
FOR INSERT TO authenticated
WITH CHECK (
  parent_id = auth.uid()
  AND requested_by = auth.uid()
);

DROP POLICY IF EXISTS "Update video" ON public.video_consultations;
DROP POLICY IF EXISTS "Update video (parent only)" ON public.video_consultations;
CREATE POLICY "Update video (parent only)"
ON public.video_consultations
FOR UPDATE TO authenticated
USING (parent_id = auth.uid())
WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS "Delete video" ON public.video_consultations;
DROP POLICY IF EXISTS "Delete video (parent only)" ON public.video_consultations;
CREATE POLICY "Delete video (parent only)"
ON public.video_consultations
FOR DELETE TO authenticated
USING (parent_id = auth.uid());

-- Ensure every prescription belongs to the same parent and consultation folder.
CREATE OR REPLACE FUNCTION public.validate_consultation_prescription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  consultation_parent UUID;
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

  IF split_part(NEW.file_path, '/', 1) <> NEW.parent_id::TEXT
     OR split_part(NEW.file_path, '/', 2) <> NEW.consultation_id::TEXT THEN
    RAISE EXCEPTION 'Prescription storage path is invalid.';
  END IF;

  IF NEW.file_type NOT IN (
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ) THEN
    RAISE EXCEPTION 'Unsupported prescription file type.';
  END IF;

  IF NEW.file_size IS NOT NULL AND NEW.file_size > 26214400 THEN
    RAISE EXCEPTION 'Prescription file exceeds the 25 MB limit.';
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
CREATE POLICY "View prescriptions (parent+child)"
ON public.consultation_prescriptions
FOR SELECT TO authenticated
USING (public.can_view_parent(parent_id));

DROP POLICY IF EXISTS "Insert prescriptions (parent only)"
ON public.consultation_prescriptions;
CREATE POLICY "Insert prescriptions (parent only)"
ON public.consultation_prescriptions
FOR INSERT TO authenticated
WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS "Update prescriptions (parent only)"
ON public.consultation_prescriptions;
CREATE POLICY "Update prescriptions (parent only)"
ON public.consultation_prescriptions
FOR UPDATE TO authenticated
USING (parent_id = auth.uid())
WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS "Delete prescriptions (parent only)"
ON public.consultation_prescriptions;
CREATE POLICY "Delete prescriptions (parent only)"
ON public.consultation_prescriptions
FOR DELETE TO authenticated
USING (parent_id = auth.uid());

-- Storage: linked children may read, but only the parent folder owner can write.
DROP POLICY IF EXISTS "prescriptions_read" ON storage.objects;
CREATE POLICY "prescriptions_read"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND public.can_view_parent(((storage.foldername(name))[1])::UUID)
);

DROP POLICY IF EXISTS "prescriptions_insert" ON storage.objects;
CREATE POLICY "prescriptions_insert"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'prescriptions'
  AND ((storage.foldername(name))[1])::UUID = auth.uid()
);

DROP POLICY IF EXISTS "prescriptions_update" ON storage.objects;
CREATE POLICY "prescriptions_update"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND ((storage.foldername(name))[1])::UUID = auth.uid()
)
WITH CHECK (
  bucket_id = 'prescriptions'
  AND ((storage.foldername(name))[1])::UUID = auth.uid()
);

DROP POLICY IF EXISTS "prescriptions_delete" ON storage.objects;
CREATE POLICY "prescriptions_delete"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND ((storage.foldername(name))[1])::UUID = auth.uid()
);

-- Notify the parent and linked children about booking and status changes.
CREATE OR REPLACE FUNCTION public.notify_video_consultation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient UUID;
  elder_name TEXT;
  event_name TEXT;
  notification_message TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = OLD.status
     AND NEW.scheduled_at = OLD.scheduled_at THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(BTRIM(full_name), '')
  INTO elder_name
  FROM public.profiles
  WHERE id = NEW.parent_id;

  elder_name := COALESCE(elder_name, 'Family member');

  IF TG_OP = 'INSERT' THEN
    event_name := 'scheduled';
    notification_message := format(
      'Video consultation for %s with Dr. %s is scheduled for %s.',
      elder_name,
      NEW.doctor_name,
      to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
    );

  ELSIF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    event_name := 'rescheduled';
    notification_message := format(
      'Video consultation for %s with Dr. %s was rescheduled to %s.',
      elder_name,
      NEW.doctor_name,
      to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
    );

  ELSE
    event_name := NEW.status::TEXT;

    CASE NEW.status::TEXT
      WHEN 'waiting' THEN
        notification_message := format(
          '%s has checked in for the video consultation with Dr. %s.',
          elder_name,
          NEW.doctor_name
        );
      WHEN 'in_progress' THEN
        notification_message := format(
          'Video consultation for %s with Dr. %s has started.',
          elder_name,
          NEW.doctor_name
        );
      WHEN 'completed' THEN
        notification_message := format(
          'Video consultation for %s with Dr. %s has been completed.',
          elder_name,
          NEW.doctor_name
        );
      WHEN 'cancelled' THEN
        notification_message := format(
          'Video consultation for %s with Dr. %s was cancelled. Reason: %s',
          elder_name,
          NEW.doctor_name,
          COALESCE(NEW.cancellation_reason, 'Not provided')
        );
      ELSE
        notification_message := format(
          'Video consultation for %s with Dr. %s changed to %s.',
          elder_name,
          NEW.doctor_name,
          replace(NEW.status::TEXT, '_', ' ')
        );
    END CASE;
  END IF;

  FOR recipient IN
    SELECT NEW.parent_id
    UNION
    SELECT link.child_id
    FROM public.parent_child_links AS link
    WHERE link.parent_id = NEW.parent_id
  LOOP
    INSERT INTO public.parent_notifications (
      parent_id,
      sender_id,
      type,
      notification_type,
      message,
      metadata,
      dedup_key
    )
    VALUES (
      recipient,
      NEW.parent_id,
      'video_consult',
      'video_consult',
      notification_message,
      jsonb_build_object(
        'consultation_id', NEW.id,
        'care_parent_id', NEW.parent_id,
        'doctor_name', NEW.doctor_name,
        'specialty', NEW.specialty,
        'scheduled_at', NEW.scheduled_at,
        'status', CASE WHEN TG_OP = 'INSERT' THEN 'scheduled' ELSE NEW.status::TEXT END,
        'event', event_name
      ),
      'video-consult:' || NEW.id::TEXT || ':' || event_name || ':' ||
        extract(epoch FROM NEW.scheduled_at)::BIGINT::TEXT || ':' || recipient::TEXT
    )
    ON CONFLICT (parent_id, dedup_key)
    WHERE dedup_key IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.notify_video_consultation_change()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_video_consultation_change_trigger
ON public.video_consultations;

CREATE TRIGGER notify_video_consultation_change_trigger
AFTER INSERT OR UPDATE OF status, scheduled_at
ON public.video_consultations
FOR EACH ROW
EXECUTE FUNCTION public.notify_video_consultation_change();

-- Create reminder notifications before each consultation, even when the app is
-- closed. The notification record is generated by PostgreSQL; background web
-- push for all notification types can be added in Feature 9.
CREATE OR REPLACE FUNCTION public.create_video_consultation_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  consultation_row RECORD;
  recipient UUID;
  created_count INTEGER := 0;
  reminder_message TEXT;
BEGIN
  FOR consultation_row IN
    SELECT
      consultation.id,
      consultation.parent_id,
      consultation.doctor_name,
      consultation.specialty,
      consultation.consultation_reason,
      consultation.scheduled_at,
      consultation.status,
      consultation.reminder_minutes_before,
      COALESCE(NULLIF(BTRIM(profile.full_name), ''), 'Family member') AS elder_name
    FROM public.video_consultations AS consultation
    LEFT JOIN public.profiles AS profile
      ON profile.id = consultation.parent_id
    LEFT JOIN public.elder_settings AS settings
      ON settings.parent_id = consultation.parent_id
    WHERE consultation.reminder_enabled = true
      AND COALESCE(settings.appointment_reminders_enabled, true) = true
      AND consultation.status::TEXT IN ('scheduled', 'pending', 'waiting')
      AND consultation.scheduled_at > now()
      AND consultation.scheduled_at <=
        now() + make_interval(mins => consultation.reminder_minutes_before)
  LOOP
    reminder_message := format(
      'Video consultation reminder: %s has a consultation with Dr. %s at %s.',
      consultation_row.elder_name,
      consultation_row.doctor_name,
      to_char(
        consultation_row.scheduled_at AT TIME ZONE 'Asia/Kolkata',
        'DD Mon YYYY, HH12:MI AM'
      )
    );

    FOR recipient IN
      SELECT consultation_row.parent_id
      UNION
      SELECT link.child_id
      FROM public.parent_child_links AS link
      WHERE link.parent_id = consultation_row.parent_id
    LOOP
      INSERT INTO public.parent_notifications (
        parent_id,
        sender_id,
        type,
        notification_type,
        message,
        metadata,
        dedup_key
      )
      VALUES (
        recipient,
        consultation_row.parent_id,
        'video_consult',
        'video_consult',
        reminder_message,
        jsonb_build_object(
          'consultation_id', consultation_row.id,
          'care_parent_id', consultation_row.parent_id,
          'doctor_name', consultation_row.doctor_name,
          'specialty', consultation_row.specialty,
          'consultation_reason', consultation_row.consultation_reason,
          'scheduled_at', consultation_row.scheduled_at,
          'status', consultation_row.status::TEXT,
          'event', 'reminder',
          'reminder_minutes_before', consultation_row.reminder_minutes_before
        ),
        'video-consult-reminder:' || consultation_row.id::TEXT || ':' ||
          extract(epoch FROM consultation_row.scheduled_at)::BIGINT::TEXT || ':' ||
          recipient::TEXT
      )
      ON CONFLICT (parent_id, dedup_key)
      WHERE dedup_key IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        created_count := created_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN created_count;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_video_consultation_reminders()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_video_consultation_reminders()
TO postgres, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('video-consultation-reminders');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'video-consultation-reminders',
  '*/5 * * * *',
  $$SELECT public.create_video_consultation_reminders();$$
);

ALTER TABLE public.video_consultations REPLICA IDENTITY FULL;
ALTER TABLE public.consultation_prescriptions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'video_consultations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_consultations;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'consultation_prescriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_prescriptions;
  END IF;
END;
$$;