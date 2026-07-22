CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Per-category push controls. notify_push remains the master switch.
ALTER TABLE public.elder_settings
  ADD COLUMN IF NOT EXISTS push_sos_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_medicine_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_wellbeing_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_appointments_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_caregiver_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_transport_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_video_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_emergency_detection_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_health_risk_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_companion_safety_enabled BOOLEAN NOT NULL DEFAULT true;

-- Delivery properties are stored on the queue so the Edge Function does not
-- have to infer urgency after an event has been claimed.
ALTER TABLE public.care_push_queue
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS ttl_seconds INTEGER NOT NULL DEFAULT 86400,
  ADD COLUMN IF NOT EXISTS require_interaction BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'care_push_queue_urgency_valid'
      AND conrelid = 'public.care_push_queue'::regclass
  ) THEN
    ALTER TABLE public.care_push_queue
      ADD CONSTRAINT care_push_queue_urgency_valid
      CHECK (urgency IN ('very-low', 'low', 'normal', 'high'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'care_push_queue_ttl_valid'
      AND conrelid = 'public.care_push_queue'::regclass
  ) THEN
    ALTER TABLE public.care_push_queue
      ADD CONSTRAINT care_push_queue_ttl_valid
      CHECK (ttl_seconds BETWEEN 60 AND 604800);
  END IF;
END;
$$;

-- Remove the older category-specific queue triggers. A single generic trigger
-- below is now the source of truth and prevents duplicate push events.
DROP TRIGGER IF EXISTS queue_missed_medicine_web_push_trigger
ON public.parent_notifications;

DROP TRIGGER IF EXISTS queue_care_detection_web_push_trigger
ON public.parent_notifications;

-- Queue every supported in-app notification except the initial SOS. Initial SOS
-- push is intentionally sent immediately by sendPushForAlert instead of waiting
-- for the five-minute worker. SOS acknowledgement/resolution events use this
-- queue normally.
CREATE OR REPLACE FUNCTION public.queue_parent_notification_web_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT := COALESCE(NULLIF(NEW.notification_type, ''), NULLIF(NEW.type, ''), 'general');
  v_care_parent_id UUID;
  v_elder_name TEXT;
  v_title TEXT;
  v_url TEXT;
  v_tag TEXT;
  v_urgency TEXT := 'normal';
  v_ttl_seconds INTEGER := 86400;
  v_require_interaction BOOLEAN := false;
BEGIN
  -- The initial SOS uses an immediate server call and is excluded to prevent a
  -- duplicate notification. All status updates are queued below.
  IF v_type = 'sos' THEN
    RETURN NEW;
  END IF;

  IF v_type NOT IN (
    'missed_medicine',
    'missed_checkin',
    'no_app_activity',
    'companion_emergency',
    'health_risk_high',
    'appointment_reminder',
    'caregiver_booking',
    'transport_alert',
    'video_consult',
    'sos_sent',
    'sos_acknowledged',
    'sos_resolved',
    'push_test'
  ) THEN
    RETURN NEW;
  END IF;

  v_care_parent_id := COALESCE(
    CASE
      WHEN COALESCE(NEW.metadata ->> 'care_parent_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (NEW.metadata ->> 'care_parent_id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(NEW.metadata ->> 'parent_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (NEW.metadata ->> 'parent_id')::UUID
      ELSE NULL
    END,
    NEW.sender_id,
    NEW.parent_id
  );

  SELECT NULLIF(BTRIM(profile.full_name), '')
  INTO v_elder_name
  FROM public.profiles AS profile
  WHERE profile.id = v_care_parent_id;

  v_url := CASE
    WHEN COALESCE(NEW.metadata ->> 'url', '') LIKE '/%'
      THEN NEW.metadata ->> 'url'
    WHEN v_type = 'missed_medicine' THEN '/medicines'
    WHEN v_type = 'missed_checkin' THEN '/wellbeing'
    WHEN v_type IN ('no_app_activity', 'companion_emergency') THEN '/emergency-detection'
    WHEN v_type = 'health_risk_high' THEN '/health-risk'
    WHEN v_type = 'appointment_reminder' THEN '/appointments'
    WHEN v_type = 'caregiver_booking' THEN '/caregivers'
    WHEN v_type = 'transport_alert' THEN '/transport'
    WHEN v_type = 'video_consult' THEN '/video'
    WHEN v_type IN ('sos_sent', 'sos_acknowledged', 'sos_resolved') THEN '/sos'
    WHEN v_type = 'push_test' THEN '/settings'
    ELSE '/notifications'
  END;

  v_title := CASE v_type
    WHEN 'missed_medicine' THEN
      CASE WHEN NEW.parent_id = v_care_parent_id
        THEN '💊 Medicine dose missed'
        ELSE '💊 ' || COALESCE(v_elder_name, 'Your family member') || ' missed medicine'
      END
    WHEN 'missed_checkin' THEN
      CASE WHEN NEW.parent_id = v_care_parent_id
        THEN '⚠️ Daily wellbeing check-in missing'
        ELSE '⚠️ ' || COALESCE(v_elder_name, 'Your family member') || ' has not checked in'
      END
    WHEN 'no_app_activity' THEN
      CASE WHEN NEW.parent_id = v_care_parent_id
        THEN '🚨 No ElderCare app activity'
        ELSE '🚨 No app activity from ' || COALESCE(v_elder_name, 'your family member')
      END
    WHEN 'companion_emergency' THEN '🚨 Companion safety warning'
    WHEN 'health_risk_high' THEN
      CASE WHEN NEW.parent_id = v_care_parent_id
        THEN '❤️ High health-risk screening'
        ELSE '❤️ High health-risk result for ' || COALESCE(v_elder_name, 'your family member')
      END
    WHEN 'appointment_reminder' THEN '📅 Doctor appointment reminder'
    WHEN 'caregiver_booking' THEN '🧑‍⚕️ Caregiver booking update'
    WHEN 'transport_alert' THEN '🚗 Transport update'
    WHEN 'video_consult' THEN '🎥 Video consultation update'
    WHEN 'sos_sent' THEN '🚨 SOS alert sent'
    WHEN 'sos_acknowledged' THEN '✅ SOS acknowledged'
    WHEN 'sos_resolved' THEN '🛡️ SOS resolved'
    WHEN 'push_test' THEN '🔔 ElderCare push test'
    ELSE 'ElderCare notification'
  END;

  IF v_type IN (
    'missed_medicine',
    'missed_checkin',
    'no_app_activity',
    'companion_emergency',
    'health_risk_high',
    'sos_sent',
    'sos_acknowledged',
    'sos_resolved'
  ) THEN
    v_urgency := 'high';
    v_ttl_seconds := 3600;
    v_require_interaction := true;
  ELSIF v_type IN ('appointment_reminder', 'video_consult') THEN
    v_urgency := 'normal';
    v_ttl_seconds := 86400;
    v_require_interaction := false;
  ELSE
    v_urgency := 'normal';
    v_ttl_seconds := 86400;
    v_require_interaction := false;
  END IF;

  v_tag := v_type || '-' || COALESCE(
    NULLIF(NEW.dedup_key, ''),
    NEW.id::TEXT
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
    metadata,
    urgency,
    ttl_seconds,
    require_interaction
  )
  VALUES (
    NEW.id,
    NEW.parent_id,
    v_care_parent_id,
    v_type,
    v_title,
    NEW.message,
    v_url,
    v_tag,
    COALESCE(NEW.metadata, '{}'::JSONB)
      || jsonb_build_object(
        'notification_id', NEW.id,
        'recipient_id', NEW.parent_id,
        'care_parent_id', v_care_parent_id
      ),
    v_urgency,
    v_ttl_seconds,
    v_require_interaction
  )
  ON CONFLICT (notification_id)
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.queue_parent_notification_web_push()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_parent_notification_web_push_trigger
ON public.parent_notifications;

CREATE TRIGGER queue_parent_notification_web_push_trigger
AFTER INSERT
ON public.parent_notifications
FOR EACH ROW
EXECUTE FUNCTION public.queue_parent_notification_web_push();

-- Invoke the Edge Function only when work is ready. This allows a one-minute
-- cron cadence without consuming Edge Function calls while the queue is empty.
CREATE OR REPLACE FUNCTION public.invoke_care_push_delivery()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_function_url TEXT;
  v_cron_secret TEXT;
  v_request_id BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.care_push_queue AS queue
    WHERE (
      queue.status = 'pending'
      AND queue.available_at <= now()
      AND queue.attempts < 3
    )
    OR (
      queue.status = 'processing'
      AND queue.locked_at < now() - interval '10 minutes'
      AND queue.attempts < 3
    )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT value
  INTO v_function_url
  FROM private.runtime_settings
  WHERE key = 'care_push_function_url';

  SELECT value
  INTO v_cron_secret
  FROM private.runtime_settings
  WHERE key = 'care_push_cron_secret';

  IF NULLIF(BTRIM(v_function_url), '') IS NULL
    OR NULLIF(BTRIM(v_cron_secret), '') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-care-push-secret', v_cron_secret
    ),
    body := jsonb_build_object('batchSize', 50),
    timeout_milliseconds := 10000
  )
  INTO v_request_id;

  RETURN v_request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Unable to invoke care-push Edge Function: %', SQLERRM;
    RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION public.invoke_care_push_delivery()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.invoke_care_push_delivery()
TO postgres, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('deliver-care-web-push');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'deliver-care-web-push',
  '* * * * *',
  $$SELECT public.invoke_care_push_delivery();$$
);

-- Server-side appointment reminders so they are generated even if no browser is
-- open. The existing exact-time browser alarm can continue as an additional
-- local reminder for the parent.
CREATE OR REPLACE FUNCTION public.create_appointment_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appointment_row RECORD;
  recipient UUID;
  inserted_count INTEGER := 0;
  reminder_message TEXT;
BEGIN
  FOR appointment_row IN
    SELECT
      appointment.id,
      appointment.parent_id,
      appointment.title,
      appointment.doctor_name,
      appointment.specialty,
      appointment.location,
      appointment.scheduled_at,
      COALESCE(NULLIF(BTRIM(profile.full_name), ''), 'Family member') AS elder_name
    FROM public.appointments AS appointment
    LEFT JOIN public.profiles AS profile
      ON profile.id = appointment.parent_id
    LEFT JOIN public.elder_settings AS settings
      ON settings.parent_id = appointment.parent_id
    WHERE appointment.reminder_enabled = true
      AND COALESCE(settings.appointment_reminders_enabled, true) = true
      AND appointment.status::TEXT IN ('pending', 'confirmed', 'scheduled')
      AND appointment.scheduled_at > now()
      AND appointment.scheduled_at <= now() + interval '24 hours'
  LOOP
    reminder_message := format(
      'Appointment reminder: %s has %s with Dr. %s at %s.%s',
      appointment_row.elder_name,
      COALESCE(NULLIF(appointment_row.title, ''), 'an appointment'),
      appointment_row.doctor_name,
      to_char(
        appointment_row.scheduled_at AT TIME ZONE 'Asia/Kolkata',
        'DD Mon YYYY, HH12:MI AM'
      ),
      CASE
        WHEN NULLIF(BTRIM(COALESCE(appointment_row.location, '')), '') IS NOT NULL
          THEN ' Location: ' || appointment_row.location
        ELSE ''
      END
    );

    FOR recipient IN
      SELECT appointment_row.parent_id
      UNION
      SELECT link.child_id
      FROM public.parent_child_links AS link
      WHERE link.parent_id = appointment_row.parent_id
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
        appointment_row.parent_id,
        'appointment_reminder',
        'appointment_reminder',
        reminder_message,
        jsonb_build_object(
          'appointment_id', appointment_row.id,
          'care_parent_id', appointment_row.parent_id,
          'title', appointment_row.title,
          'doctor_name', appointment_row.doctor_name,
          'specialty', appointment_row.specialty,
          'location', appointment_row.location,
          'scheduled_at', appointment_row.scheduled_at,
          'url', '/appointments'
        ),
        'appointment-reminder:'
          || appointment_row.id::TEXT
          || ':'
          || extract(epoch FROM appointment_row.scheduled_at)::BIGINT::TEXT
          || ':'
          || recipient::TEXT
      )
      ON CONFLICT (parent_id, dedup_key)
      WHERE dedup_key IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_appointment_reminders()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_appointment_reminders()
TO postgres, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('create-appointment-reminders');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'create-appointment-reminders',
  '*/5 * * * *',
  $$SELECT public.create_appointment_reminders();$$
);

-- A real end-to-end test: this inserts an in-app notification, which is queued
-- by the same trigger and delivered by the same Edge Function as production
-- events. It therefore tests the subscription, database queue, cron secret,
-- Edge Function, VAPID keys, and service worker together.
CREATE OR REPLACE FUNCTION public.create_push_test_notification()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_notification_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  INSERT INTO public.parent_notifications (
    parent_id,
    sender_id,
    type,
    notification_type,
    message,
    metadata
  )
  VALUES (
    v_user_id,
    v_user_id,
    'push_test',
    'push_test',
    'This is a real background push test from ElderCare Connect.',
    jsonb_build_object(
      'care_parent_id', v_user_id,
      'url', '/settings',
      'created_by_test', true
    )
  )
  RETURNING id INTO v_notification_id;

  -- Ask the worker to process the queue immediately. The normal five-minute
  -- cron remains the fallback if the HTTP request is delayed.
  PERFORM public.invoke_care_push_delivery();

  RETURN v_notification_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_push_test_notification()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.create_push_test_notification()
TO authenticated;