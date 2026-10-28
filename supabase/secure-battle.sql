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
