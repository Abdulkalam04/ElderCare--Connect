
CREATE TABLE IF NOT EXISTS public.parent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, 
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_notifications TO authenticated;
GRANT ALL ON public.parent_notifications TO service_role;


ALTER TABLE public.parent_notifications ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Users can view notifications for self or linked" 
  ON public.parent_notifications FOR SELECT TO authenticated
  USING (parent_id = auth.uid() OR sender_id = auth.uid() OR public.can_view_parent(parent_id));

CREATE POLICY "Users can insert notifications" 
  ON public.parent_notifications FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update notifications" 
  ON public.parent_notifications FOR UPDATE TO authenticated
  USING (parent_id = auth.uid()) WITH CHECK (parent_id = auth.uid());
