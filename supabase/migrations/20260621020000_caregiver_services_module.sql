




ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'assigned'   AFTER 'confirmed';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'in_progress' AFTER 'assigned';


ALTER TABLE public.caregiver_bookings
  ADD COLUMN IF NOT EXISTS booking_date    DATE,
  ADD COLUMN IF NOT EXISTS booking_time    TIME,
  ADD COLUMN IF NOT EXISTS caregiver_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caregiver_name TEXT;


UPDATE public.caregiver_bookings
  SET booking_date = scheduled_at::date
  WHERE booking_date IS NULL;

UPDATE public.caregiver_bookings
  SET booking_time = scheduled_at::time
  WHERE booking_time IS NULL;





DROP POLICY IF EXISTS "Create bookings" ON public.caregiver_bookings;
CREATE POLICY "Create bookings (parent only)" ON public.caregiver_bookings
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid());


DROP POLICY IF EXISTS "Update bookings" ON public.caregiver_bookings;
CREATE POLICY "Update bookings (parent only)" ON public.caregiver_bookings
  FOR UPDATE TO authenticated
  USING  (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());


DROP POLICY IF EXISTS "Delete bookings" ON public.caregiver_bookings;
CREATE POLICY "Delete bookings (parent only)" ON public.caregiver_bookings
  FOR DELETE TO authenticated
  USING (parent_id = auth.uid());


DROP POLICY IF EXISTS "View bookings" ON public.caregiver_bookings;
CREATE POLICY "View bookings (parent+child)" ON public.caregiver_bookings
  FOR SELECT TO authenticated
  USING (public.can_view_parent(parent_id));


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'caregiver_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caregiver_bookings;
  END IF;
END
$$;
