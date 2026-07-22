










ALTER TABLE public.trusted_caregivers
  ADD COLUMN IF NOT EXISTS qualification      TEXT,
  ADD COLUMN IF NOT EXISTS experience_years   INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_area       TEXT,
  ADD COLUMN IF NOT EXISTS available_days     SMALLINT[] NOT NULL
    DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[],
  ADD COLUMN IF NOT EXISTS available_from     TIME,
  ADD COLUMN IF NOT EXISTS available_until    TIME;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trusted_caregivers_experience_valid'
      AND conrelid = 'public.trusted_caregivers'::regclass
  ) THEN
    ALTER TABLE public.trusted_caregivers
      ADD CONSTRAINT trusted_caregivers_experience_valid
      CHECK (experience_years BETWEEN 0 AND 60);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trusted_caregivers_available_days_valid'
      AND conrelid = 'public.trusted_caregivers'::regclass
  ) THEN
    ALTER TABLE public.trusted_caregivers
      ADD CONSTRAINT trusted_caregivers_available_days_valid
      CHECK (
        cardinality(available_days) > 0
        AND available_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trusted_caregivers_availability_window_valid'
      AND conrelid = 'public.trusted_caregivers'::regclass
  ) THEN
    ALTER TABLE public.trusted_caregivers
      ADD CONSTRAINT trusted_caregivers_availability_window_valid
      CHECK (
        (available_from IS NULL AND available_until IS NULL)
        OR (
          available_from  IS NOT NULL
          AND available_until IS NOT NULL
          AND available_from < available_until
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_trusted_caregivers_booking_match
  ON public.trusted_caregivers(parent_id, caregiver_type, available);




ALTER TABLE public.caregiver_bookings
  ADD COLUMN IF NOT EXISTS trusted_caregiver_id UUID
    REFERENCES public.trusted_caregivers(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_rating  SMALLINT,
  ADD COLUMN IF NOT EXISTS review_comment TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'caregiver_bookings_review_rating_valid'
      AND conrelid = 'public.caregiver_bookings'::regclass
  ) THEN
    ALTER TABLE public.caregiver_bookings
      ADD CONSTRAINT caregiver_bookings_review_rating_valid
      CHECK (review_rating IS NULL OR review_rating BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'caregiver_bookings_review_comment_valid'
      AND conrelid = 'public.caregiver_bookings'::regclass
  ) THEN
    ALTER TABLE public.caregiver_bookings
      ADD CONSTRAINT caregiver_bookings_review_comment_valid
      CHECK (
        review_comment IS NULL
        OR char_length(review_comment) <= 500
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'caregiver_bookings_review_pair_valid'
      AND conrelid = 'public.caregiver_bookings'::regclass
  ) THEN
    ALTER TABLE public.caregiver_bookings
      ADD CONSTRAINT caregiver_bookings_review_pair_valid
      CHECK (
        review_comment IS NULL
        OR review_rating IS NOT NULL
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_caregiver_bookings_trusted_caregiver
  ON public.caregiver_bookings(trusted_caregiver_id, scheduled_at DESC)
  WHERE trusted_caregiver_id IS NOT NULL;








CREATE OR REPLACE FUNCTION public.enforce_caregiver_booking_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caregiver          public.trusted_caregivers%ROWTYPE;
  v_booking_day        SMALLINT;
  v_booking_time       TIME;
  v_check_assignment   BOOLEAN := false;
  v_status_changed     BOOLEAN := false;
  v_review_changed     BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_status_changed := NEW.status IS DISTINCT FROM OLD.status;

    v_review_changed :=
      NEW.review_rating  IS DISTINCT FROM OLD.review_rating
      OR NEW.review_comment IS DISTINCT FROM OLD.review_comment;

    IF v_status_changed THEN
      IF NOT (
        (OLD.status = 'pending'     AND NEW.status IN ('confirmed',   'cancelled'))
        OR (OLD.status = 'confirmed'  AND NEW.status IN ('assigned',    'cancelled'))
        OR (OLD.status = 'assigned'   AND NEW.status IN ('in_progress', 'cancelled'))
        OR (OLD.status = 'in_progress' AND NEW.status IN ('completed',   'cancelled'))
      ) THEN
        RAISE EXCEPTION
          'Invalid caregiver booking status change from % to %.',
          OLD.status,
          NEW.status;
      END IF;
    END IF;

    v_check_assignment :=
      NEW.trusted_caregiver_id IS DISTINCT FROM OLD.trusted_caregiver_id
      OR (v_status_changed AND NEW.status = 'assigned');
  ELSE
    v_status_changed   := true;
    v_review_changed   := NEW.review_rating IS NOT NULL OR NEW.review_comment IS NOT NULL;
    v_check_assignment := NEW.trusted_caregiver_id IS NOT NULL OR NEW.status = 'assigned';
  END IF;

  -- A new assignment must use a caregiver saved in the parent's directory.
  IF v_check_assignment THEN
    IF NEW.trusted_caregiver_id IS NULL THEN
      RAISE EXCEPTION 'Select a trusted caregiver before assigning this booking.';
    END IF;

    SELECT caregiver.*
    INTO   v_caregiver
    FROM   public.trusted_caregivers AS caregiver
    WHERE  caregiver.id        = NEW.trusted_caregiver_id
      AND  caregiver.parent_id = NEW.parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected caregiver does not belong to this care recipient.';
    END IF;

    IF NOT v_caregiver.available THEN
      RAISE EXCEPTION '% is currently marked unavailable.', v_caregiver.name;
    END IF;

    IF v_caregiver.caregiver_type <> 'other'
      AND v_caregiver.caregiver_type <> NEW.caregiver_type::TEXT THEN
      RAISE EXCEPTION
        '% is registered as %, not %.',
        v_caregiver.name,
        v_caregiver.caregiver_type,
        NEW.caregiver_type;
    END IF;

    v_booking_day := EXTRACT(
      DOW FROM COALESCE(
        NEW.booking_date,
        (NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata')::DATE
      )
    )::SMALLINT;

    v_booking_time := COALESCE(
      NEW.booking_time,
      (NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata')::TIME
    );

    IF NOT (v_booking_day = ANY(v_caregiver.available_days)) THEN
      RAISE EXCEPTION '% is not available on the selected day.', v_caregiver.name;
    END IF;

    IF v_caregiver.available_from IS NOT NULL
      AND NOT (
        v_booking_time >= v_caregiver.available_from
        AND v_booking_time < v_caregiver.available_until
      ) THEN
      RAISE EXCEPTION
        '% is available only between % and %.',
        v_caregiver.name,
        to_char(v_caregiver.available_from,  'HH12:MI AM'),
        to_char(v_caregiver.available_until, 'HH12:MI AM');
    END IF;

    -- Keep the display name synchronized with the selected directory record.
    NEW.caregiver_name := v_caregiver.name;
  END IF;

  IF NEW.status = 'assigned' AND NEW.trusted_caregiver_id IS NULL THEN
    RAISE EXCEPTION 'A caregiver must be selected before the booking can be assigned.';
  END IF;

  IF NEW.status IN ('in_progress', 'completed')
    AND NEW.trusted_caregiver_id IS NULL
    AND NULLIF(BTRIM(COALESCE(NEW.caregiver_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'The booking has no assigned caregiver.';
  END IF;

  -- Lifecycle timestamps are controlled by the workflow, not by the client.
  IF TG_OP = 'UPDATE' THEN
    IF v_status_changed THEN
      CASE NEW.status
        WHEN 'confirmed'   THEN NEW.confirmed_at  := now();
        WHEN 'assigned'    THEN NEW.assigned_at   := now();
        WHEN 'in_progress' THEN NEW.started_at    := now();
        WHEN 'completed'   THEN NEW.completed_at  := now();
        WHEN 'cancelled'   THEN NEW.cancelled_at  := now();
        ELSE NULL;
      END CASE;
    ELSE
      NEW.confirmed_at  := OLD.confirmed_at;
      NEW.assigned_at   := OLD.assigned_at;
      NEW.started_at    := OLD.started_at;
      NEW.completed_at  := OLD.completed_at;
      NEW.cancelled_at  := OLD.cancelled_at;
    END IF;
  ELSE
    CASE NEW.status
      WHEN 'confirmed'   THEN NEW.confirmed_at  := now();
      WHEN 'assigned'    THEN NEW.assigned_at   := now();
      WHEN 'in_progress' THEN NEW.started_at    := now();
      WHEN 'completed'   THEN NEW.completed_at  := now();
      WHEN 'cancelled'   THEN NEW.cancelled_at  := now();
      ELSE NULL;
    END CASE;
  END IF;

  -- Reviews can be submitted only after completion.
  IF v_review_changed THEN
    IF NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'A caregiver service can be reviewed only after it is completed.';
    END IF;

    IF NEW.review_rating IS NULL THEN
      NEW.review_comment := NULL;
      NEW.reviewed_at    := NULL;
    ELSE
      NEW.review_comment := NULLIF(BTRIM(COALESCE(NEW.review_comment, '')), '');
      NEW.reviewed_at    := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.reviewed_at := OLD.reviewed_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION public.enforce_caregiver_booking_workflow()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_caregiver_booking_workflow_trigger
  ON public.caregiver_bookings;

CREATE TRIGGER enforce_caregiver_booking_workflow_trigger
BEFORE INSERT OR UPDATE
ON public.caregiver_bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_caregiver_booking_workflow();




CREATE OR REPLACE FUNCTION public.notify_caregiver_booking_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service TEXT;
  v_message TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_service := initcap(replace(NEW.caregiver_type::TEXT, '_', ' '));

  v_message := CASE NEW.status
    WHEN 'pending' THEN
      v_service || ' service requested for '
      || to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
      || '.'

    WHEN 'confirmed' THEN
      v_service || ' booking confirmed for '
      || to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
      || '.'

    WHEN 'assigned' THEN
      COALESCE(NEW.caregiver_name, 'A caregiver')
      || ' was assigned to the ' || lower(v_service) || ' booking.'

    WHEN 'in_progress' THEN
      v_service || ' service has started with '
      || COALESCE(NEW.caregiver_name, 'the assigned caregiver') || '.'

    WHEN 'completed' THEN
      v_service || ' service was marked completed.'

    WHEN 'cancelled' THEN
      v_service || ' booking was cancelled.'

    ELSE
      v_service || ' booking was updated.'
  END;

  PERFORM public.create_care_alert_notifications(
    NEW.parent_id,
    'caregiver_booking',
    v_message,
    NEW.id::TEXT || ':' || NEW.status::TEXT,
    jsonb_build_object(
      'booking_id',          NEW.id,
      'booking_status',      NEW.status,
      'caregiver_type',      NEW.caregiver_type,
      'caregiver_name',      NEW.caregiver_name,
      'trusted_caregiver_id', NEW.trusted_caregiver_id,
      'url',                 '/caregivers'
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION public.notify_caregiver_booking_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_caregiver_booking_insert_trigger
  ON public.caregiver_bookings;

CREATE TRIGGER notify_caregiver_booking_insert_trigger
AFTER INSERT
ON public.caregiver_bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_caregiver_booking_change();

DROP TRIGGER IF EXISTS notify_caregiver_booking_status_trigger
  ON public.caregiver_bookings;

CREATE TRIGGER notify_caregiver_booking_status_trigger
AFTER UPDATE OF status
ON public.caregiver_bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_caregiver_booking_change();

COMMENT ON COLUMN public.caregiver_bookings.trusted_caregiver_id IS
  'Saved caregiver selected from the care recipient trusted-caregiver directory.';

COMMENT ON COLUMN public.caregiver_bookings.review_rating IS
  'Parent rating from 1 to 5 after a completed internal caregiver service.';
