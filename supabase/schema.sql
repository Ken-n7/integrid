-- INTEGRID database. Run once in the Supabase SQL Editor on an empty project.
--
-- Students never get a database login: the app calls integrid_sync() with their code + PIN.
-- Admins sign in with email + password and must be listed in public.admins:
--   insert into public.admins (uid) select id from auth.users where email = '<admin email>';

create table public.admins (
  uid uuid primary key references auth.users on delete cascade
);

create table public.students (
  code text primary key check (code ~ '^[A-Z0-9-]{1,12}$'),
  pin text not null check (pin ~ '^[0-9]{4}$'), -- shown to admins so they can reprint slips
  created_at timestamptz not null default now()
);

create table public.attempts (
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
  synced_at timestamptz not null default now(),
  puzzle text check (length(puzzle) <= 16) -- which puzzle version was played (approved puzzles change it)
);
create index on public.attempts (student);

alter table public.admins enable row level security;
alter table public.students enable row level security;
alter table public.attempts enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where uid = auth.uid())
$$;

create policy "admins see themselves" on public.admins for select to authenticated using (uid = auth.uid());
create policy "admins read students" on public.students for select to authenticated using (public.is_admin());
create policy "admins add students" on public.students for insert to authenticated with check (public.is_admin());
create policy "admins read attempts" on public.attempts for select to authenticated using (public.is_admin());

revoke all on public.admins, public.students, public.attempts from anon;
grant select on public.admins, public.attempts to authenticated;
grant select, insert on public.students to authenticated;

-- Puzzles the researchers approved on the admin page (Puzzles tab). Phones load these; a level
-- without one uses the built-in file.
create table public.puzzles (
  level text primary key check (length(level) <= 20),
  csv text not null check (length(csv) <= 4000),
  version text not null check (length(version) <= 16), -- fingerprint saved with every result
  approved_at timestamptz not null default now(),
  approved_by uuid default auth.uid() references auth.users on delete set null
);
alter table public.puzzles enable row level security;
create policy "everyone reads puzzles" on public.puzzles for select to anon, authenticated using (true);
create policy "admins add puzzles" on public.puzzles for insert to authenticated with check (public.is_admin());
create policy "admins replace puzzles" on public.puzzles for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.puzzles to anon, authenticated;
grant insert, update on public.puzzles to authenticated;

-- The paper's instrument, typed in from the paper forms (Research tab): Part I test before and
-- after (20 right/wrong items each) and the Part II survey (20 answers, 1–4). Admins only.
create table public.research (
  student text primary key references public.students on delete cascade,
  pre jsonb,
  post jsonb,
  survey jsonb,
  updated_at timestamptz not null default now()
);
alter table public.research enable row level security;
create policy "admins read research" on public.research for select to authenticated using (public.is_admin());
create policy "admins add research" on public.research for insert to authenticated with check (public.is_admin());
create policy "admins edit research" on public.research for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.research from anon;
grant select, insert, update on public.research to authenticated;

-- The students' only door: check the PIN, store new attempts, and send back the student's
-- full history (so they can switch phones) plus everyone's best Expert times (the ranking).
-- Returns null when the code or PIN is wrong.
-- ponytail: no lockout after wrong PINs (4 digits, codes only, no names); add a counter if it's ever abused.
create function public.integrid_sync(p_code text, p_pin text, p_attempts jsonb default '[]')
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
