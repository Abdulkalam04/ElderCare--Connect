ALTER TABLE public.elder_settings
  ADD COLUMN IF NOT EXISTS health_risk_alerts_enabled BOOLEAN NOT NULL DEFAULT true;




ALTER TABLE public.health_risk_assessments
  ADD COLUMN IF NOT EXISTS warning_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generated_by TEXT NOT NULL DEFAULT 'rules',
  ADD COLUMN IF NOT EXISTS source_mode TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_vital_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  ADD COLUMN IF NOT EXISTS comparison JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.health_risk_assessments
  DROP CONSTRAINT IF EXISTS health_risk_generated_by_check;
ALTER TABLE public.health_risk_assessments
  ADD CONSTRAINT health_risk_generated_by_check
  CHECK (generated_by IN ('rules', 'rules+gemini')) NOT VALID;

ALTER TABLE public.health_risk_assessments
  DROP CONSTRAINT IF EXISTS health_risk_source_mode_check;
ALTER TABLE public.health_risk_assessments
  ADD CONSTRAINT health_risk_source_mode_check
  CHECK (source_mode IN ('manual', 'latest_vitals')) NOT VALID;

ALTER TABLE public.health_risk_assessments
  DROP CONSTRAINT IF EXISTS health_risk_warning_flags_limit;
ALTER TABLE public.health_risk_assessments
  ADD CONSTRAINT health_risk_warning_flags_limit
  CHECK (cardinality(warning_flags) <= 20) NOT VALID;

CREATE INDEX IF NOT EXISTS health_risk_parent_level_created_idx
  ON public.health_risk_assessments(parent_id, risk_level, created_at DESC);




ALTER TABLE public.care_alerts
  DROP CONSTRAINT IF EXISTS care_alerts_alert_type_check;

ALTER TABLE public.care_alerts
  ADD CONSTRAINT care_alerts_alert_type_check
  CHECK (
    alert_type IN (
      'missed_medicine',
      'missed_checkin',
      'no_app_activity',
      'companion_emergency',
      'health_risk_high'
    )
  ) NOT VALID;





CREATE OR REPLACE FUNCTION public.handle_health_risk_assessment_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN := true;
  v_name TEXT;
  v_flags TEXT;
  v_message TEXT;
BEGIN
  SELECT
    COALESCE(settings.health_risk_alerts_enabled, true),
    NULLIF(BTRIM(profile.full_name), '')
  INTO v_enabled, v_name
  FROM public.profiles AS profile
  LEFT JOIN public.elder_settings AS settings
    ON settings.parent_id = profile.id
  WHERE profile.id = NEW.parent_id;

  IF NEW.risk_level = 'high' OR NEW.urgent THEN
    IF NOT v_enabled THEN
      RETURN NEW;
    END IF;

    v_flags := array_to_string(NEW.warning_flags, ', ');

    v_message :=
      COALESCE(v_name, 'The care recipient')
      || ' received a high health-risk screening result'
      || CASE
          WHEN NEW.risk_score IS NOT NULL THEN ' with score ' || NEW.risk_score::TEXT || '/100'
          ELSE ''
        END
      || CASE
          WHEN NULLIF(v_flags, '') IS NOT NULL THEN '. Main warning signs: ' || v_flags
          ELSE '.'
        END
      || ' Review the result and contact a healthcare professional. Use SOS for severe symptoms.';

    PERFORM public.create_detected_care_alert(
      NEW.parent_id,
      'health_risk_high',
      'high',
      'High health-risk screening result',
      v_message,
      NEW.id::TEXT,
      jsonb_build_object(
        'assessment_id', NEW.id,
        'care_parent_id', NEW.parent_id,
        'risk_level', NEW.risk_level,
        'risk_score', NEW.risk_score,
        'urgent', NEW.urgent,
        'warning_flags', NEW.warning_flags,
        'created_at', NEW.created_at
      )
    );
  ELSE
    UPDATE public.care_alerts
    SET
      status = 'resolved',
      acknowledged_at = COALESCE(acknowledged_at, now()),
      resolved_at = COALESCE(resolved_at, now()),
      resolution_note = COALESCE(
        resolution_note,
        'A later health-risk screening was no longer high risk.'
      ),
      updated_at = now()
    WHERE parent_id = NEW.parent_id
      AND alert_type = 'health_risk_high'
      AND status IN ('active', 'acknowledged');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.handle_health_risk_assessment_alert()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS health_risk_assessment_alert_trigger
ON public.health_risk_assessments;

CREATE TRIGGER health_risk_assessment_alert_trigger
AFTER INSERT ON public.health_risk_assessments
FOR EACH ROW
EXECUTE FUNCTION public.handle_health_risk_assessment_alert();




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
  IF v_type NOT IN (
    'missed_medicine',
    'missed_checkin',
    'no_app_activity',
    'companion_emergency',
    'health_risk_high'
  ) THEN
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
  ELSIF v_type = 'no_app_activity' THEN
    v_title := CASE
      WHEN NEW.parent_id = v_care_parent_id THEN '🚨 No ElderCare app activity'
      ELSE '🚨 No app activity from ' || COALESCE(v_elder_name, 'your family member')
    END;
  ELSIF v_type = 'health_risk_high' THEN
    v_title := CASE
      WHEN NEW.parent_id = v_care_parent_id THEN '❤️ High health-risk result'
      ELSE '❤️ High health-risk result for ' || COALESCE(v_elder_name, 'your family member')
    END;
    v_url := '/health-risk';
  ELSE
    v_title := CASE
      WHEN NEW.parent_id = v_care_parent_id THEN '🚨 Companion safety warning'
      ELSE '🚨 Safety concern for ' || COALESCE(v_elder_name, 'your family member')
    END;
    v_url := '/sos';
  END IF;

  v_tag_suffix := COALESCE(
    NEW.metadata ->> 'care_alert_id',
    NEW.dedup_key,
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
    v_type || '-' || v_tag_suffix || '-' || NEW.parent_id::TEXT,
    COALESCE(NEW.metadata, '{}'::JSONB)
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