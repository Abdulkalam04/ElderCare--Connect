-- AI Risk Check and AI Companion safety, privacy, validation, and realtime improvements.

-- ---------------------------------------------------------------------------
-- AI Companion: keep conversations private to the care-recipient account.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.ai_chat_messages
SET created_by = parent_id
WHERE created_by IS NULL;

ALTER TABLE public.ai_chat_messages
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.ai_chat_messages
  DROP CONSTRAINT IF EXISTS ai_chat_messages_role_check;
ALTER TABLE public.ai_chat_messages
  ADD CONSTRAINT ai_chat_messages_role_check
  CHECK (role IN ('user', 'assistant')) NOT VALID;

ALTER TABLE public.ai_chat_messages
  DROP CONSTRAINT IF EXISTS ai_chat_messages_content_not_blank;
ALTER TABLE public.ai_chat_messages
  ADD CONSTRAINT ai_chat_messages_content_not_blank
  CHECK (length(btrim(content)) > 0) NOT VALID;

DROP POLICY IF EXISTS "View ai chat" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Insert ai chat" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Delete ai chat" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Parent can view own companion chat" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Parent can add own companion chat" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Parent can delete own companion chat" ON public.ai_chat_messages;

CREATE POLICY "Parent can view own companion chat"
ON public.ai_chat_messages
FOR SELECT TO authenticated
USING (
  parent_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'parent'
  )
);

CREATE POLICY "Parent can add own companion chat"
ON public.ai_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  parent_id = auth.uid()
  AND created_by = auth.uid()
  AND role IN ('user', 'assistant')
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'parent'
  )
);

CREATE POLICY "Parent can delete own companion chat"
ON public.ai_chat_messages
FOR DELETE TO authenticated
USING (
  parent_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'parent'
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_parent_created_desc
ON public.ai_chat_messages(parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_parent_user_rate
ON public.ai_chat_messages(parent_id, created_at DESC)
WHERE role = 'user';

-- ---------------------------------------------------------------------------
-- Health Risk Check: enforce safe ranges for newly inserted data.
-- NOT VALID keeps the migration compatible with old rows while protecting new rows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.health_risk_assessments
  DROP CONSTRAINT IF EXISTS health_risk_score_range;
ALTER TABLE public.health_risk_assessments
  ADD CONSTRAINT health_risk_score_range
  CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100) NOT VALID;

ALTER TABLE public.health_risk_assessments
  DROP CONSTRAINT IF EXISTS health_risk_bp_order;
ALTER TABLE public.health_risk_assessments
  ADD CONSTRAINT health_risk_bp_order
  CHECK (
    bp_systolic IS NULL
    OR bp_diastolic IS NULL
    OR bp_systolic > bp_diastolic
  ) NOT VALID;

ALTER TABLE public.health_risk_assessments
  DROP CONSTRAINT IF EXISTS health_risk_oxygen_range;
ALTER TABLE public.health_risk_assessments
  ADD CONSTRAINT health_risk_oxygen_range
  CHECK (oxygen_level IS NULL OR oxygen_level BETWEEN 0 AND 100) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_health_risk_parent_created_desc
ON public.health_risk_assessments(parent_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Realtime refresh for both pages.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.health_risk_assessments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'health_risk_assessments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.health_risk_assessments;
  END IF;
END
$$;
