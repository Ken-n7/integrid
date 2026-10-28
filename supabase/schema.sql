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
-- QA-04: validate reported offline gameplay and derive coin charges/rewards.
-- Existing records are preserved. These are client-reported activity measurements,
-- not independently verified proof of play. Run before deploying this update.
BEGIN;
CREATE SCHEMA IF NOT EXISTS integrid_private;
REVOKE ALL ON SCHEMA integrid_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS integrid_private.game_policy (
 level text NOT NULL, version text NOT NULL, position integer NOT NULL,
 previous text, mode text NOT NULL, hint_cost integer NOT NULL,
 hint_limit integer NOT NULL, bank jsonb NOT NULL,
 PRIMARY KEY(level,version)
);
ALTER TABLE integrid_private.game_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON integrid_private.game_policy FROM PUBLIC, anon, authenticated;
-- Fingerprints and banks of the shipped, locked researcher puzzles.
INSERT INTO integrid_private.game_policy VALUES
('relax-1','ac4c96bf',1,NULL,'relax',60,10,'[-100,-7,-11,-50,15,-5,14,25,-10,-11]'::jsonb),
('relax-2','f493db98',2,'relax-1','relax',60,10,'[-7,-14,-1,-7,21,-14,-16,-24,40,30]'::jsonb),
('relax-3','c314ee23',3,'relax-2','relax',60,10,'[-5,-24,2,-144,180,48,360,-2,192,30]'::jsonb),
('relax-4','29302f5d',4,'relax-3','relax',60,10,'[54,-6,40,-72,-9,-7,15,-30,24,-6]'::jsonb),
('expert-1','d8cc59ce',5,'relax-4','expert',120,2,'[9,-15,-6,-14,4,46,2,15,0,5]'::jsonb),
('expert-2','aab1365f',6,'expert-1','expert',120,2,'[4,-4,-2,-64,-32,160,63,-4,-28,9]'::jsonb),
('expert-3','14ad6c34',7,'expert-2','expert',120,2,'[28,4,-60,-17,45,-5,4,20,7,-14]'::jsonb),
('expert-4','e07095fa',8,'expert-3','expert',120,2,'[-18,-24,6,-14,-6,8,2,15,-30,-6]'::jsonb),
('expert-5','175c7d51',9,'expert-4','expert',120,2,'[3,-27,81,10,180,-135,9,-10,-12,36]'::jsonb),
('battle-1','ef0b70f1',10,'expert-5','battle',100,10,'[16,50,-18,24,48,-100,-48,8,6,-7]'::jsonb),
('battle-2','7c6b4fde',10,'expert-5','battle',100,10,'[-9,10,-120,-12,-30,-15,81,3,9,-72]'::jsonb),
('battle-3','4636cd6e',10,'expert-5','battle',100,10,'[-9,-27,-5,7,-15,10,-80,-160,140,60]'::jsonb)
ON CONFLICT(level,version) DO UPDATE SET position=excluded.position, previous=excluded.previous,
 mode=excluded.mode, hint_cost=excluded.hint_cost, hint_limit=excluded.hint_limit, bank=excluded.bank;

CREATE OR REPLACE FUNCTION public.integrid_sync(p_code text,p_pin text,p_attempts jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 me text:=upper(trim(p_code)); item jsonb; policy integrid_private.game_policy;
 existing public.attempts; attempt_id uuid; started timestamptz;
 secs integer; wrongs integer; hints_used integer; reported integer; gross integer; net integer;
 win boolean; first_win boolean; mistake_data jsonb; pair jsonb; puzzle_version text;
BEGIN
 -- This row lock makes first-win reward decisions serial across devices/batches.
 PERFORM 1 FROM public.students WHERE code=me AND pin=p_pin FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_attempts IS NULL OR jsonb_typeof(p_attempts)<>'array' THEN RAISE EXCEPTION 'Expected attempt array'; END IF;
 IF jsonb_array_length(p_attempts)>500 THEN RAISE EXCEPTION 'Too many attempts in one sync'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_attempts) WITH ORDINALITY a(value,n) ORDER BY (value->>'at')::timestamptz,n LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item->>'id' IS NULL OR item->>'at' IS NULL
     OR coalesce(item->>'result','') NOT IN ('win','lose','quit')
     OR jsonb_typeof(item->'seconds') IS DISTINCT FROM 'number'
     OR jsonb_typeof(item->'wrong') IS DISTINCT FROM 'number'
     OR jsonb_typeof(item->'hints') IS DISTINCT FROM 'number'
     OR jsonb_typeof(item->'coins') IS DISTINCT FROM 'number'
     THEN RAISE EXCEPTION 'Invalid game result'; END IF;
   IF EXISTS(SELECT FROM jsonb_each(item) a WHERE a.key IN ('seconds','wrong','hints','coins') AND a.value::text !~ '^-?[0-9]+$') THEN RAISE EXCEPTION 'Counters must be whole numbers'; END IF;
   attempt_id:=(item->>'id')::uuid; started:=(item->>'at')::timestamptz;
   secs:=(item->>'seconds')::integer; wrongs:=(item->>'wrong')::integer;
   hints_used:=(item->>'hints')::integer; reported:=(item->>'coins')::integer;
   mistake_data:=item->'mistakes'; win:=item->>'result'='win';
   SELECT * INTO policy FROM integrid_private.game_policy WHERE level=item->>'level'
     AND (item->>'puzzle' IS NULL OR version=item->>'puzzle') ORDER BY version LIMIT 1;
   IF policy.level IS NULL THEN RAISE EXCEPTION 'Unknown level or puzzle'; END IF;
   puzzle_version:=coalesce(item->>'puzzle',policy.version);
   IF secs NOT BETWEEN 0 AND 604800 OR wrongs NOT BETWEEN 0 AND 5 OR hints_used NOT BETWEEN 0 AND policy.hint_limit
     OR started<'2020-01-01'::timestamptz OR started>now()+interval '5 minutes'
     OR (win AND policy.mode<>'battle' AND (secs=0 OR wrongs>=5))
     OR (policy.mode<>'battle' AND item->>'result'='lose' AND wrongs<>5)
     OR (policy.mode<>'battle' AND item->>'result'='quit' AND wrongs>=5)
     THEN RAISE EXCEPTION 'Impossible game counters or timestamp'; END IF;
   IF jsonb_typeof(mistake_data) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid mistakes'; END IF;
   IF jsonb_array_length(mistake_data)<>wrongs THEN RAISE EXCEPTION 'Mistake count mismatch'; END IF;
   FOR pair IN SELECT value FROM jsonb_array_elements(mistake_data) LOOP
     IF jsonb_typeof(pair) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid mistake pair'; END IF;
     IF jsonb_array_length(pair)<>2 THEN RAISE EXCEPTION 'Invalid mistake pair'; END IF;
     IF jsonb_typeof(pair->0) IS DISTINCT FROM 'number' OR jsonb_typeof(pair->1) IS DISTINCT FROM 'number'
       OR (pair->>0) !~ '^-?[0-9]+$' OR (pair->>1) !~ '^-?[0-9]+$'
       OR pair->0=pair->1 OR NOT policy.bank @> jsonb_build_array(pair->0) OR NOT policy.bank @> jsonb_build_array(pair->1)
       THEN RAISE EXCEPTION 'Mistake is not from this puzzle bank'; END IF;
   END LOOP;
   SELECT * INTO existing FROM public.attempts WHERE id=attempt_id;
   IF existing.id IS NOT NULL THEN
     IF existing.student<>me OR existing.level<>policy.level OR existing.result<>item->>'result' OR existing.seconds<>secs
       OR existing.wrong<>wrongs OR existing.hints<>hints_used OR existing.mistakes<>mistake_data OR existing.played_at<>started
       OR coalesce(existing.puzzle,policy.version)<>puzzle_version THEN RAISE EXCEPTION 'Attempt ID already used'; END IF;
     CONTINUE;
   END IF;
   IF policy.previous IS NOT NULL AND NOT EXISTS(SELECT FROM public.attempts WHERE student=me AND level=policy.previous AND result='win') THEN RAISE EXCEPTION 'Previous level must be completed'; END IF;
   gross:=CASE WHEN NOT win OR policy.mode='battle' THEN 0
     WHEN policy.mode='expert' THEN CASE WHEN secs<=120 THEN 120 WHEN secs<=180 THEN 100 WHEN secs<=240 THEN 80 ELSE 60 END
     ELSE CASE WHEN secs<=60 THEN 60 WHEN secs<=120 THEN 40 WHEN secs<=180 THEN 30 WHEN secs<=240 THEN 20 ELSE 10 END END;
   -- Concurrent/offline clients may both report their first win; normalize the later
   -- accepted one to zero reward. Never trust an arbitrary client balance/reward.
   IF reported NOT IN (gross-hints_used*policy.hint_cost,-hints_used*policy.hint_cost) THEN RAISE EXCEPTION 'Invalid coin amount'; END IF;
   first_win:=NOT EXISTS(SELECT FROM public.attempts WHERE student=me AND level=policy.level AND result='win');
   net:=(CASE WHEN first_win THEN gross ELSE 0 END)-hints_used*policy.hint_cost;
   INSERT INTO public.attempts(id,student,level,result,seconds,wrong,hints,coins,mistakes,played_at,puzzle)
     VALUES(attempt_id,me,policy.level,item->>'result',secs,wrongs,hints_used,net,mistake_data,started,puzzle_version);
 END LOOP;
 RETURN jsonb_build_object(
   'attempts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'level',level,'result',result,'seconds',seconds,'wrong',wrong,'hints',hints,'coins',coins,'mistakes',mistakes,'at',played_at,'puzzle',puzzle) ORDER BY played_at,id) FROM public.attempts WHERE student=me),'[]'::jsonb),
   'ranking',coalesce((SELECT jsonb_agg(jsonb_build_object('level',level,'code',student,'seconds',seconds,'wrong',wrong,'puzzle',puzzle)) FROM (
     SELECT DISTINCT ON(student,level,puzzle) student,level,seconds,wrong,puzzle FROM public.attempts WHERE result='win' AND level LIKE 'expert-%' ORDER BY student,level,puzzle,seconds,wrong
   ) best),'[]'::jsonb)
 );
END $$;
REVOKE ALL ON FUNCTION public.integrid_sync(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integrid_sync(text,text,jsonb) TO anon,authenticated;
COMMIT;

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

-- QA-01: authenticated Battle transport. Run in INTEGRID before deploying this client.
-- No public Realtime topics are used. Student PINs authorize a narrow RPC only.
BEGIN;
CREATE SCHEMA IF NOT EXISTS integrid_private;
REVOKE ALL ON SCHEMA integrid_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS integrid_private.battle_rooms (
  room text PRIMARY KEY CHECK (room ~ '^[0-9]{4}$'),
  instance uuid NOT NULL UNIQUE,
  host uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  answers jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);
CREATE TABLE IF NOT EXISTS integrid_private.battle_members (
  instance uuid NOT NULL REFERENCES integrid_private.battle_rooms(instance) ON DELETE CASCADE,
  student text NOT NULL REFERENCES public.students(code) ON DELETE CASCADE,
  team integer NOT NULL,
  PRIMARY KEY(instance, student)
);
CREATE TABLE IF NOT EXISTS integrid_private.battle_events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  instance uuid NOT NULL REFERENCES integrid_private.battle_rooms(instance) ON DELETE CASCADE,
  team integer NOT NULL,
  student text NOT NULL REFERENCES public.students(code) ON DELETE CASCADE,
  message jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battle_events_room_seq_idx ON integrid_private.battle_events(instance, seq);
ALTER TABLE integrid_private.battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrid_private.battle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrid_private.battle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA integrid_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA integrid_private FROM PUBLIC, anon, authenticated;

-- Internal helper; no caller can execute it directly.
CREATE OR REPLACE FUNCTION integrid_private.battle_read(p_instance uuid, p_after bigint, p_team integer, p_host boolean)
RETURNS jsonb LANGUAGE sql SET search_path = '' AS $$
 SELECT jsonb_build_object(
   'snapshot', r.snapshot || jsonb_build_object('instance', r.instance, 'revision', r.revision),
   'events', coalesce((SELECT jsonb_agg(jsonb_build_object('seq', e.seq, 'group', e.team, 'message', e.message) ORDER BY e.seq)
     FROM (SELECT * FROM integrid_private.battle_events WHERE instance = p_instance AND seq > p_after AND (p_host OR team = p_team) ORDER BY seq LIMIT 200) e), '[]'::jsonb)
 ) FROM integrid_private.battle_rooms r WHERE r.instance = p_instance AND r.expires_at > now()
$$;
REVOKE ALL ON FUNCTION integrid_private.battle_read(uuid,bigint,integer,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.integrid_battle_host(p_room text, p_snapshot jsonb DEFAULT NULL, p_after bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r integrid_private.battle_rooms; answer_map jsonb; incoming uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Teacher access required' USING ERRCODE = '42501'; END IF;
 IF p_room IS NULL OR p_room !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Invalid room'; END IF;
 -- Serialize creation as well as updates of a four-digit room, including collisions.
 PERFORM pg_advisory_xact_lock(71101, p_room::integer);
 SELECT * INTO r FROM integrid_private.battle_rooms WHERE room = p_room FOR UPDATE;
 IF r.room IS NOT NULL AND r.host <> auth.uid() THEN
   IF r.expires_at > now() AND r.snapshot->>'state' <> 'done' THEN RAISE EXCEPTION 'Room code in use'; END IF;
   IF p_snapshot IS NULL THEN RAISE EXCEPTION 'Room belongs to another teacher' USING ERRCODE = '42501'; END IF;
 END IF;
 IF p_snapshot IS NOT NULL THEN
   incoming := (p_snapshot->>'instance')::uuid;
   IF incoming IS NULL OR coalesce(p_snapshot->>'puzzle','') NOT IN ('battle-1','battle-2','battle-3')
     OR coalesce(p_snapshot->>'state','') NOT IN ('lobby','live','done')
     OR jsonb_typeof(p_snapshot->'members') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_snapshot->'csv') IS DISTINCT FROM 'string'
     OR length(p_snapshot->>'csv') NOT BETWEEN 1 AND 4000
     OR jsonb_typeof(p_snapshot->'seconds') IS DISTINCT FROM 'number'
     OR (p_snapshot->>'seconds')::integer NOT BETWEEN 60 AND 3600
     OR (p_snapshot->>'state' <> 'lobby' AND jsonb_typeof(p_snapshot->'startedAt') IS DISTINCT FROM 'number')
     THEN RAISE EXCEPTION 'Invalid room snapshot'; END IF;
   IF jsonb_array_length(p_snapshot->'members') NOT BETWEEN 2 AND 8 THEN RAISE EXCEPTION 'Invalid group count'; END IF;
   IF r.room IS NOT NULL AND r.instance <> incoming THEN
     IF r.expires_at > now() AND r.snapshot->>'state' <> 'done' THEN RAISE EXCEPTION 'Room code in use'; END IF;
     DELETE FROM integrid_private.battle_rooms WHERE room = p_room;
     r := NULL;
   END IF;
   IF r.room IS NULL THEN
     IF p_snapshot->>'state' <> 'lobby' THEN RAISE EXCEPTION 'Create a lobby first'; END IF;
     SELECT coalesce(jsonb_object_agg((line.n-1)::text || ',' || (cell.n-1)::text, to_jsonb(substring(cell.token FROM 2)::bigint)), '{}'::jsonb)
     INTO answer_map
     FROM regexp_split_to_table(p_snapshot->>'csv', E'\r?\n') WITH ORDINALITY line(text,n)
     CROSS JOIN LATERAL (SELECT regexp_replace(translate(replace(replace(replace(t.text,'(',''),')',''),'"',''),'−–—','---'), '\s', '', 'g') AS token, t.n FROM string_to_table(line.text, ',') WITH ORDINALITY t(text,n)) cell
     WHERE cell.token ~ '^\?[-+]?[0-9]+$';
     IF answer_map = '{}'::jsonb THEN RAISE EXCEPTION 'Puzzle has no answer boxes'; END IF;
     INSERT INTO integrid_private.battle_rooms(room,instance,host,snapshot,answers) VALUES(p_room,incoming,auth.uid(),p_snapshot,answer_map);
   ELSE
     IF r.host <> auth.uid() THEN RAISE EXCEPTION 'Room belongs to another teacher' USING ERRCODE = '42501'; END IF;
     IF r.snapshot->>'csv' <> p_snapshot->>'csv' OR r.snapshot->>'puzzle' <> p_snapshot->>'puzzle'
       OR r.snapshot->>'seconds' <> p_snapshot->>'seconds' OR jsonb_array_length(r.snapshot->'members') <> jsonb_array_length(p_snapshot->'members')
       THEN RAISE EXCEPTION 'Room configuration is fixed'; END IF;
     IF (r.snapshot->>'state' = 'done' AND p_snapshot->>'state' <> 'done') OR (r.snapshot->>'state' = 'live' AND p_snapshot->>'state' = 'lobby') THEN RAISE EXCEPTION 'Stale room transition'; END IF;
     UPDATE integrid_private.battle_rooms SET snapshot=p_snapshot, revision=revision+1 WHERE room=p_room;
   END IF;
 END IF;
 SELECT * INTO r FROM integrid_private.battle_rooms WHERE room=p_room AND host=auth.uid();
 IF r.room IS NULL THEN RETURN NULL; END IF;
 RETURN integrid_private.battle_read(r.instance, greatest(0,p_after), NULL, true);
END $$;

CREATE OR REPLACE FUNCTION public.integrid_battle_watch(p_room text, p_code text, p_pin text, p_group integer DEFAULT NULL, p_after bigint DEFAULT 0, p_instance uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r integrid_private.battle_rooms; me text := upper(trim(p_code));
BEGIN
 IF NOT EXISTS(SELECT FROM public.students WHERE code=me AND pin=p_pin) THEN RAISE EXCEPTION 'Student access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM integrid_private.battle_rooms WHERE room=p_room AND expires_at>now();
 IF r.room IS NULL THEN RETURN NULL; END IF;
 IF p_instance IS NOT NULL AND p_instance<>r.instance THEN RAISE EXCEPTION 'Room has been replaced'; END IF;
 IF p_group IS NOT NULL AND NOT EXISTS(SELECT FROM integrid_private.battle_members WHERE instance=r.instance AND student=me AND team=p_group) THEN RAISE EXCEPTION 'Join your group first' USING ERRCODE='42501'; END IF;
 RETURN integrid_private.battle_read(r.instance,greatest(0,p_after),p_group,false);
END $$;

CREATE OR REPLACE FUNCTION public.integrid_battle_event(p_room text,p_instance uuid,p_code text,p_pin text,p_group integer,p_id uuid,p_message jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r integrid_private.battle_rooms; me text:=upper(trim(p_code)); kind text:=p_message->>'t'; member_team integer; m jsonb; wanted bigint; value bigint; wrong_count integer; previous integrid_private.battle_events;
BEGIN
 IF NOT EXISTS(SELECT FROM public.students WHERE code=me AND pin=p_pin) THEN RAISE EXCEPTION 'Student access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM integrid_private.battle_rooms WHERE room=p_room AND instance=p_instance AND expires_at>now() FOR UPDATE;
 IF r.room IS NULL THEN RAISE EXCEPTION 'Room unavailable'; END IF;
 IF p_id IS NULL OR p_group IS NULL OR p_group<0 OR p_group>=jsonb_array_length(r.snapshot->'members') THEN RAISE EXCEPTION 'Invalid group or event'; END IF;
 IF p_message->>'code' IS DISTINCT FROM me THEN RAISE EXCEPTION 'Sender mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM integrid_private.battle_events WHERE id=p_id;
 IF previous.id IS NOT NULL THEN
   IF previous.instance<>p_instance OR previous.student<>me OR previous.team<>p_group THEN RAISE EXCEPTION 'Event ID already used'; END IF;
   RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT team INTO member_team FROM integrid_private.battle_members WHERE instance=p_instance AND student=me;
 IF kind='join' THEN
   IF member_team=p_group THEN RETURN jsonb_build_object('ok',true); END IF;
   IF r.snapshot->>'state'<>'lobby' THEN RAISE EXCEPTION 'Group changes require a lobby'; END IF;
   INSERT INTO integrid_private.battle_members VALUES(p_instance,me,p_group) ON CONFLICT(instance,student) DO UPDATE SET team=excluded.team;
   m:=jsonb_build_object('t','join','code',me);
 ELSIF kind='leave' THEN
   IF member_team IS DISTINCT FROM p_group THEN RETURN jsonb_build_object('ok',true); END IF;
   -- Keep membership after Start: leaving/rejoining must not permit another group.
   IF r.snapshot->>'state'='lobby' THEN DELETE FROM integrid_private.battle_members WHERE instance=p_instance AND student=me; END IF;
   m:=jsonb_build_object('t','leave','code',me);
 ELSIF kind IN ('cell','wrong') THEN
   IF member_team IS DISTINCT FROM p_group THEN RAISE EXCEPTION 'Not your group' USING ERRCODE='42501'; END IF;
   IF r.snapshot->>'state'<>'live' OR (r.snapshot->>'startedAt')::numeric + (r.snapshot->>'seconds')::numeric*1000 <= extract(epoch FROM clock_timestamp())*1000 THEN RAISE EXCEPTION 'Round is not live'; END IF;
   IF NOT (r.answers ? (p_message->>'k')) OR jsonb_typeof(p_message->'value') IS DISTINCT FROM 'number' OR (p_message->>'value') !~ '^[-]?[0-9]+$' THEN RAISE EXCEPTION 'Submit an answer for a valid box'; END IF;
   wanted:=(r.answers->>(p_message->>'k'))::bigint; value:=(p_message->>'value')::bigint;
   SELECT count(*) INTO wrong_count FROM integrid_private.battle_events WHERE instance=p_instance AND team=p_group AND message->>'t'='wrong';
   IF wrong_count>=5 THEN RAISE EXCEPTION 'Group is out of hearts'; END IF;
   IF EXISTS(SELECT FROM integrid_private.battle_events WHERE instance=p_instance AND team=p_group AND message->>'t'='cell' AND message->>'k'=p_message->>'k') THEN RETURN jsonb_build_object('ok',true); END IF;
   IF (kind='cell') IS DISTINCT FROM (value=wanted) THEN RAISE EXCEPTION 'Answer does not match result'; END IF;
   IF kind='cell' THEN
     IF jsonb_typeof(p_message->'hint') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid hint'; END IF;
     m:=jsonb_build_object('t','cell','code',me,'k',p_message->>'k','value',value,'hint',p_message->'hint');
   ELSE
     IF coalesce(p_message->>'run','') !~ '^[a-f0-9-]{36}$' THEN RAISE EXCEPTION 'Invalid run'; END IF;
     SELECT count(*)+1 INTO wrong_count FROM integrid_private.battle_events WHERE instance=p_instance AND team=p_group AND student=me AND message->>'t'='wrong' AND message->>'run'=p_message->>'run';
     m:=jsonb_build_object('t','wrong','code',me,'wrong',wrong_count,'run',p_message->>'run','k',p_message->>'k','value',value);
   END IF;
 ELSE RAISE EXCEPTION 'Unknown event'; END IF;
 INSERT INTO integrid_private.battle_events(id,instance,team,student,message) VALUES(p_id,p_instance,p_group,me,m);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.integrid_battle_host(text,jsonb,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integrid_battle_watch(text,text,text,integer,bigint,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integrid_battle_event(text,uuid,text,text,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integrid_battle_host(text,jsonb,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.integrid_battle_watch(text,text,text,integer,bigint,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integrid_battle_event(text,uuid,text,text,integer,uuid,jsonb) TO anon, authenticated;
COMMIT;
