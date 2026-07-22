











CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;


CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.runtime_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.runtime_settings FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE private.runtime_settings TO   postgres, service_role;





CREATE TABLE IF NOT EXISTS public.care_push_queue (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  notification_id   UUID        NOT NULL
    REFERENCES public.parent_notifications(id)
    ON DELETE CASCADE,

  recipient_id      UUID        NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  care_parent_id    UUID        NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  notification_type TEXT        NOT NULL,
  title             TEXT        NOT NULL,
  body              TEXT        NOT NULL,

  url               TEXT        NOT NULL DEFAULT '/notifications',
  tag               TEXT        NOT NULL,

  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,

  status            TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'processing',
      'delivered',
      'failed',
      'skipped'
    )),

  attempts          INTEGER     NOT NULL DEFAULT 0
    CHECK (attempts >= 0),

  available_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at         TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  last_error        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT care_push_queue_notification_unique
    UNIQUE (notification_id)
);

CREATE INDEX IF NOT EXISTS care_push_queue_pending_idx
  ON public.care_push_queue (status, available_at, created_at);

CREATE INDEX IF NOT EXISTS care_push_queue_recipient_idx
  ON public.care_push_queue (recipient_id, created_at DESC);

ALTER TABLE public.care_push_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.care_push_queue FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.care_push_queue TO   service_role;





CREATE TABLE IF NOT EXISTS public.care_push_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id        UUID        NOT NULL
    REFERENCES public.care_push_queue(id)
    ON DELETE CASCADE,

  subscription_id UUID        NOT NULL
    REFERENCES public.push_subscriptions(id)
    ON DELETE CASCADE,

  recipient_id    UUID        NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  status          TEXT        NOT NULL
    CHECK (status IN ('sent', 'failed', 'stale')),

  attempts        INTEGER     NOT NULL DEFAULT 1
    CHECK (attempts >= 1),

  last_error      TEXT,
  sent_at         TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT care_push_delivery_unique
    UNIQUE (event_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS care_push_deliveries_event_idx
  ON public.care_push_deliveries (event_id, status);

ALTER TABLE public.care_push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.care_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.care_push_deliveries TO   service_role;






CREATE OR REPLACE FUNCTION public.queue_missed_medicine_web_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_care_parent_id UUID;
  v_elder_name     TEXT;
  v_medicine_id    TEXT;
  v_title          TEXT;
BEGIN
  IF COALESCE(NEW.notification_type, NEW.type) <> 'missed_medicine' THEN
    RETURN NEW;
  END IF;

  v_care_parent_id := COALESCE(
    NULLIF(NEW.metadata ->> 'care_parent_id', '')::UUID,
    NEW.sender_id
  );

  v_medicine_id := COALESCE(
    NULLIF(NEW.metadata ->> 'medicine_id', ''),
    NEW.id::TEXT
  );

  SELECT NULLIF(BTRIM(full_name), '')
  INTO   v_elder_name
  FROM   public.profiles
  WHERE  id = v_care_parent_id;

  IF NEW.parent_id = v_care_parent_id THEN
    v_title := '💊 Medicine dose missed';
  ELSE
    v_title :=
      '💊 '
      || COALESCE(v_elder_name, 'Your family member')
      || ' missed medicine';
  END IF;

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
    'missed_medicine',
    v_title,
    NEW.message,
    '/medicines',
    'missed-medicine-' || v_medicine_id || '-' || NEW.parent_id::TEXT,
    COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object(
           'notification_id', NEW.id,
           'recipient_id',    NEW.parent_id,
           'care_parent_id',  v_care_parent_id
         )
  )
  ON CONFLICT (notification_id)
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL     ON FUNCTION public.queue_missed_medicine_web_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_missed_medicine_web_push_trigger
  ON public.parent_notifications;

CREATE TRIGGER queue_missed_medicine_web_push_trigger
AFTER INSERT ON public.parent_notifications
FOR EACH ROW
EXECUTE FUNCTION public.queue_missed_medicine_web_push();






CREATE OR REPLACE FUNCTION public.claim_care_push_events(
  _limit INTEGER DEFAULT 25
)
RETURNS SETOF public.care_push_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT queue.id
    FROM   public.care_push_queue AS queue
    WHERE  (
             queue.status = 'pending'
             OR (
               queue.status  = 'processing'
               AND queue.locked_at < now() - interval '10 minutes'
             )
           )
      AND  queue.available_at <= now()
      AND  queue.attempts < 3
    ORDER BY queue.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 50)
  )
  UPDATE public.care_push_queue AS queue
  SET
    status     = 'processing',
    attempts   = queue.attempts + 1,
    locked_at  = now(),
    updated_at = now()
  FROM candidates
  WHERE queue.id = candidates.id
  RETURNING queue.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_care_push_events(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_care_push_events(INTEGER) TO service_role;




CREATE OR REPLACE FUNCTION public.finish_care_push_event(
  _event_id    UUID,
  _status      TEXT,
  _last_error  TEXT        DEFAULT NULL,
  _available_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('pending', 'delivered', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Invalid care push status: %', _status;
  END IF;

  UPDATE public.care_push_queue
  SET
    status       = _status,
    last_error   = NULLIF(_last_error, ''),
    available_at = CASE
                     WHEN _status = 'pending'
                       THEN COALESCE(_available_at, now() + interval '5 minutes')
                     ELSE available_at
                   END,
    locked_at    = NULL,
    processed_at = CASE
                     WHEN _status IN ('delivered', 'failed', 'skipped')
                       THEN now()
                     ELSE NULL
                   END,
    updated_at   = now()
  WHERE id = _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_care_push_event(UUID, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finish_care_push_event(UUID, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;





CREATE OR REPLACE FUNCTION public.invoke_care_push_delivery()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_function_url TEXT;
  v_cron_secret  TEXT;
  v_request_id   BIGINT;
BEGIN
  SELECT value INTO v_function_url
  FROM   private.runtime_settings
  WHERE  key = 'care_push_function_url';

  SELECT value INTO v_cron_secret
  FROM   private.runtime_settings
  WHERE  key = 'care_push_cron_secret';

  IF NULLIF(BTRIM(v_function_url), '') IS NULL
  OR NULLIF(BTRIM(v_cron_secret),  '') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url                  := v_function_url,
    headers              := jsonb_build_object(
                              'Content-Type',        'application/json',
                              'x-care-push-secret',  v_cron_secret
                            ),
    body                 := jsonb_build_object('batchSize', 25),
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

REVOKE ALL ON FUNCTION public.invoke_care_push_delivery() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.invoke_care_push_delivery() TO postgres, service_role;






DO $$
BEGIN
  PERFORM cron.unschedule('deliver-care-web-push');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'deliver-care-web-push',
  '*/5 * * * *',
  $$SELECT public.invoke_care_push_delivery();$$
);
