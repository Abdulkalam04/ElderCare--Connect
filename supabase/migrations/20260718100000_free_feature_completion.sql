CREATE EXTENSION IF NOT EXISTS pg_cron;






ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_app_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_source TEXT;

CREATE OR REPLACE FUNCTION public.touch_app_activity(
  _source TEXT DEFAULT 'web'
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    last_app_activity_at = v_now,
    last_activity_source = LEFT(
      COALESCE(NULLIF(TRIM(_source), ''), 'web'),
      40
    ),
    updated_at = v_now
  WHERE id = v_user
    AND role = 'parent';

  RETURN v_now;
END;
$$;

REVOKE ALL
ON FUNCTION public.touch_app_activity(TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.touch_app_activity(TEXT)
TO authenticated;






ALTER TABLE public.sos_alerts
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC,
  ADD COLUMN IF NOT EXISTS live_location_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sos_alerts_active_parent
  ON public.sos_alerts(parent_id, created_at DESC)
  WHERE status IN ('active', 'acknowledged');




CREATE TABLE IF NOT EXISTS public.trusted_caregivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  parent_id UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  caregiver_type TEXT NOT NULL DEFAULT 'caretaker'
    CHECK (
      caregiver_type IN (
        'nurse',
        'caretaker',
        'physiotherapist',
        'companion',
        'other'
      )
    ),

  phone TEXT,
  email TEXT,
  address TEXT,

  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  available BOOLEAN NOT NULL DEFAULT true,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trusted_caregivers_contact_required
    CHECK (
      NULLIF(TRIM(COALESCE(phone, '')), '') IS NOT NULL
      OR
      NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
    ),

  CONSTRAINT trusted_caregivers_latitude_valid
    CHECK (
      latitude IS NULL
      OR latitude BETWEEN -90 AND 90
    ),

  CONSTRAINT trusted_caregivers_longitude_valid
    CHECK (
      longitude IS NULL
      OR longitude BETWEEN -180 AND 180
    ),

  CONSTRAINT trusted_caregivers_coordinates_pair
    CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR
      (latitude IS NOT NULL AND longitude IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS update_trusted_caregivers_updated_at
ON public.trusted_caregivers;

CREATE TRIGGER update_trusted_caregivers_updated_at
BEFORE UPDATE
ON public.trusted_caregivers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_trusted_caregivers_parent_available
  ON public.trusted_caregivers(
    parent_id,
    available,
    created_at DESC
  );

ALTER TABLE public.trusted_caregivers
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents manage trusted caregivers"
ON public.trusted_caregivers;

CREATE POLICY "Parents manage trusted caregivers"
ON public.trusted_caregivers
FOR ALL
TO authenticated
USING (
  parent_id = auth.uid()
)
WITH CHECK (
  parent_id = auth.uid()
);

DROP POLICY IF EXISTS "Linked family can view trusted caregivers"
ON public.trusted_caregivers;

CREATE POLICY "Linked family can view trusted caregivers"
ON public.trusted_caregivers
FOR SELECT
TO authenticated
USING (
  public.is_linked_child(parent_id)
);




ALTER TABLE public.parent_notifications
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS parent_notifications_recipient_dedup_uidx
  ON public.parent_notifications(parent_id, dedup_key)
  WHERE dedup_key IS NOT NULL;







CREATE OR REPLACE FUNCTION public.create_care_alert_notifications(
  _parent_id UUID,
  _type TEXT,
  _message TEXT,
  _dedup_suffix TEXT,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  WITH recipients AS (
    SELECT _parent_id AS recipient_id

    UNION

    SELECT pcl.child_id
    FROM public.parent_child_links AS pcl
    WHERE pcl.parent_id = _parent_id
  ),
  inserted AS (
    INSERT INTO public.parent_notifications (
      parent_id,
      sender_id,
      type,
      notification_type,
      message,
      is_read,
      metadata,
      dedup_key
    )
    SELECT
      recipients.recipient_id,
      _parent_id,
      _type,
      _type,
      _message,
      false,
      COALESCE(_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'care_parent_id',
          _parent_id
        ),
      _type || ':' || _dedup_suffix
    FROM recipients
    ON CONFLICT (parent_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)
  INTO v_inserted
  FROM inserted;

  RETURN v_inserted;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_care_alert_notifications(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  JSONB
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_care_alert_notifications(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  JSONB
)
TO postgres, service_role;




DO $$
BEGIN
  PERFORM cron.unschedule('detect-care-issues');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;






DROP FUNCTION IF EXISTS public.detect_care_issues();

CREATE FUNCTION public.detect_care_issues()
RETURNS TABLE (
  missed_medicine_alerts INTEGER,
  no_checkin_alerts INTEGER,
  no_activity_alerts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missed INTEGER := 0;
  v_no_checkin INTEGER := 0;
  v_no_activity INTEGER := 0;

  v_now_local TIMESTAMP :=
    now() AT TIME ZONE 'Asia/Kolkata';

  v_today DATE :=
    (now() AT TIME ZONE 'Asia/Kolkata')::date;

  rec RECORD;
BEGIN
  -- -------------------------------------------------------------------------
  -- Missed medicine
  --
  -- A medicine is considered missed after its scheduled time plus the
  -- configured grace period has passed.
  -- -------------------------------------------------------------------------
  FOR rec IN
    SELECT
      m.id,
      m.parent_id,
      m.name,
      m.dosage,
      m.schedule_time,
      COALESCE(
        es.med_reminder_lead_minutes,
        10
      ) AS grace_minutes
    FROM public.medicines AS m
    LEFT JOIN public.elder_settings AS es
      ON es.parent_id = m.parent_id
    WHERE m.active = true
      AND COALESCE(
        es.med_reminders_enabled,
        true
      ) = true
      AND (
        v_today
        + m.schedule_time
        + make_interval(
          mins => COALESCE(
            es.med_reminder_lead_minutes,
            10
          )
        )
      ) <= v_now_local
      AND NOT EXISTS (
        SELECT 1
        FROM public.medicine_logs AS ml
        WHERE ml.medicine_id = m.id
          AND ml.parent_id = m.parent_id
          AND ml.log_date = v_today
      )
  LOOP
    v_missed :=
      v_missed
      + public.create_care_alert_notifications(
          rec.parent_id,
          'missed_medicine',

          'Missed medicine: '
            || rec.name
            || CASE
                WHEN NULLIF(rec.dosage, '') IS NOT NULL
                  THEN ' (' || rec.dosage || ')'
                ELSE ''
              END
            || ' was due at '
            || to_char(rec.schedule_time, 'HH24:MI')
            || '.',

          rec.id::text || ':' || v_today::text,

          jsonb_build_object(
            'medicine_id',
            rec.id,

            'medicine_name',
            rec.name,

            'schedule_time',
            rec.schedule_time,

            'grace_minutes',
            rec.grace_minutes,

            'severity',
            'warning'
          )
        );
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Missing daily wellbeing check after 8 PM India time
  -- -------------------------------------------------------------------------
  IF EXTRACT(HOUR FROM v_now_local) >= 20 THEN
    FOR rec IN
      SELECT
        p.id AS parent_id
      FROM public.profiles AS p
      LEFT JOIN public.elder_settings AS es
        ON es.parent_id = p.id
      WHERE p.role = 'parent'
        AND COALESCE(
          es.wellbeing_reminders_enabled,
          true
        ) = true
        AND p.created_at < now() - interval '24 hours'
        AND NOT EXISTS (
          SELECT 1
          FROM public.wellbeing_checks AS w
          WHERE w.parent_id = p.id
            AND w.check_date = v_today
        )
    LOOP
      v_no_checkin :=
        v_no_checkin
        + public.create_care_alert_notifications(
            rec.parent_id,
            'missed_checkin',

            'No daily wellbeing check-in has been completed today.',

            rec.parent_id::text
              || ':'
              || v_today::text,

            jsonb_build_object(
              'check_date',
              v_today,

              'severity',
              'warning'
            )
          );
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------------
  -- No ElderCare app activity for 24 hours
  --
  -- This checks ElderCare Connect activity only, not activity across the
  -- user's entire phone.
  -- -------------------------------------------------------------------------
  FOR rec IN
    SELECT
      p.id AS parent_id,
      p.last_app_activity_at
    FROM public.profiles AS p
    WHERE p.role = 'parent'
      AND p.created_at < now() - interval '48 hours'
      AND p.last_app_activity_at IS NOT NULL
      AND p.last_app_activity_at
        < now() - interval '24 hours'
  LOOP
    v_no_activity :=
      v_no_activity
      + public.create_care_alert_notifications(
          rec.parent_id,
          'no_app_activity',

          'No activity has been detected in the ElderCare Connect app for more than 24 hours.',

          rec.parent_id::text
            || ':'
            || (
              date_trunc(
                'day',
                now() AT TIME ZONE 'Asia/Kolkata'
              )
            )::date::text,

          jsonb_build_object(
            'last_app_activity_at',
            rec.last_app_activity_at,

            'severity',
            'alert',

            'scope',
            'eldercare_app_only'
          )
        );
  END LOOP;

  RETURN QUERY
  SELECT
    v_missed,
    v_no_checkin,
    v_no_activity;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      'detect_care_issues failed: %',
      SQLERRM;

    RETURN QUERY
    SELECT
      0,
      0,
      0;
END;
$$;

REVOKE ALL
ON FUNCTION public.detect_care_issues()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.detect_care_issues()
TO postgres, service_role;





SELECT cron.schedule(
  'detect-care-issues',
  '*/15 * * * *',
  $$SELECT public.detect_care_issues();$$
);




ALTER TABLE public.trusted_caregivers
REPLICA IDENTITY FULL;

ALTER TABLE public.sos_alerts
REPLICA IDENTITY FULL;

ALTER TABLE public.profiles
REPLICA IDENTITY FULL;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'trusted_caregivers',
    'sos_alerts',
    'profiles'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        v_table
      );
    END IF;
  END LOOP;

EXCEPTION
  WHEN undefined_object THEN
    NULL;
END;
$$;

SELECT *
FROM public.detect_care_issues();