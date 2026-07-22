
ALTER TABLE public.transport_bookings REPLICA IDENTITY FULL;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'transport_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_bookings;
  END IF;
END $$;


DROP POLICY IF EXISTS "Read assigned transport drivers" ON public.profiles;
CREATE POLICY "Read assigned transport drivers" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT driver_id FROM public.transport_bookings
      WHERE public.can_view_parent(parent_id) AND driver_id IS NOT NULL
    )
  );
