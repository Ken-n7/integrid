-- INTEGRID: enable deletion for signed-in teachers listed in public.admins.
-- Run once in this project's Supabase SQL Editor. Safe to run again.
-- This grants the action; it does not delete any students or change their records.
-- Existing ON DELETE CASCADE foreign keys remove attempts and research only when
-- a teacher explicitly confirms deleting that student in the app.
begin;
alter table public.students enable row level security;
do $$
begin
  if not exists (
    select from pg_policies
    where schemaname = 'public' and tablename = 'students' and policyname = 'admins delete students'
  ) then
    create policy "admins delete students" on public.students
      for delete to authenticated using (public.is_admin());
  end if;
end $$;
grant delete on public.students to authenticated;
commit;

-- Verify the permission and the admin-only row policy without deleting any data.
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'students' and cmd = 'DELETE';
select has_table_privilege('authenticated', 'public.students', 'DELETE') as teacher_role_can_delete;
