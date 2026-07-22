
ALTER TABLE public.elder_settings ADD COLUMN IF NOT EXISTS allow_child_vitals_input BOOLEAN NOT NULL DEFAULT false;
