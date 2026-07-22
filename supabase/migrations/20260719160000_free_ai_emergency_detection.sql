CREATE EXTENSION IF NOT EXISTS pg_cron;




ALTER TABLE public.elder_settings
  ADD COLUMN IF NOT EXISTS emergency_detection_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_missed_medicine BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_missed_checkin BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_no_app_activity BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wellbeing_checkin_cutoff TIME NOT NULL DEFAULT TIME '20:00',
  ADD COLUMN IF NOT EXISTS no_app_activity_hours INTEGER NOT NULL DEFAULT 24;

UPDATE public.elder_settings
SET no_app_activity_hours = LEAST(168, GREATEST(6, no_app_activity_hours));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elder_settings_no_activity_hours_range'
      AND conrelid = 'public.elder_settings'::regclass
  ) THEN
    ALTER TABLE public.elder_settings
      ADD CONSTRAINT elder_settings_no_activity_hours_range
      CHECK (no_app_activity_hours BETWEEN 6 AND 168);
  END IF;
END
$$;




CREATE TABLE IF NOT EXISTS public.care_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  alert_type TEXT NOT NULL
    CHECK (alert_type IN ('missed_medicine', 'missed_checkin', 'no_app_activity')),

  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'high')),

  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'resolved')),

  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT care_alerts_source_unique
    UNIQUE (parent_id, alert_type, source_key)
);

CREATE INDEX IF NOT EXISTS care_alerts_parent_status_idx
  ON public.care_alerts(parent_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS care_alerts_type_detected_idx
  ON public.care_alerts(alert_type, detected_at DESC);

DROP TRIGGER IF EXISTS trg_care_alerts_updated ON public.care_alerts;
CREATE TRIGGER trg_care_alerts_updated
BEFORE UPDATE ON public.care_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.care_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.care_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.care_alerts TO authenticated;
GRANT ALL ON TABLE public.care_alerts TO service_role;

DROP POLICY IF EXISTS "View linked care alerts" ON public.care_alerts;
CREATE POLICY "View linked care alerts"
ON public.care_alerts
FOR SELECT
TO authenticated
USING (public.can_view_parent(parent_id));

ALTER TABLE public.care_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.care_alerts;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_object THEN
    NULL;
END
$$;





CREATE OR REPLACE FUNCTION public.set_care_alert_status(
  _alert_id UUID,
  _status TEXT,
  _resolution_note TEXT DEFAULT NULL
)
RETURNS public.care_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert public.care_alerts;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF _status NOT IN ('acknowledged', 'resolved') THEN
    RAISE EXCEPTION 'Status must be acknowledged or resolved.';
  END IF;

  SELECT *
  INTO v_alert
  FROM public.care_alerts
  WHERE id = _alert_id;

  IF v_alert.id IS NULL THEN
    RAISE EXCEPTION 'Care alert was not found.';
  END IF;

  IF NOT public.can_view_parent(v_alert.parent_id) THEN
    RAISE EXCEPTION 'You do not have access to this care alert.' USING ERRCODE = '42501';
  END IF;

  IF _status = 'acknowledged' THEN
    UPDATE public.care_alerts
    SET
      status = CASE WHEN status = 'resolved' THEN status ELSE 'acknowledged' END,
      acknowledged_at = COALESCE(acknowledged_at, now()),
      acknowledged_by = COALESCE(acknowledged_by, v_user)
    WHERE id = _alert_id
    RETURNING * INTO v_alert;
  ELSE
    UPDATE public.care_alerts
    SET
      status = 'resolved',
      acknowledged_at = COALESCE(acknowledged_at, now()),
      acknowledged_by = COALESCE(acknowledged_by, v_user),
      resolved_at = COALESCE(resolved_at, now()),
      resolved_by = COALESCE(resolved_by, v_user),
      resolution_note = NULLIF(LEFT(BTRIM(COALESCE(_resolution_note, '')), 500), '')
    WHERE id = _alert_id
    RETURNING * INTO v_alert;
  END IF;

  RETURN v_alert;
END;
$$;

REVOKE ALL
ON FUNCTION public.set_care_alert_status(UUID, TEXT, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.set_care_alert_status(UUID, TEXT, TEXT)
TO authenticated, service_role;





CREATE OR REPLACE FUNCTION public.create_detected_care_alert(
  _parent_id UUID,
  _alert_type TEXT,
  _severity TEXT,
  _title TEXT,
  _message TEXT,
  _source_key TEXT,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO public.care_alerts (
    parent_id,
    alert_type,
    severity,
    title,
    message,
    source_key,
    metadata
  )
  VALUES (
    _parent_id,
    _alert_type,
    _severity,
    _title,
    _message,
    _source_key,
    COALESCE(_metadata, '{}'::jsonb)
  )
  ON CONFLICT (parent_id, alert_type, source_key)
  DO NOTHING
  RETURNING id INTO v_alert_id;

  IF v_alert_id IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM public.create_care_alert_notifications(
    _parent_id,
    _alert_type,
    _message,
    _source_key,
    COALESCE(_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'care_alert_id', v_alert_id,
        'care_alert_title', _title,
        'severity', _severity
      )
  );

  RETURN 1;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_detected_care_alert(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_detected_care_alert(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
TO postgres, service_role;




CREATE OR REPLACE FUNCTION public.run_care_issue_detection(
  _parent_id UUID DEFAULT NULL
)
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

  v_now_local TIMESTAMP := now() AT TIME ZONE 'Asia/Kolkata';
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  rec RECORD;
BEGIN
  -- Missed medicines
  FOR rec IN
    SELECT
      m.id,
      m.parent_id,
      m.name,
      m.dosage,
      m.schedule_time,
      COALESCE(es.med_reminder_lead_minutes, 10) AS grace_minutes
    FROM public.medicines AS m
    LEFT JOIN public.elder_settings AS es
      ON es.parent_id = m.parent_id
    WHERE (_parent_id IS NULL OR m.parent_id = _parent_id)
      AND m.active = true
      AND COALESCE(es.emergency_detection_enabled, true) = true
      AND COALESCE(es.detect_missed_medicine, true) = true
      AND COALESCE(es.med_reminders_enabled, true) = true
      AND (
        v_today
        + m.schedule_time
        + make_interval(mins => COALESCE(es.med_reminder_lead_minutes, 10))
      ) <= v_now_local
      AND NOT EXISTS (
        SELECT 1
        FROM public.medicine_logs AS ml
        WHERE ml.medicine_id = m.id
          AND ml.parent_id = m.parent_id
          AND ml.log_date = v_today
      )
  LOOP
    v_missed := v_missed + public.create_detected_care_alert(
      rec.parent_id,
      'missed_medicine',
      'warning',
      'Missed medicine dose',
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
        'medicine_id', rec.id,
        'medicine_name', rec.name,
        'schedule_time', rec.schedule_time,
        'grace_minutes', rec.grace_minutes,
        'check_date', v_today,
        'recommended_action', 'Confirm the dose and contact the care recipient.'
      )
    );
  END LOOP;

  -- Missing wellbeing check-in after the configured India-time cutoff.
  FOR rec IN
    SELECT
      p.id AS parent_id,
      COALESCE(es.wellbeing_checkin_cutoff, TIME '20:00') AS cutoff_time
    FROM public.profiles AS p
    LEFT JOIN public.elder_settings AS es
      ON es.parent_id = p.id
    WHERE (_parent_id IS NULL OR p.id = _parent_id)
      AND p.role = 'parent'
      AND COALESCE(es.emergency_detection_enabled, true) = true
      AND COALESCE(es.detect_missed_checkin, true) = true
      AND COALESCE(es.wellbeing_reminders_enabled, true) = true
      AND p.created_at < now() - interval '24 hours'
      AND v_now_local::time >= COALESCE(es.wellbeing_checkin_cutoff, TIME '20:00')
      AND NOT EXISTS (
        SELECT 1
        FROM public.wellbeing_checks AS w
        WHERE w.parent_id = p.id
          AND w.check_date = v_today
      )
  LOOP
    v_no_checkin := v_no_checkin + public.create_detected_care_alert(
      rec.parent_id,
      'missed_checkin',
      'warning',
      'Daily wellbeing check-in missing',
      'No daily wellbeing check-in has been completed by '
        || to_char(rec.cutoff_time, 'HH24:MI')
        || ' today.',
      rec.parent_id::text || ':' || v_today::text,
      jsonb_build_object(
        'check_date', v_today,
        'cutoff_time', rec.cutoff_time,
        'recommended_action', 'Contact the care recipient and request a wellbeing check-in.'
      )
    );
  END LOOP;

  -- No ElderCare Connect activity.
  -- COALESCE fixes the old gap where accounts that never sent a heartbeat were
  -- excluded forever. General phone activity is intentionally not inspected.
  FOR rec IN
    SELECT
      p.id AS parent_id,
      p.last_app_activity_at,
      p.created_at,
      COALESCE(es.no_app_activity_hours, 24) AS threshold_hours,
      COALESCE(p.last_app_activity_at, p.created_at) AS last_signal_at
    FROM public.profiles AS p
    LEFT JOIN public.elder_settings AS es
      ON es.parent_id = p.id
    WHERE (_parent_id IS NULL OR p.id = _parent_id)
      AND p.role = 'parent'
      AND COALESCE(es.emergency_detection_enabled, true) = true
      AND COALESCE(es.detect_no_app_activity, true) = true
      AND COALESCE(p.last_app_activity_at, p.created_at)
        < now() - make_interval(hours => COALESCE(es.no_app_activity_hours, 24))
  LOOP
    v_no_activity := v_no_activity + public.create_detected_care_alert(
      rec.parent_id,
      'no_app_activity',
      'high',
      'No ElderCare app activity detected',
      'No activity has been detected inside ElderCare Connect for more than '
        || rec.threshold_hours::text
        || ' hours.',
      rec.parent_id::text
        || ':'
        || (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata'))::date::text,
      jsonb_build_object(
        'last_app_activity_at', rec.last_app_activity_at,
        'account_created_at', rec.created_at,
        'last_signal_at', rec.last_signal_at,
        'threshold_hours', rec.threshold_hours,
        'scope', 'eldercare_app_only',
        'recommended_action', 'Call the care recipient and verify that they are safe.'
      )
    );
  END LOOP;

  RETURN QUERY SELECT v_missed, v_no_checkin, v_no_activity;
END;
$$;

REVOKE ALL
ON FUNCTION public.run_care_issue_detection(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.run_care_issue_detection(UUID)
TO postgres, service_role;


DROP FUNCTION IF EXISTS public.detect_care_issues();
CREATE FUNCTION public.detect_care_issues()
RETURNS TABLE (
  missed_medicine_alerts INTEGER,
  no_checkin_alerts INTEGER,
  no_activity_alerts INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.run_care_issue_detection(NULL);
$$;

REVOKE ALL ON FUNCTION public.detect_care_issues() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_care_issues() TO postgres, service_role;


CREATE OR REPLACE FUNCTION public.detect_care_issues_for_parent(
  _parent_id UUID
)
RETURNS TABLE (
  missed_medicine_alerts INTEGER,
  no_checkin_alerts INTEGER,
  no_activity_alerts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_view_parent(_parent_id) THEN
    RAISE EXCEPTION 'You do not have access to this care-recipient account.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.run_care_issue_detection(_parent_id);
END;
$$;

REVOKE ALL
ON FUNCTION public.detect_care_issues_for_parent(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.detect_care_issues_for_parent(UUID)
TO authenticated, service_role;




CREATE OR REPLACE FUNCTION public.resolve_medicine_care_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.care_alerts
  SET
    status = 'resolved',
    resolved_at = COALESCE(resolved_at, now()),
    resolution_note = COALESCE(resolution_note, 'Medicine was marked as taken.')
  WHERE parent_id = NEW.parent_id
    AND alert_type = 'missed_medicine'
    AND status IN ('active', 'acknowledged')
    AND metadata ->> 'medicine_id' = NEW.medicine_id::text
    AND metadata ->> 'check_date' = NEW.log_date::text;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_medicine_care_alert_trigger ON public.medicine_logs;
CREATE TRIGGER resolve_medicine_care_alert_trigger
AFTER INSERT ON public.medicine_logs
FOR EACH ROW
EXECUTE FUNCTION public.resolve_medicine_care_alert();

CREATE OR REPLACE FUNCTION public.resolve_wellbeing_care_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.care_alerts
  SET
    status = 'resolved',
    resolved_at = COALESCE(resolved_at, now()),
    resolution_note = COALESCE(resolution_note, 'Daily wellbeing check-in was completed.')
  WHERE parent_id = NEW.parent_id
    AND alert_type = 'missed_checkin'
    AND status IN ('active', 'acknowledged')
    AND metadata ->> 'check_date' = NEW.check_date::text;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_wellbeing_care_alert_trigger ON public.wellbeing_checks;
CREATE TRIGGER resolve_wellbeing_care_alert_trigger
AFTER INSERT ON public.wellbeing_checks
FOR EACH ROW
EXECUTE FUNCTION public.resolve_wellbeing_care_alert();

CREATE OR REPLACE FUNCTION public.resolve_activity_care_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_app_activity_at IS DISTINCT FROM OLD.last_app_activity_at
     AND NEW.last_app_activity_at IS NOT NULL THEN
    UPDATE public.care_alerts
    SET
      status = 'resolved',
      resolved_at = COALESCE(resolved_at, now()),
      resolution_note = COALESCE(resolution_note, 'ElderCare app activity resumed.')
    WHERE parent_id = NEW.id
      AND alert_type = 'no_app_activity'
      AND status IN ('active', 'acknowledged');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_activity_care_alert_trigger ON public.profiles;
CREATE TRIGGER resolve_activity_care_alert_trigger
AFTER UPDATE OF last_app_activity_at ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.resolve_activity_care_alert();





DROP TRIGGER IF EXISTS queue_missed_medicine_web_push_trigger
ON public.parent_notifications;

DROP TRIGGER IF EXISTS queue_care_detection_web_push_trigger
ON public.parent_notifications;

CREATE OR REPLACE FUNCTION public.queue_care_detection_web_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT := COALESCE(NEW.notification_type, NEW.type);
  v_care_parent_id UUID;
  v_elder_name TEXT;
  v_title TEXT;
  v_url TEXT := '/emergency-detection';
  v_tag_suffix TEXT;
BEGIN
  IF v_type NOT IN ('missed_medicine', 'missed_checkin', 'no_app_activity') THEN
    RETURN NEW;
  END IF;

  v_care_parent_id := COALESCE(
    NULLIF(NEW.metadata ->> 'care_parent_id', '')::UUID,
    NEW.sender_id
  );

  SELECT NULLIF(BTRIM(full_name), '')
  INTO v_elder_name
  FROM public.profiles
  WHERE id = v_care_parent_id;

  IF v_type = 'missed_medicine' THEN
    v_title := CASE
      WHEN NEW.parent_id = v_care_parent_id THEN '💊 Medicine dose missed'
      ELSE '💊 ' || COALESCE(v_elder_name, 'Your family member') || ' missed medicine'
    END;
  ELSIF v_type = 'missed_checkin' THEN
    v_title := CASE
      WHEN NEW.parent_id = v_care_parent_id THEN '⚠️ Daily check-in missing'
      ELSE '⚠️ ' || COALESCE(v_elder_name, 'Your family member') || ' has not checked in'
    END;
  ELSE
    v_title := CASE
      WHEN NEW.parent_id = v_care_parent_id THEN '🚨 No ElderCare app activity'
      ELSE '🚨 No app activity from ' || COALESCE(v_elder_name, 'your family member')
    END;
  END IF;

  v_tag_suffix := COALESCE(
    NEW.metadata ->> 'care_alert_id',
    NEW.dedup_key,
    NEW.id::text
  );

  INSERT INTO public.care_push_queue (
    notification_id,
    recipient_id,
    care_parent_id,
    notification_type,
    title,
    body,
    url,
    tag,
    metadata
  )
  VALUES (
    NEW.id,
    NEW.parent_id,
    v_care_parent_id,
    v_type,
    v_title,
    NEW.message,
    v_url,
    v_type || '-' || v_tag_suffix || '-' || NEW.parent_id::text,
    COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'notification_id', NEW.id,
        'recipient_id', NEW.parent_id,
        'care_parent_id', v_care_parent_id
      )
  )
  ON CONFLICT (notification_id)
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.queue_care_detection_web_push()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER queue_care_detection_web_push_trigger
AFTER INSERT ON public.parent_notifications
FOR EACH ROW
EXECUTE FUNCTION public.queue_care_detection_web_push();




DO $$
BEGIN
  PERFORM cron.unschedule('detect-care-issues');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END
$$;

SELECT cron.schedule(
  'detect-care-issues',
  '*/15 * * * *',
  $$SELECT public.detect_care_issues();$$
);


SELECT * FROM public.detect_care_issues();