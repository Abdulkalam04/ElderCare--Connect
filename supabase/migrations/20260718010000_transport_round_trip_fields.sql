-- Add proper return scheduling for round-trip medical transport bookings.

ALTER TABLE public.transport_bookings
  ADD COLUMN IF NOT EXISTS return_date DATE,
  ADD COLUMN IF NOT EXISTS return_time TIME;

COMMENT ON COLUMN public.transport_bookings.return_date IS
  'Return journey date for round-trip transport bookings.';

COMMENT ON COLUMN public.transport_bookings.return_time IS
  'Return journey time for round-trip transport bookings.';

CREATE INDEX IF NOT EXISTS idx_transport_bookings_parent_schedule
  ON public.transport_bookings(parent_id, scheduled_at ASC);
