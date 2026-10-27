-- INTEGRID database. Paste all of it into the Supabase SQL Editor and press Run.
-- Safe to run again: on a project that already has INTEGRID it only adds what's missing
-- (Oct 17: approved puzzles, research results, each result's puzzle version) and updates the
-- sync function. It never deletes anything.
--
-- Students never get a database login: the app calls integrid_sync() with their code + PIN.
-- Admins sign in with email + password and must be listed in public.admins:
--   insert into public.admins (uid) select id from auth.users where email = '<admin email>';

create table if not exists public.admins (
  uid uuid primary key references auth.users on delete cascade
);

create table if not exists public.students (
  code text primary key check (code ~ '^[A-Z0-9-]{1,12}$'),
  pin text not null check (pin ~ '^[0-9]{4}$'), -- shown to admins so they can reprint slips
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key, -- made on the phone, so re-sending the same attempt is harmless
  student text not null references public.students on delete cascade,
  level text not null check (length(level) <= 20),
  result text not null check (result in ('win', 'lose', 'quit')),
  seconds int not null check (seconds >= 0),
  wrong int not null check (wrong >= 0),
  hints int not null check (hints >= 0),
  coins int not null, -- reward minus hint costs
  mistakes jsonb not null default '[]', -- [[answer, placed], …]
  played_at timestamptz not null,
  synced_at timestamptz not null default now()
);
-- which puzzle each result was played on (a swapped puzzle starts a new ranking)
alter table public.attempts add column if not exists puzzle text check (length(puzzle) <= 16);
create index if not exists attempts_student_idx on public.attempts (student);

-- Puzzles the researchers approved on the admin page (Puzzles tab). Phones load these; a level
-- without one uses the built-in file.
create table if not exists public.puzzles (
  level text primary key check (length(level) <= 20),
  csv text not null check (length(csv) <= 4000),
  version text not null check (length(version) <= 16), -- fingerprint saved with every result
  approved_at timestamptz not null default now(),
  approved_by uuid default auth.uid() references auth.users on delete set null
);

-- The paper's instrument, typed in from the paper forms (Research tab): Part I test before and
-- after (20 right/wrong items each) and the Part II survey (20 answers, 1–4). Admins only.
create table if not exists public.research (
  student text primary key references public.students on delete cascade,
  pre jsonb,
  post jsonb,
  survey jsonb,
  updated_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.students enable row level security;
alter table public.attempts enable row level security;
alter table public.puzzles enable row level security;
alter table public.research enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where uid = auth.uid())
$$;

-- Who may do what. Each rule is added only if it isn't there yet, so this file can run again.
do $$
declare
  rule text[];
begin
  foreach rule slice 1 in array array[
    ['admins', 'admins see themselves', 'for select to authenticated using (uid = auth.uid())'],
    ['students', 'admins read students', 'for select to authenticated using (public.is_admin())'],
    ['students', 'admins add students', 'for insert to authenticated with check (public.is_admin())'],
    ['students', 'admins delete students', 'for delete to authenticated using (public.is_admin())'],
    ['attempts', 'admins read attempts', 'for select to authenticated using (public.is_admin())'],
    ['puzzles', 'everyone reads puzzles', 'for select to anon, authenticated using (true)'],
    ['puzzles', 'admins add puzzles', 'for insert to authenticated with check (public.is_admin())'],
    ['puzzles', 'admins replace puzzles', 'for update to authenticated using (public.is_admin()) with check (public.is_admin())'],
    ['research', 'admins read research', 'for select to authenticated using (public.is_admin())'],
    ['research', 'admins add research', 'for insert to authenticated with check (public.is_admin())'],
    ['research', 'admins edit research', 'for update to authenticated using (public.is_admin()) with check (public.is_admin())']
  ] loop
    if not exists (select from pg_policies where schemaname = 'public' and tablename = rule[1] and policyname = rule[2]) then
      execute format('create policy %I on public.%I %s', rule[2], rule[1], rule[3]);
    end if;
  end loop;
end $$;

revoke all on public.admins, public.students, public.attempts, public.research from anon;
grant select on public.admins, public.attempts to authenticated;
grant select, insert, delete on public.students to authenticated;
grant select on public.puzzles to anon, authenticated;
grant insert, update on public.puzzles to authenticated;
grant select, insert, update on public.research to authenticated;

-- The students' only door: check the PIN, store new attempts, and send back the student's
-- full history (so they can switch phones) plus everyone's best Expert times (the ranking,
-- best per puzzle version). Returns null when the code or PIN is wrong.
-- ponytail: no lockout after wrong PINs (4 digits, codes only, no names); add a counter if it's ever abused.
create or replace function public.integrid_sync(p_code text, p_pin text, p_attempts jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me text := upper(trim(p_code));
begin
  if not exists (select 1 from public.students where code = me and pin = p_pin) then
    return null;
  end if;
  if jsonb_array_length(p_attempts) > 500 then
    raise exception 'too many attempts in one sync';
  end if;

  insert into public.attempts (id, student, level, result, seconds, wrong, hints, coins, mistakes, played_at, puzzle)
  select a.id, me, a.level, a.result, a.seconds, a.wrong, a.hints, a.coins, coalesce(a.mistakes, '[]'), a.at, a.puzzle
  from jsonb_to_recordset(p_attempts) as a(
    id uuid, level text, result text, seconds int, wrong int, hints int, coins int, mistakes jsonb, at timestamptz, puzzle text
  )
  on conflict (id) do nothing;

  return jsonb_build_object(
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'level', level, 'result', result, 'seconds', seconds, 'wrong', wrong,
        'hints', hints, 'coins', coins, 'mistakes', mistakes, 'at', played_at, 'puzzle', puzzle) order by played_at)
      from public.attempts where student = me), '[]'),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object('level', level, 'code', student, 'seconds', seconds, 'wrong', wrong, 'puzzle', puzzle))
      from (
        select distinct on (student, level, puzzle) student, level, seconds, wrong, puzzle
        from public.attempts
        where result = 'win' and level like 'expert-%'
        order by student, level, puzzle, seconds, wrong
      ) best), '[]')
  );
end $$;

revoke all on function public.integrid_sync(text, text, jsonb) from public;
grant execute on function public.integrid_sync(text, text, jsonb) to anon, authenticated;

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

-- Onboarding practice (also available as enable-practice-results.sql).
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
