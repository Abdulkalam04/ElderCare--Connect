




DROP POLICY IF EXISTS "Delete own resolved sos history" ON public.sos_alerts;
CREATE POLICY "Delete own resolved sos history"
  ON public.sos_alerts
  FOR DELETE
  TO authenticated
  USING (
    parent_id = auth.uid()
    AND status = 'resolved'
  );

ALTER TABLE public.sos_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sos_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_sos_alerts_parent_status_created
  ON public.sos_alerts(parent_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sos_alerts_active_parent
  ON public.sos_alerts(parent_id, created_at DESC)
  WHERE status IN ('active', 'acknowledged');
