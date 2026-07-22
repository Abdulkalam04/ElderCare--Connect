ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_source TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS intent TEXT;

UPDATE public.ai_chat_messages
SET created_by = parent_id
WHERE created_by IS NULL;

UPDATE public.ai_chat_messages
SET response_source = CASE
  WHEN role = 'user' THEN 'user'
  WHEN is_urgent THEN 'safety'
  ELSE 'local'
END
WHERE response_source IS NULL
   OR BTRIM(response_source) = '';

ALTER TABLE public.ai_chat_messages
  DROP CONSTRAINT IF EXISTS ai_chat_messages_response_source_check;

ALTER TABLE public.ai_chat_messages
  ADD CONSTRAINT ai_chat_messages_response_source_check
  CHECK (response_source IN ('user', 'local', 'gemini', 'local_fallback', 'safety')) NOT VALID;

ALTER TABLE public.ai_chat_messages
  DROP CONSTRAINT IF EXISTS ai_chat_messages_intent_length;

ALTER TABLE public.ai_chat_messages
  ADD CONSTRAINT ai_chat_messages_intent_length
  CHECK (intent IS NULL OR length(intent) <= 80) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_ai_chat_parent_intent_created
  ON public.ai_chat_messages(parent_id, intent, created_at DESC);

-- -----------------------------------------------------------------------------
-- Explicit privacy and voice preferences
-- -----------------------------------------------------------------------------
ALTER TABLE public.elder_settings
  ADD COLUMN IF NOT EXISTS companion_emergency_escalation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS companion_auto_read_responses BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- Allow durable emergency records created by Companion safety detection.
-- -----------------------------------------------------------------------------
ALTER TABLE public.care_alerts
  DROP CONSTRAINT IF EXISTS care_alerts_alert_type_check;

ALTER TABLE public.care_alerts
  ADD CONSTRAINT care_alerts_alert_type_check
  CHECK (
    alert_type IN (
      'missed_medicine',
      'missed_checkin',
      'no_app_activity',
      'companion_emergency'
    )
  ) NOT VALID;

-- -----------------------------------------------------------------------------
-- Create one generic family safety alert without exposing private chat content.
-- Duplicate alerts of the same category are limited to one per clock hour.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raise_companion_safety_alert(
  _category TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID := auth.uid();
  v_category TEXT := lower(BTRIM(COALESCE(_category, 'emergency')));
  v_enabled BOOLEAN := false;
  v_source_key TEXT;
  v_message TEXT;
BEGIN
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_parent_id
      AND role = 'parent'
  ) THEN
    RAISE EXCEPTION 'Only the care-recipient account can raise a Companion safety alert.'
      USING ERRCODE = '42501';
  END IF;

  IF v_category NOT IN (
    'chest_pain',
    'breathing_difficulty',
    'heart_or_stroke',
    'loss_of_consciousness',
    'severe_bleeding',
    'fall_cannot_get_up',
    'possible_overdose',
    'self_harm_risk',
    'emergency'
  ) THEN
    v_category := 'emergency';
  END IF;

  SELECT companion_emergency_escalation_enabled
  INTO v_enabled
  FROM public.elder_settings
  WHERE parent_id = v_parent_id;

  IF COALESCE(v_enabled, false) = false THEN
    RETURN 0;
  END IF;

  v_source_key :=
    'companion:'
    || v_category
    || ':'
    || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24');

  v_message := CASE v_category
    WHEN 'self_harm_risk' THEN
      'The private ElderCare Companion detected language that may indicate immediate personal safety risk. Please contact the care recipient now and review the SOS plan.'
    WHEN 'possible_overdose' THEN
      'The private ElderCare Companion detected a possible medicine overdose concern. Please contact the care recipient now and seek emergency assistance when required.'
    WHEN 'fall_cannot_get_up' THEN
      'The private ElderCare Companion detected a possible fall where the care recipient may be unable to get up. Please contact them now and review the SOS plan.'
    ELSE
      'The private ElderCare Companion detected language that may describe an urgent health emergency. Please contact the care recipient now and review the SOS plan.'
  END;

  RETURN public.create_detected_care_alert(
    v_parent_id,
    'companion_emergency',
    'high',
    'Companion safety concern',
    v_message,
    v_source_key,
    jsonb_build_object(
      'category', v_category,
      'source', 'ai_companion',
      'privacy', 'No private chat text was shared.',
      'recommended_action', 'Contact the care recipient immediately and use SOS or call 112 when emergency help is needed.'
    )
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.raise_companion_safety_alert(TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.raise_companion_safety_alert(TEXT)
TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Queue web push for Companion safety alerts in addition to detector alerts.
-- -----------------------------------------------------------------------------
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
    'companion_emergency'
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
