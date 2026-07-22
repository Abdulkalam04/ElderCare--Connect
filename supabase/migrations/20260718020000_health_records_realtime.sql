


ALTER TABLE public.health_records REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'health_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.health_records;
  END IF;
END
$$;
