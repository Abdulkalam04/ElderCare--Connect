







ALTER TABLE public.transport_bookings
  ADD COLUMN IF NOT EXISTS next_status_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider         TEXT,
  ADD COLUMN IF NOT EXISTS driver_name      TEXT,
  ADD COLUMN IF NOT EXISTS driver_vehicle   TEXT;

COMMENT ON COLUMN public.transport_bookings.next_status_at IS
  'When the booking should auto-advance to its next status. NULL means no further auto-advance (either terminal, cancelled, or awaiting manual confirmation).';
COMMENT ON COLUMN public.transport_bookings.provider IS
  'Simulated dispatch provider chosen for this ride: Uber or Ola.';
COMMENT ON COLUMN public.transport_bookings.driver_name IS
  'Simulated driver name assigned for this ride (display only, not a real user).';
COMMENT ON COLUMN public.transport_bookings.driver_vehicle IS
  'Simulated vehicle description for the assigned driver (display only).';