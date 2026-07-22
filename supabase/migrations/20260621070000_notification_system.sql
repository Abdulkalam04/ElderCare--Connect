



ALTER TABLE public.parent_notifications
  ADD COLUMN IF NOT EXISTS notification_type TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;


CREATE INDEX IF NOT EXISTS idx_parent_notifications_recipient_read
  ON public.parent_notifications(parent_id, is_read);


CREATE INDEX IF NOT EXISTS idx_parent_notifications_type
  ON public.parent_notifications(notification_type);


CREATE INDEX IF NOT EXISTS idx_parent_notifications_created_at
  ON public.parent_notifications(parent_id, created_at DESC);







ALTER PUBLICATION supabase_realtime ADD TABLE public.parent_notifications;
