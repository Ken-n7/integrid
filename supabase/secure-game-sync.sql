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
