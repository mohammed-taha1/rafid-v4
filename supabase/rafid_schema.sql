-- رافد V4.3: مساحة واحدة محفوظة لكل مستخدم.
-- شغّل الملف كاملًا مرة واحدة من Supabase > SQL Editor.

create table if not exists public.rafid_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint rafid_workspace_is_object check (jsonb_typeof(workspace) = 'object'),
  constraint rafid_workspace_size_limit check (octet_length(workspace::text) <= 1500000)
);

alter table public.rafid_workspaces enable row level security;
alter table public.rafid_workspaces force row level security;

revoke all on table public.rafid_workspaces from anon;
grant select, insert, update, delete on table public.rafid_workspaces to authenticated;

drop policy if exists "rafid_select_own_workspace" on public.rafid_workspaces;
create policy "rafid_select_own_workspace"
on public.rafid_workspaces
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "rafid_insert_own_workspace" on public.rafid_workspaces;
create policy "rafid_insert_own_workspace"
on public.rafid_workspaces
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "rafid_update_own_workspace" on public.rafid_workspaces;
create policy "rafid_update_own_workspace"
on public.rafid_workspaces
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "rafid_delete_own_workspace" on public.rafid_workspaces;
create policy "rafid_delete_own_workspace"
on public.rafid_workspaces
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.rafid_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rafid_workspaces_set_updated_at on public.rafid_workspaces;
create trigger rafid_workspaces_set_updated_at
before update on public.rafid_workspaces
for each row execute function public.rafid_set_updated_at();
