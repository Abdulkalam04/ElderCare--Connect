



ALTER TABLE public.parent_notifications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_parent_notifications_visible
  ON public.parent_notifications(parent_id, created_at DESC)
  WHERE deleted_at IS NULL;
