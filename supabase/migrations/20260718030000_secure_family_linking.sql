






CREATE OR REPLACE FUNCTION public.link_parent_by_invite_code(
  _code TEXT,
  _phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id UUID := auth.uid();
  v_parent_id UUID;
  v_code TEXT := UPPER(TRIM(COALESCE(_code, '')));
  v_phone TEXT := NULLIF(TRIM(COALESCE(_phone, '')), '');
BEGIN
  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF v_code !~ '^[A-Z0-9]{8}$' THEN
    RAISE EXCEPTION 'Invalid Family Link Code.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_child_id
      AND role = 'child'
  ) THEN
    RAISE EXCEPTION 'Only family member accounts can use a Family Link Code.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_parent_id
  FROM public.profiles
  WHERE role = 'parent'
    AND invite_code = v_code
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Family Link Code.' USING ERRCODE = '22023';
  END IF;

  IF v_parent_id = v_child_id THEN
    RAISE EXCEPTION 'You cannot link your own account.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parent_child_links
    WHERE parent_id = v_parent_id
      AND child_id = v_child_id
  ) THEN
    RAISE EXCEPTION 'You are already linked to this family member.'
      USING ERRCODE = '23505';
  END IF;

  IF v_phone IS NOT NULL THEN
    IF v_phone !~ '^\+?[0-9[:space:]()\-]{7,30}$'
       OR LENGTH(REGEXP_REPLACE(v_phone, '[^0-9]', '', 'g')) < 7 THEN
      RAISE EXCEPTION 'Please enter a valid phone number.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET phone = v_phone
    WHERE id = v_child_id;
  END IF;

  INSERT INTO public.parent_child_links (parent_id, child_id)
  VALUES (v_parent_id, v_child_id);

  RETURN v_parent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_family_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id
      AND role = 'parent'
  ) THEN
    RAISE EXCEPTION 'Only care recipient accounts can generate a Family Link Code.'
      USING ERRCODE = '42501';
  END IF;

  LOOP
    v_code := UPPER(SUBSTR(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE invite_code = v_code
    );
  END LOOP;

  UPDATE public.profiles
  SET invite_code = v_code
  WHERE id = v_user_id;

  RETURN v_code;
END;
$$;




DROP POLICY IF EXISTS "Child can create link to self" ON public.parent_child_links;
REVOKE INSERT, UPDATE ON public.parent_child_links FROM authenticated;
GRANT SELECT, DELETE ON public.parent_child_links TO authenticated;

DROP FUNCTION IF EXISTS public.lookup_parent_by_invite_code(TEXT);

REVOKE EXECUTE ON FUNCTION public.link_parent_by_invite_code(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.regenerate_family_invite_code() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.link_parent_by_invite_code(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_family_invite_code() TO authenticated;

ALTER TABLE public.parent_child_links REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'parent_child_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parent_child_links;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END
$$;
