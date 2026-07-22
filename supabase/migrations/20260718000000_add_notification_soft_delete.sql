-- Allow users to dismiss notifications without breaking the notification
-- engine's deduplication checks. Hidden rows remain in the database so an
-- auto-generated notification is not immediately recreated after deletion.

ALTER TABLE public.parent_notifications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_parent_notifications_visible
  ON public.parent_notifications(parent_id, created_at DESC)
  WHERE deleted_at IS NULL;
