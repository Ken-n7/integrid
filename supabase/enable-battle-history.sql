-- INTEGRID: shared, teacher-only Battle History. Safe to run again.
-- This creates storage for NEW rounds; it does not change existing student results.
BEGIN;
CREATE TABLE IF NOT EXISTS public.battle_history (
  id uuid PRIMARY KEY,
  host_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  room text NOT NULL CHECK (room ~ '^[0-9]{4}$'),
  puzzle text NOT NULL CHECK (puzzle IN ('battle-1', 'battle-2', 'battle-3')),
  puzzle_title text NOT NULL CHECK (length(puzzle_title) BETWEEN 1 AND 160),
  puzzle_version text NOT NULL CHECK (length(puzzle_version) <= 16),
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz NOT NULL,
  time_limit_seconds integer NOT NULL CHECK (time_limit_seconds BETWEEN 60 AND 3600),
  elapsed_seconds integer NOT NULL CHECK (elapsed_seconds BETWEEN 0 AND time_limit_seconds),
  total_boxes integer NOT NULL CHECK (total_boxes BETWEEN 1 AND 1000),
  outcome text NOT NULL CHECK (outcome IN ('completed', 'time_up', 'ended', 'cancelled')),
  groups jsonb NOT NULL CHECK (jsonb_typeof(groups) = 'array' AND jsonb_array_length(groups) BETWEEN 2 AND 8)
);
CREATE INDEX IF NOT EXISTS battle_history_ended_idx ON public.battle_history (ended_at DESC, id);
ALTER TABLE public.battle_history ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'battle_history' AND policyname = 'admins read battle history') THEN
    CREATE POLICY "admins read battle history" ON public.battle_history
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'battle_history' AND policyname = 'admins archive their battles') THEN
    CREATE POLICY "admins archive their battles" ON public.battle_history
      FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND host_id = auth.uid());
  END IF;
END;
$$;
REVOKE ALL ON public.battle_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.battle_history TO authenticated;
COMMIT;
