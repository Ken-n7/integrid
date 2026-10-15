-- Update 1 (Oct 17): approved puzzles, research results, puzzle versions. For a project made with
-- the older schema.sql: paste into the Supabase SQL Editor and Run, once. (schema.sql already has it.)

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

-- Which puzzle each result was played on.
alter table public.attempts add column puzzle text check (length(puzzle) <= 16);

-- Same door as before, now keeping each result's puzzle version (older phones just send none).
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
