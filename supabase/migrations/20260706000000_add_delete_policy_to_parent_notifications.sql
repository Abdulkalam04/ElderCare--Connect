-- Migration: Add delete policy to parent_notifications table so that parents/authenticated users can delete their own notifications

DROP POLICY IF EXISTS "Users can delete notifications" ON public.parent_notifications;

CREATE POLICY "Users can delete notifications"
  ON public.parent_notifications FOR DELETE TO authenticated
  USING (parent_id = auth.uid() OR public.can_view_parent(parent_id));
