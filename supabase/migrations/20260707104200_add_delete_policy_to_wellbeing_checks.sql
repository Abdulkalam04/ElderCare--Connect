

DROP POLICY IF EXISTS "Users can delete wellbeing checks" ON public.wellbeing_checks;

CREATE POLICY "Users can delete wellbeing checks"
  ON public.wellbeing_checks FOR DELETE TO authenticated
  USING (public.can_view_parent(parent_id));
