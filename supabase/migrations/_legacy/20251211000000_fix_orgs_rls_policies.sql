-- Fix RLS policies for org_members and orgs
-- Drop all existing policies to avoid conflicts

-- Drop ALL policies on org_members
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'org_members'
  loop
    execute format('drop policy if exists %I on public.org_members;', p.policyname);
  end loop;
end $$;

-- Drop ALL policies on orgs (recommended)
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'orgs'
  loop
    execute format('drop policy if exists %I on public.orgs;', p.policyname);
  end loop;
end $$;

-- Ensure RLS enabled
alter table public.org_members enable row level security;
alter table public.orgs enable row level security;

-- SAFE org_members policies (NO self references)
create policy "org_members_select_own_rows"
on public.org_members
for select
using (user_id = auth.uid());

create policy "org_members_insert_own_rows"
on public.org_members
for insert
with check (user_id = auth.uid());

-- SAFE orgs policy (depends on org_members, which is safe now)
create policy "orgs_select_if_member"
on public.orgs
for select
using (
  exists (
    select 1
    from public.org_members m
    where m.org_id = orgs.id
      and m.user_id = auth.uid()
  )
);

