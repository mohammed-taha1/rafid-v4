-- Explicit deny policy documents that raw product events are never client-readable or client-writable.
create policy rafid_product_events_no_direct_client_access
  on public.rafid_product_events for all to anon,authenticated
  using(false) with check(false);

create index if not exists rafid_platform_admins_added_by_idx on public.rafid_platform_admins(added_by);
create index if not exists rafid_platform_admin_invites_created_by_idx on public.rafid_platform_admin_invites(created_by);
create index if not exists rafid_platform_admin_invites_accepted_by_idx on public.rafid_platform_admin_invites(accepted_by);
create index if not exists rafid_platform_admin_invites_revoked_by_idx on public.rafid_platform_admin_invites(revoked_by);
