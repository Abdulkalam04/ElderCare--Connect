ALTER TABLE public.transport_bookings
  ADD COLUMN IF NOT EXISTS driver_phone TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS en_route_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.transport_bookings.driver_phone IS
  'Phone number entered during manual driver coordination. No commercial provider API is contacted.';
COMMENT ON COLUMN public.transport_bookings.cancellation_reason IS
  'Reason supplied when a parent cancels a transport request.';
COMMENT ON COLUMN public.transport_bookings.confirmed_at IS
  'Time the family/admin confirmed the request.';
COMMENT ON COLUMN public.transport_bookings.assigned_at IS
  'Time manually entered driver and vehicle details were assigned.';
COMMENT ON COLUMN public.transport_bookings.en_route_at IS
  'Time the manually coordinated driver was marked en route.';
COMMENT ON COLUMN public.transport_bookings.arrived_at IS
  'Time the driver was marked arrived.';
COMMENT ON COLUMN public.transport_bookings.completed_at IS
  'Time the transport request was marked completed.';
COMMENT ON COLUMN public.transport_bookings.cancelled_at IS
  'Time the transport request was cancelled.';


UPDATE public.transport_bookings
SET
  driver_phone = NULLIF(BTRIM(driver_phone), ''),
  cancellation_reason = NULLIF(BTRIM(cancellation_reason), '');

ALTER TABLE public.transport_bookings
  DROP CONSTRAINT IF EXISTS transport_driver_phone_length,
  ADD CONSTRAINT transport_driver_phone_length
    CHECK (driver_phone IS NULL OR char_length(driver_phone) BETWEEN 7 AND 30),

  DROP CONSTRAINT IF EXISTS transport_cancellation_reason_length,
  ADD CONSTRAINT transport_cancellation_reason_length
    CHECK (
      cancellation_reason IS NULL
      OR char_length(cancellation_reason) BETWEEN 3 AND 300
    );

CREATE INDEX IF NOT EXISTS idx_transport_bookings_parent_status_schedule
  ON public.transport_bookings(parent_id, status, scheduled_at ASC);


CREATE OR REPLACE FUNCTION public.validate_transport_booking_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  new_status := NEW.status::TEXT;

  NEW.pickup_address := BTRIM(NEW.pickup_address);
  NEW.destination := BTRIM(NEW.destination);
  NEW.driver_name := NULLIF(BTRIM(NEW.driver_name), '');
  NEW.driver_vehicle := NULLIF(BTRIM(NEW.driver_vehicle), '');
  NEW.driver_phone := NULLIF(BTRIM(NEW.driver_phone), '');
  NEW.cancellation_reason := NULLIF(BTRIM(NEW.cancellation_reason), '');
  NEW.provider := COALESCE(NULLIF(BTRIM(NEW.provider), ''), 'Auto Match');

  IF NEW.pickup_address = '' OR NEW.destination = '' THEN
    RAISE EXCEPTION 'Pickup address and destination are required.';
  END IF;

  IF lower(NEW.pickup_address) = lower(NEW.destination) THEN
    RAISE EXCEPTION 'Pickup address and destination cannot be the same.';
  END IF;

  IF NEW.scheduled_at IS NULL THEN
    RAISE EXCEPTION 'A transport date and time are required.';
  END IF;

  IF NEW.trip_type::TEXT = 'round_trip' THEN
    IF NEW.return_date IS NULL OR NEW.return_time IS NULL THEN
      RAISE EXCEPTION 'Return date and time are required for a round trip.';
    END IF;

    IF (NEW.return_date + NEW.return_time) <=
       (NEW.transport_date + NEW.transport_time) THEN
      RAISE EXCEPTION 'Return journey must be later than the outbound journey.';
    END IF;
  ELSE
    NEW.return_date := NULL;
    NEW.return_time := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new_status <> 'pending' THEN
      RAISE EXCEPTION 'New transport requests must start as pending.';
    END IF;

    NEW.confirmed_at := NULL;
    NEW.assigned_at := NULL;
    NEW.en_route_at := NULL;
    NEW.arrived_at := NULL;
    NEW.completed_at := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancellation_reason := NULL;

    RETURN NEW;
  END IF;

  old_status := OLD.status::TEXT;

  -- Editing ordinary ride details without changing the status is allowed.
  IF new_status = old_status THEN
    -- Terminal records cannot be silently edited after completion/cancellation.
    IF old_status IN ('completed', 'cancelled') AND ROW(
      NEW.pickup_address,
      NEW.destination,
      NEW.scheduled_at,
      NEW.trip_type,
      NEW.return_date,
      NEW.return_time,
      NEW.provider,
      NEW.driver_name,
      NEW.driver_vehicle,
      NEW.driver_phone
    ) IS DISTINCT FROM ROW(
      OLD.pickup_address,
      OLD.destination,
      OLD.scheduled_at,
      OLD.trip_type,
      OLD.return_date,
      OLD.return_time,
      OLD.provider,
      OLD.driver_name,
      OLD.driver_vehicle,
      OLD.driver_phone
    ) THEN
      RAISE EXCEPTION 'Completed or cancelled transport records cannot be edited.';
    END IF;

    RETURN NEW;
  END IF;

  IF new_status = 'cancelled' THEN
    IF old_status NOT IN ('pending', 'confirmed', 'driver_assigned', 'en_route') THEN
      RAISE EXCEPTION 'This transport request can no longer be cancelled.';
    END IF;

    IF NEW.cancellation_reason IS NULL THEN
      RAISE EXCEPTION 'A cancellation reason is required.';
    END IF;

    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    NEW.next_status_at := NULL;
    RETURN NEW;
  END IF;

  IF old_status = 'pending' AND new_status = 'confirmed' THEN
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());

  ELSIF old_status = 'confirmed' AND new_status = 'driver_assigned' THEN
    IF NEW.driver_name IS NULL OR NEW.driver_vehicle IS NULL OR NEW.driver_phone IS NULL THEN
      RAISE EXCEPTION 'Driver name, phone, and vehicle details are required before assignment.';
    END IF;
    NEW.assigned_at := COALESCE(NEW.assigned_at, now());

  ELSIF old_status = 'driver_assigned' AND new_status = 'en_route' THEN
    NEW.en_route_at := COALESCE(NEW.en_route_at, now());

  ELSIF old_status = 'en_route' AND new_status = 'arrived' THEN
    NEW.arrived_at := COALESCE(NEW.arrived_at, now());

  ELSIF old_status = 'arrived' AND new_status = 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());

  ELSE
    RAISE EXCEPTION 'Invalid transport status change from % to %.', old_status, new_status;
  END IF;

  NEW.next_status_at := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.validate_transport_booking_workflow()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_transport_booking_workflow_trigger
ON public.transport_bookings;

CREATE TRIGGER validate_transport_booking_workflow_trigger
BEFORE INSERT OR UPDATE
ON public.transport_bookings
FOR EACH ROW
EXECUTE FUNCTION public.validate_transport_booking_workflow();


DROP POLICY IF EXISTS "Create transport" ON public.transport_bookings;
DROP POLICY IF EXISTS "Create transport (parent only)" ON public.transport_bookings;
CREATE POLICY "Create transport (parent only)"
ON public.transport_bookings
FOR INSERT TO authenticated
WITH CHECK (
  parent_id = auth.uid()
  AND requested_by = auth.uid()
);

DROP POLICY IF EXISTS "Update transport" ON public.transport_bookings;
DROP POLICY IF EXISTS "Update transport (parent only)" ON public.transport_bookings;
CREATE POLICY "Update transport (parent only)"
ON public.transport_bookings
FOR UPDATE TO authenticated
USING (parent_id = auth.uid())
WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS "Delete transport" ON public.transport_bookings;
DROP POLICY IF EXISTS "Delete transport (parent only)" ON public.transport_bookings;
CREATE POLICY "Delete transport (parent only)"
ON public.transport_bookings
FOR DELETE TO authenticated
USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "View transport" ON public.transport_bookings;
DROP POLICY IF EXISTS "View transport (parent+child)" ON public.transport_bookings;
CREATE POLICY "View transport (parent+child)"
ON public.transport_bookings
FOR SELECT TO authenticated
USING (public.can_view_parent(parent_id));


CREATE OR REPLACE FUNCTION public.notify_transport_booking_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient UUID;
  elder_name TEXT;
  status_label TEXT;
  notification_message TEXT;
  dedup_suffix TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(BTRIM(full_name), '')
  INTO elder_name
  FROM public.profiles
  WHERE id = NEW.parent_id;

  elder_name := COALESCE(elder_name, 'Family member');

  IF TG_OP = 'INSERT' THEN
    status_label := 'requested';
    notification_message := format(
      'Transport requested for %s on %s from %s to %s.',
      elder_name,
      to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM'),
      NEW.pickup_address,
      NEW.destination
    );
    dedup_suffix := 'created';
  ELSE
    status_label := replace(NEW.status::TEXT, '_', ' ');
    dedup_suffix := NEW.status::TEXT;

    CASE NEW.status::TEXT
      WHEN 'confirmed' THEN
        notification_message := format(
          'Transport for %s has been confirmed.', elder_name
        );
      WHEN 'driver_assigned' THEN
        notification_message := format(
          '%s (%s) has been assigned for %s transport.',
          COALESCE(NEW.driver_name, 'A driver'),
          COALESCE(NEW.driver_vehicle, 'vehicle details pending'),
          elder_name
        );
      WHEN 'en_route' THEN
        notification_message := format(
          '%s is now en route for %s transport.',
          COALESCE(NEW.driver_name, 'The driver'),
          elder_name
        );
      WHEN 'arrived' THEN
        notification_message := format(
          '%s has arrived for %s transport.',
          COALESCE(NEW.driver_name, 'The driver'),
          elder_name
        );
      WHEN 'completed' THEN
        notification_message := format(
          'Transport for %s has been completed.', elder_name
        );
      WHEN 'cancelled' THEN
        notification_message := format(
          'Transport for %s was cancelled. Reason: %s',
          elder_name,
          COALESCE(NEW.cancellation_reason, 'Not provided')
        );
      ELSE
        notification_message := format(
          'Transport for %s changed to %s.', elder_name, status_label
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
      'transport_alert',
      'transport_alert',
      notification_message,
      jsonb_build_object(
        'booking_id', NEW.id,
        'care_parent_id', NEW.parent_id,
        'status', CASE WHEN TG_OP = 'INSERT' THEN 'pending' ELSE NEW.status::TEXT END,
        'provider', NEW.provider,
        'driver_name', NEW.driver_name,
        'driver_phone', NEW.driver_phone,
        'driver_vehicle', NEW.driver_vehicle,
        'pickup_address', NEW.pickup_address,
        'destination', NEW.destination,
        'scheduled_at', NEW.scheduled_at
      ),
      'transport:' || NEW.id::TEXT || ':' || dedup_suffix || ':' || recipient::TEXT
    )
    ON CONFLICT (parent_id, dedup_key)
    WHERE dedup_key IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.notify_transport_booking_change()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_transport_booking_change_trigger
ON public.transport_bookings;

CREATE TRIGGER notify_transport_booking_change_trigger
AFTER INSERT OR UPDATE OF status
ON public.transport_bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_transport_booking_change();

ALTER TABLE public.transport_bookings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'transport_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.transport_bookings;
  END IF;
END;
$$;