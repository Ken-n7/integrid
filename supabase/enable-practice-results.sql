-- Five-question onboarding practice only. Does not modify the Research instrument.
-- Paste this entire file into INTEGRID's Supabase SQL Editor. Safe to run again.
BEGIN;
CREATE TABLE IF NOT EXISTS public.practice_results (
  id uuid PRIMARY KEY,
  student text NOT NULL REFERENCES public.students(code) ON DELETE CASCADE,
  version text NOT NULL CHECK (length(version) BETWEEN 1 AND 40),
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'array' AND jsonb_array_length(answers) = 5),
  correct jsonb NOT NULL CHECK (jsonb_typeof(correct) = 'array' AND jsonb_array_length(correct) = 5),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 5),
  total integer NOT NULL DEFAULT 5 CHECK (total = 5),
  started_at timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL CHECK (submitted_at >= started_at),
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_results_student_time_idx ON public.practice_results(student, submitted_at, id);
ALTER TABLE public.practice_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'practice_results' AND policyname = 'admins read practice') THEN
    CREATE POLICY "admins read practice" ON public.practice_results FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;
REVOKE ALL ON public.practice_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_results TO authenticated;

-- Students use code/PIN rather than Supabase Auth. This narrow definer function is
-- their only access: verifies ownership, derives marks, and makes retries harmless.
CREATE OR REPLACE FUNCTION public.integrid_practice_sync(p_code text, p_pin text, p_results jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me text := upper(trim(p_code));
  item jsonb;
  marks jsonb;
  points integer;
  saved public.practice_results;
BEGIN
  IF NOT EXISTS (SELECT FROM public.students WHERE code = me AND pin = p_pin) THEN RETURN NULL; END IF;
  IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN RAISE EXCEPTION 'Expected practice array'; END IF;
  IF jsonb_array_length(p_results) > 100 THEN RAISE EXCEPTION 'Practice batch too large'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    IF item->>'version' IS DISTINCT FROM 'integer-rules-v1'
      OR jsonb_typeof(item->'answers') IS DISTINCT FROM 'array'
      OR item->>'id' IS NULL OR item->>'started_at' IS NULL OR item->>'submitted_at' IS NULL
      THEN RAISE EXCEPTION 'Invalid practice result'; END IF;
    IF jsonb_array_length(item->'answers') <> 5 THEN RAISE EXCEPTION 'Expected five answers'; END IF;
    IF EXISTS (SELECT FROM jsonb_array_elements(item->'answers') a WHERE jsonb_typeof(a) <> 'number' OR a::text !~ '^[0-3]$') THEN RAISE EXCEPTION 'Invalid practice choice'; END IF;
    SELECT jsonb_agg(a.value = key.value ORDER BY a.ordinality), count(*) FILTER (WHERE a.value = key.value)::integer
      INTO marks, points
      FROM jsonb_array_elements(item->'answers') WITH ORDINALITY a(value, ordinality)
      JOIN jsonb_array_elements('[1,2,1,1,0]'::jsonb) WITH ORDINALITY key(value, ordinality) USING (ordinality);
    INSERT INTO public.practice_results(id, student, version, answers, correct, score, started_at, submitted_at)
      VALUES ((item->>'id')::uuid, me, item->>'version', item->'answers', marks, points, (item->>'started_at')::timestamptz, (item->>'submitted_at')::timestamptz)
      ON CONFLICT (id) DO NOTHING;
    SELECT * INTO saved FROM public.practice_results WHERE id = (item->>'id')::uuid;
    IF saved.student <> me OR saved.version <> item->>'version' OR saved.answers <> item->'answers'
      OR saved.started_at <> (item->>'started_at')::timestamptz OR saved.submitted_at <> (item->>'submitted_at')::timestamptz
      THEN RAISE EXCEPTION 'Practice ID already used'; END IF;
  END LOOP;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'version', version, 'answers', answers, 'correct', correct,
    'score', score, 'total', total, 'started_at', started_at, 'submitted_at', submitted_at
  ) ORDER BY submitted_at, id), '[]'::jsonb) FROM public.practice_results WHERE student = me);
END $$;
REVOKE ALL ON FUNCTION public.integrid_practice_sync(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integrid_practice_sync(text, text, jsonb) TO anon, authenticated;
COMMIT;
